import { makeSummary } from '@matters/matters-html-formatter'

import logger from 'common/logger'
import { gcp } from 'connectors'
import { ArticleToTranslationResolver } from 'definitions'

const resolver: ArticleToTranslationResolver = async (
  {
    content: originContent,
    title: originTitle,
    summary: originSummary,
    articleId,
    language: storedLanguage,
  },
  { input },
  { viewer, dataSources: { atomService, articleService, tagService } }
) => {
  const language = input && input.language ? input.language : viewer.language

  // it's same as original language
  if (language === storedLanguage) {
    return {
      content: originContent,
      title: originTitle,
      summary: originSummary,
      language,
    }
  }

  // get translation
  const translation = await atomService.findFirst({
    table: 'article_translation',
    where: { articleId, language },
  })

  if (translation) {
    return translation
  }

  // or translate and store to db
  const [title, content, summary] = await Promise.all(
    [
      originTitle,
      originContent,
      originSummary || makeSummary(originContent),
    ].map((text) =>
      gcp.translate({
        content: text,
        target: language,
      })
    )
  )

  if (title && content) {
    const data = {
      articleId,
      title,
      content,
      summary,
      language,
    }
    await atomService.upsert({
      table: 'article_translation',
      where: { articleId, language },
      create: data,
      update: { ...data, updatedAt: atomService.knex.fn.now() },
    })

    // translate tags
    const tagIds = await articleService.findTagIds({ id: articleId })
    if (tagIds && tagIds.length > 0) {
      try {
        const tags = await tagService.dataloader.loadMany(tagIds)
        await Promise.all(
          tags.map(async (tag) => {
            if (tag instanceof Error) {
              return
            }
            const translatedTag = await gcp.translate({
              content: tag.content,
              target: language,
            })
            const tagData = {
              tagId: tag.id,
              content: translatedTag,
              language,
            }
            await atomService.upsert({
              table: 'tag_translation',
              where: { tagId: tag.id },
              create: tagData,
              update: { ...tagData, updatedAt: atomService.knex.fn.now() },
            })
          })
        )
      } catch (error) {
        logger.error(error)
      }
    }

    return {
      title,
      content,
      summary,
      language,
    }
  } else {
    return null
  }
}
export default resolver
