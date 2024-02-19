import type { GQLOssResolvers } from 'definitions'

import { connectionFromPromisedArray, fromConnectionArgs } from 'common/utils'

export const articles: GQLOssResolvers['articles'] = async (
  _,
  { input },
  { dataSources: { articleService } }
) => {
  const { take, skip } = fromConnectionArgs(input)

  const [totalCount, items] = await Promise.all([
    articleService.baseCount(),
    articleService.baseFind({ skip, take }),
  ])
  return connectionFromPromisedArray(items, input, totalCount)
}
