import type { GQLMutationResolvers } from 'definitions'

import { COMMENT_TYPE, USER_STATE } from 'common/enums'
import { ForbiddenByStateError, ForbiddenError } from 'common/errors'
import { fromGlobalId } from 'common/utils'

const resolver: GQLMutationResolvers['unvoteComment'] = async (
  _,
  { input: { id } },
  {
    viewer,
    dataSources: {
      atomService,
      articleService,
      paymentService,
      commentService,
    },
  }
) => {
  if (!viewer.userName) {
    throw new ForbiddenError('user has no username')
  }

  const { id: dbId } = fromGlobalId(id)
  const comment = await commentService.loadById(dbId)

  // check target
  let article: any
  let circle: any
  let targetAuthor: any
  if (comment.type === COMMENT_TYPE.article) {
    article = await articleService.loadById(comment.targetId)
    targetAuthor = article.authorId
  } else {
    circle = await atomService.circleIdLoader.load(comment.targetId)
    targetAuthor = circle.owner
  }

  // check permission
  const isTargetAuthor = targetAuthor === viewer.id
  const isInactive = [
    USER_STATE.banned,
    USER_STATE.archived,
    USER_STATE.frozen,
  ].includes(viewer.state)

  if (isInactive) {
    throw new ForbiddenByStateError(`${viewer.state} user has no permission`)
  }

  if (circle && !isTargetAuthor) {
    const isCircleMember = await paymentService.isCircleMember({
      userId: viewer.id,
      circleId: circle.id,
    })

    if (!isCircleMember) {
      throw new ForbiddenError('only circle members have the permission')
    }
  }

  await commentService.unvote({ commentId: dbId, userId: viewer.id })

  return comment
}

export default resolver
