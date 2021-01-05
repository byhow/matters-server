import { makeSummary } from '@matters/matters-html-formatter'

import { ARTICLE_STATE } from 'common/enums'
import { ArticleToSummaryResolver } from 'definitions'

const resolver: ArticleToSummaryResolver = async (
  { articleId, content },
  _,
  { viewer, dataSources: { articleService } }
) => {
  // fetch data from the latest linked draft
  const article = await articleService.dataloader.load(articleId)
  return makeSummary(content, article?.cover ? 110 : 140)
}

export default resolver
