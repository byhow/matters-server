import { ArticleNotFoundError } from 'common/errors'
import { fromGlobalId } from 'common/utils'
import { TagToSelectedResolver } from 'definitions'

const resolver: TagToSelectedResolver = async (
  { id },
  { input },
  { dataSources: { tagService, articleService } }
) => {
  let articleId: string | undefined

  if (input.id) {
    articleId = fromGlobalId(input.id).id
  } else if (input.mediaHash) {
    const article = await articleService.findByMediaHash(input.mediaHash)
    articleId = article.id
  }

  if (!articleId) {
    throw new ArticleNotFoundError('Cannot find article by a given input')
  }

  return tagService.isArticleSelected({
    articleId,
    tagId: id
  })
}

export default resolver
