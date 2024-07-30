import type { GQLMutationResolvers } from 'definitions'

import { NOTICE_TYPE } from 'common/enums'
import { AuthenticationError, UserInputError } from 'common/errors'
import { fromGlobalId } from 'common/utils'

export const likeMoment: GQLMutationResolvers['likeMoment'] = async (
  _,
  { input: { id: globalId } },
  { viewer, dataSources: { momentService, atomService, notificationService } }
) => {
  if (!viewer.id) {
    throw new AuthenticationError('visitor has no permission')
  }
  const { id, type } = fromGlobalId(globalId)

  if (type !== 'Moment') {
    throw new UserInputError('invalid id')
  }
  await momentService.like(id, viewer)

  const moment = await atomService.momentIdLoader.load(id)

  notificationService.trigger({
    event: NOTICE_TYPE.moment_liked,
    actorId: viewer.id,
    recipientId: moment.authorId,
    entities: [{ type: 'target', entityTable: 'moment', entity: moment }],
    tag: `${NOTICE_TYPE.moment_liked}:${viewer.id}:${id}`,
  })

  return moment
}

export const unlikeMoment: GQLMutationResolvers['unlikeMoment'] = async (
  _,
  { input: { id: globalId } },
  { viewer, dataSources: { momentService, atomService, notificationService } }
) => {
  if (!viewer.id) {
    throw new AuthenticationError('visitor has no permission')
  }
  const { id, type } = fromGlobalId(globalId)

  if (type !== 'Moment') {
    throw new UserInputError('invalid id')
  }
  await momentService.unlike(id, viewer)
  notificationService.cancel(`${NOTICE_TYPE.moment_liked}:${viewer.id}:${id}`)

  return atomService.momentIdLoader.load(id)
}
