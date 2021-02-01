import {
  CACHE_KEYWORD,
  CIRCLE_ACTION,
  CIRCLE_STATE,
  NODE_TYPES,
} from 'common/enums'
import {
  AuthenticationError,
  CircleNotFoundError,
  ForbiddenError,
  UserInputError,
} from 'common/errors'
import { fromGlobalId } from 'common/utils'
import { MutationToToggleFollowCircleResolver } from 'definitions'

// local enums
enum ACTION {
  follow = 'follow',
  unfollow = 'unfollow',
}

const resolver: MutationToToggleFollowCircleResolver = async (
  root,
  { input: { id, enabled } },
  { viewer, dataSources: { atomService, systemService } }
) => {
  if (!viewer.id) {
    throw new AuthenticationError('visitor has no permission')
  }
  if (typeof enabled !== 'boolean') {
    throw new UserInputError('parameter "enabled" is required')
  }

  // check feature is enabled or not
  const feature = await systemService.getFeatureFlag('circle_interact')
  if (
    feature &&
    !(await systemService.isFeatureEnabled(feature.flag, viewer))
  ) {
    throw new ForbiddenError('viewer has no permission')
  }

  const action = enabled ? ACTION.follow : ACTION.unfollow
  const { id: circleId } = fromGlobalId(id || '')
  const circle = await atomService.findFirst({
    table: 'circle',
    where: { id: circleId, state: CIRCLE_STATE.active },
  })

  if (!circle) {
    throw new CircleNotFoundError(`ciircle ${circleId} not found`)
  }

  switch (action) {
    case ACTION.follow: {
      const hasFollow = await atomService.count({
        table: 'action_circle',
        where: {
          action: CIRCLE_ACTION.follow,
          userId: viewer.id,
          targetId: circleId,
        },
      })

      if (hasFollow === 0) {
        await atomService.create({
          table: 'action_circle',
          data: {
            action: CIRCLE_ACTION.follow,
            userId: viewer.id,
            targetId: circleId,
          },
        })
      }
      break
    }
    case ACTION.unfollow: {
      await atomService.deleteMany({
        table: 'action_circle',
        where: {
          action: CIRCLE_ACTION.follow,
          userId: viewer.id,
          targetId: circleId,
        },
      })
      break
    }
  }

  // invalidate cache
  circle[CACHE_KEYWORD] = [
    {
      id: viewer.id,
      type: NODE_TYPES.user,
    },
  ]

  return circle
}

export default resolver
