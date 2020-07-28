import { invalidateFQC } from '@matters/apollo-response-cache'

import { NODE_TYPES, USER_STATE } from 'common/enums'
import { ActionFailedError, UserInputError } from 'common/errors'
import { fromGlobalId, getPunishExpiredDate } from 'common/utils'
import { CacheService } from 'connectors'
import { userQueue } from 'connectors/queue'
import { MutationToUpdateUserStateResolver, User } from 'definitions'

// manually invalidate cache since it returns nothing
const invalidateUsers = async (users: User[]) => {
  const cacheService = new CacheService()
  await Promise.all(
    users.map(({ id }) =>
      invalidateFQC({
        node: { type: NODE_TYPES.user, id },
        redis: cacheService.redis,
      })
    )
  )
}

const resolver: MutationToUpdateUserStateResolver = async (
  _,
  { input: { id, state, banDays, password, emails } },
  { viewer, dataSources: { userService, notificationService } }
) => {
  // handlers for cleanup and notification
  const handleBan = async (userId: string) => {
    // trigger notification
    notificationService.trigger({
      event: 'user_banned',
      recipientId: userId,
    })

    // insert record into punish_record
    if (typeof banDays === 'number') {
      const expiredAt = getPunishExpiredDate(banDays)
      await userService.baseCreate(
        {
          userId,
          state,
          expiredAt,
        },
        'punish_record'
      )
    }
  }

  // clean up punish recods if team manually recover it from ban
  const handleUnban = (userId: string) =>
    userService.archivePunishRecordsByUserId({
      userId,
      state: USER_STATE.banned,
    })

  const isArchived = state === USER_STATE.archived

  /**
   * Batch update with email array
   */
  if (emails && emails.length > 0) {
    if (isArchived) {
      throw new UserInputError('Cannot archive users in batch')
    }

    const updatedUsers = await userService.knex
      .whereIn('email', emails)
      .update({ state })
      .into(userService.table)
      .returning('*')
      .then((users) =>
        users.map((batchUpdatedUser) => {
          const { id: userId } = batchUpdatedUser
          if (state === USER_STATE.banned) {
            handleBan(userId)
          }

          return batchUpdatedUser
        })
      )

    await invalidateUsers(updatedUsers)
    return updatedUsers
  }

  if (!id) {
    throw new UserInputError('need to provide `id` or `emails`')
  }

  const { id: dbId } = fromGlobalId(id)
  const user = await userService.dataloader.load(dbId)

  // check to prevent unarchiving user
  if (
    user.state === USER_STATE.archived ||
    (state === USER_STATE.banned && user.state === USER_STATE.banned)
  ) {
    throw new ActionFailedError(`user has already been ${state}`)
  }

  /**
   * Archive
   */
  if (isArchived) {
    // verify password if target state is `archived`
    if (!password || !viewer.id) {
      throw new UserInputError('`password` is required for archiving user')
    } else {
      await userService.verifyPassword({ password, hash: viewer.passwordHash })
    }

    // sync
    const archivedUser = await userService.archive(dbId)

    // async
    userQueue.archiveUser({ userId: archivedUser.id })

    notificationService.mail.sendUserDeletedByAdmin({
      to: user.email,
      recipient: {
        displayName: user.displayName,
      },
      language: user.language,
    })

    await invalidateUsers([archivedUser])
    return [archivedUser]
  }

  /**
   * active, banned, frozen
   */
  const updatedUser = await userService.updateInfo(dbId, {
    state,
  })

  if (state === USER_STATE.banned) {
    handleBan(updatedUser.id)
  } else if (state !== user.state && user.state === USER_STATE.banned) {
    handleUnban(updatedUser.id)
  }

  await invalidateUsers([updatedUser])
  return [updatedUser]
}

export default resolver
