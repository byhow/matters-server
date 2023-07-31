import {
  ArticleOSSToBoostResolver,
  ArticleOSSToInRecommendHottestResolver,
  ArticleOSSToInRecommendIcymiResolver,
  ArticleOSSToInRecommendNewestResolver,
  ArticleOSSToScoreResolver,
} from 'definitions'

export const boost: GQLArticleOSSResolvers['boost'] = async (
  { articleId },
  _,
  { dataSources: { atomService } }
) => {
  const articleBoost = await atomService.findFirst({
    table: 'article_boost',
    where: { articleId },
  })

  if (!articleBoost) {
    return 1
  }

  return articleBoost.boost
}

export const score: GQLArticleOSSResolvers['score'] = async (
  { articleId },
  _,
  { dataSources: { atomService } }
) => {
  const article = await atomService.findFirst({
    table: 'article_count_view',
    where: { id: articleId },
  })
  return article?.score || 0
}

export const inRecommendIcymi: GQLArticleOSSResolvers['inRecommendIcymi'] =
  async ({ articleId }, _, { dataSources: { atomService } }) => {
    const record = await atomService.findFirst({
      table: 'matters_choice',
      where: { articleId },
    })
    return !!record
  }

export const inRecommendHottest: GQLArticleOSSResolvers['inRecommendHottest'] =
  async ({ articleId }, _, { dataSources: { atomService } }) => {
    const setting = await atomService.findFirst({
      table: 'article_recommend_setting',
      where: { articleId },
    })

    if (!setting) {
      return true
    }

    return setting.inHottest
  }

export const inRecommendNewest: GQLArticleOSSResolvers['inRecommendNewest'] =
  async ({ articleId }, _, { dataSources: { atomService } }) => {
    const setting = await atomService.findFirst({
      table: 'article_recommend_setting',
      where: { articleId },
    })

    if (!setting) {
      return true
    }

    return setting.inNewest
  }
