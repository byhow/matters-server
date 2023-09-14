import type { GQLArticleResolvers, Item, Draft } from 'definitions'

import { ARTICLE_STATE } from 'common/enums'
import { connectionFromPromisedArray, fromConnectionArgs } from 'common/utils'

const resolver: GQLArticleResolvers['collection'] = async (
  { articleId },
  { input },
  {
    dataSources: {
      articleService,
      connections: { knex },
    },
  }
) => {
  const { take, skip } = fromConnectionArgs(input, { allowTakeAll: true })

  const [countRecord, connections] = await Promise.all([
    knex('article_connection')
      .countDistinct('article_id', 'state')
      .innerJoin('article', 'article.id', 'article_id')
      .where({ entranceId: articleId, state: ARTICLE_STATE.active })
      .first(),
    articleService.findConnections({
      entranceId: articleId,
      take,
      skip,
    }),
  ])

  const totalCount = parseInt(
    countRecord ? (countRecord.count as string) : '0',
    10
  )

  return connectionFromPromisedArray(
    articleService.loadDraftsByArticles(
      connections.map((connection: Item) => connection.articleId)
    ) as Promise<Draft[]>,
    input,
    totalCount
  )
}

export default resolver
