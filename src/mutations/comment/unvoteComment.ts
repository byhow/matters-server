import {
  COMMENT_TYPE,
  PRICE_STATE,
  SUBSCRIPTION_STATE,
  USER_STATE,
} from 'common/enums'
import {
  AuthenticationError,
  ForbiddenByStateError,
  ForbiddenError,
} from 'common/errors'
import { fromGlobalId } from 'common/utils'
import { MutationToUnvoteCommentResolver } from 'definitions'

const resolver: MutationToUnvoteCommentResolver = async (
  _,
  { input: { id } },
  { viewer, dataSources: { atomService, articleService, commentService }, knex }
) => {
  if (!viewer.id) {
    throw new AuthenticationError('visitor has no permission')
  }

  const { id: dbId } = fromGlobalId(id)
  const comment = await commentService.dataloader.load(dbId)

  // check target
  let article: any
  let circle: any
  let targetAuthor: any
  if (comment.type === COMMENT_TYPE.article) {
    article = await articleService.dataloader.load(comment.targetId)
    targetAuthor = article.authorId
  } else {
    circle = await atomService.circleIdLoader.load(comment.targetId)
    targetAuthor = circle.owner
  }

  // check permission
  const isTargetAuthor = targetAuthor === viewer.id
  const isOnboarding = viewer.state === USER_STATE.onboarding
  const isInactive = [
    USER_STATE.banned,
    USER_STATE.archived,
    USER_STATE.frozen,
  ].includes(viewer.state)

  if ((isOnboarding && !isTargetAuthor) || isInactive) {
    throw new ForbiddenByStateError(`${viewer.state} user has no permission`)
  }

  if (circle && !isTargetAuthor) {
    const records = await knex
      .select()
      .from('circle_subscription_item as csi')
      .join('circle_price', 'circle_price.id', 'csi.price_id')
      .join('circle_subscription as cs', 'cs.id', 'csi.subscription_id')
      .where({
        'csi.user_id': viewer.id,
        'csi.archived': false,
        'circle_price.circle_id': circle.id,
        'circle_price.state': PRICE_STATE.active,
      })
      .whereIn('cs.state', [
        SUBSCRIPTION_STATE.active,
        SUBSCRIPTION_STATE.trialing,
      ])
    const isCircleMember = records && records.length > 0

    if (!isCircleMember) {
      throw new ForbiddenError('only circle members have the permission')
    }
  }

  await commentService.unvote({ commentId: dbId, userId: viewer.id })

  return comment
}

export default resolver
