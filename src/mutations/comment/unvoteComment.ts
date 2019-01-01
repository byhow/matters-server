import { Resolver, Context } from 'definitions'
import { fromGlobalId } from 'common/utils'

const resolver: Resolver = async (
  _,
  { input: { id } },
  {
    viewer,
    dataSources: { articleService, commentService, notificationService }
  }: Context
) => {
  if (!viewer.id) {
    throw new Error('anonymous user cannot do this') // TODO
  }

  const { id: dbId } = fromGlobalId(id)

  // check is voted before
  const voted = await commentService.findVotesByUserId({
    userId: viewer.id,
    commentId: dbId
  })
  if (!voted || voted.length <= 0) {
    throw new Error('no voted before')
  }

  await commentService.unvote({ commentId: dbId, userId: viewer.id })
  const comment = await commentService.dataloader.load(dbId)
  const article = await articleService.dataloader.load(comment.articleId)

  // trigger notifications
  notificationService.trigger({
    event: 'article_updated',
    entities: [
      {
        type: 'target',
        entityTable: 'article',
        entity: article
      }
    ]
  })

  return comment
}

export default resolver
