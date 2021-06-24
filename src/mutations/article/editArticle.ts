import { stripHtml } from '@matters/matters-html-formatter'
import { difference, flow, trim, uniq } from 'lodash'
import { v4 } from 'uuid'

import {
  ARTICLE_ACCESS_TYPE,
  ARTICLE_LICENSE_TYPE,
  ARTICLE_STATE,
  ASSET_TYPE,
  CACHE_KEYWORD,
  CIRCLE_STATE,
  DB_NOTICE_TYPE,
  MAX_ARTICLE_REVISION_COUNT,
  NODE_TYPES,
  PUBLISH_STATE,
  USER_STATE,
} from 'common/enums'
import { environment } from 'common/environment'
import {
  ArticleNotFoundError,
  ArticleRevisionContentInvalidError,
  ArticleRevisionReachLimitError,
  AssetNotFoundError,
  AuthenticationError,
  CircleNotFoundError,
  DraftNotFoundError,
  ForbiddenByStateError,
  ForbiddenError,
  NameInvalidError,
  UserInputError,
} from 'common/errors'
import {
  correctHtml,
  fromGlobalId,
  isValidTagName,
  measureDiffs,
  sanitize,
  stripClass,
} from 'common/utils'
import { revisionQueue } from 'connectors/queue'
import { MutationToEditArticleResolver } from 'definitions'

const resolver: MutationToEditArticleResolver = async (
  _,
  {
    input: {
      id,
      state,
      sticky,
      tags,
      content,
      summary,
      cover,
      collection,
      circle: circleGlobalId,
      accessType,
      license,
    },
  },
  {
    viewer,
    dataSources: {
      articleService,
      atomService,
      draftService,
      notificationService,
      systemService,
      tagService,
      userService,
    },
    knex,
  }
) => {
  if (!viewer.id) {
    throw new AuthenticationError('visitor has no permission')
  }

  if (viewer.state === USER_STATE.frozen) {
    throw new ForbiddenByStateError(`${viewer.state} user has no permission`)
  }

  // checks
  const { id: dbId } = fromGlobalId(id)
  const article = await articleService.baseFindById(dbId)
  if (!article) {
    throw new ArticleNotFoundError('article does not exist')
  }
  const draft = await draftService.baseFindById(article.draftId)
  if (!draft) {
    throw new DraftNotFoundError('article linked draft does not exist')
  }
  if (draft.authorId !== viewer.id) {
    throw new ForbiddenError('viewer has no permission')
  }
  if (article.state !== ARTICLE_STATE.active) {
    throw new ForbiddenError('only active article is allowed to be edited.')
  }

  /**
   * Archive
   */
  if (state && state !== ARTICLE_STATE.archived) {
    throw new ForbiddenError(
      `"state" only supports "${ARTICLE_STATE.archived}".`
    )
  }
  if (state === ARTICLE_STATE.archived) {
    await articleService.archive(dbId)
  }

  /**
   * Sticky
   */
  if (typeof sticky === 'boolean') {
    // reset if there are some sticky articles.
    if (sticky === true) {
      const stickyIds = (
        await articleService.findBySticky(viewer.id, true)
      ).map(({ id: articleId }) => articleId)
      await articleService.baseBatchUpdate(stickyIds, {
        sticky: false,
        updatedAt: new Date(),
      })
    }

    await articleService.baseUpdate(dbId, {
      sticky,
      updatedAt: new Date(),
    })
  }

  /**
   * Tags
   */
  const resetTags = tags === null || (tags && tags.length === 0)
  if (tags) {
    // get tag editor
    const tagEditors = environment.mattyId
      ? [environment.mattyId, article.authorId]
      : [article.authorId]

    tags = uniq(tags)
      .map((tag) => {
        if (!isValidTagName(tag)) {
          throw new NameInvalidError(`invalid tag: ${tag}`)
        }
        return trim(tag)
      })
      .filter((t) => !!t)

    // create tag records
    const dbTags = ((await Promise.all(
      tags.map((tag: string) =>
        tagService.create({
          content: tag,
          creator: article.authorId,
          editors: tagEditors,
          owner: article.authorId,
        })
      )
    )) as unknown) as [{ id: string; content: string }]

    const newIds = dbTags.map(({ id: tagId }) => tagId)
    const oldIds = (
      await tagService.findByArticleId({ articleId: article.id })
    ).map(({ id: tagId }: { id: string }) => tagId)

    // add
    await tagService.createArticleTags({
      articleIds: [article.id],
      creator: article.authorId,
      tagIds: difference(newIds, oldIds),
    })

    // delete unwanted
    await tagService.deleteArticleTagsByTagIds({
      articleId: article.id,
      tagIds: difference(oldIds, newIds),
    })
  } else if (resetTags) {
    const oldIds = (
      await tagService.findByArticleId({ articleId: article.id })
    ).map(({ id: tagId }: { id: string }) => tagId)

    await tagService.deleteArticleTagsByTagIds({
      articleId: article.id,
      tagIds: oldIds,
    })
  }

  /**
   * Cover
   */
  const resetCover = cover === null
  if (cover) {
    const asset = await systemService.findAssetByUUID(cover)

    if (
      !asset ||
      [ASSET_TYPE.embed, ASSET_TYPE.cover].indexOf(asset.type) < 0 ||
      asset.authorId !== viewer.id
    ) {
      throw new AssetNotFoundError('article cover does not exists')
    }

    await articleService.baseUpdate(dbId, {
      cover: asset.id,
      updatedAt: new Date(),
    })
  } else if (resetCover) {
    await articleService.baseUpdate(dbId, {
      cover: null,
      updatedAt: new Date(),
    })
  }

  /**
   * Collection
   */
  const resetCollection =
    collection === null || (collection && collection.length === 0)
  if (collection) {
    // compare new and old collections
    const oldIds = (
      await articleService.findCollections({
        entranceId: article.id,
        limit: null,
      })
    ).map(({ articleId }: { articleId: string }) => articleId)

    const newIds = uniq(
      (
        await Promise.all(
          collection.map(async (articleId) => {
            const articleDbId = fromGlobalId(articleId).id

            if (!articleDbId) {
              return
            }

            const collectedArticle = await atomService.findUnique({
              table: 'article',
              where: { id: articleDbId },
            })

            if (!collectedArticle) {
              throw new ArticleNotFoundError(`Cannot find article ${articleId}`)
            }

            if (collectedArticle.state !== ARTICLE_STATE.active) {
              throw new ForbiddenError(
                `Article ${articleId} cannot be collected.`
              )
            }

            const isBlocked = await userService.blocked({
              userId: collectedArticle.authorId,
              targetId: viewer.id,
            })

            if (isBlocked) {
              throw new ForbiddenError('viewer has no permission')
            }

            return articleDbId
          })
        )
      ).filter((articleId): articleId is string => !!articleId)
    )

    const addItems: any[] = []
    const updateItems: any[] = []
    const diff = difference(newIds, oldIds)

    // gather data
    newIds.map((articleId: string, index: number) => {
      const indexOf = oldIds.indexOf(articleId)
      if (indexOf < 0) {
        addItems.push({ entranceId: article.id, articleId, order: index })
      }
      if (indexOf >= 0 && index !== indexOf) {
        updateItems.push({ entranceId: article.id, articleId, order: index })
      }
    })

    // add and update
    await Promise.all([
      ...addItems.map((data: any) => articleService.insertCollection(data)),
      ...updateItems.map((data: any) =>
        articleService.updateCollectionOrder(data)
      ),
    ])

    // delete unwanted
    await articleService.deleteCollectionByArticleIds({
      entranceId: article.id,
      articleIds: difference(oldIds, newIds),
    })

    // trigger notifications
    diff.forEach(async (articleId) => {
      const targetCollection = await articleService.baseFindById(articleId)
      notificationService.trigger({
        event: DB_NOTICE_TYPE.article_new_collected,
        recipientId: targetCollection.authorId,
        actorId: article.authorId,
        entities: [
          {
            type: 'target',
            entityTable: 'article',
            entity: targetCollection,
          },
          {
            type: 'collection',
            entityTable: 'article',
            entity: article,
          },
        ],
      })
    })
  } else if (resetCollection) {
    await articleService.deleteCollection({ entranceId: article.id })
  }

  /**
   * Circle
   */
  const currAccess = await atomService.findFirst({
    table: 'article_circle',
    where: { articleId: article.id },
  })
  const resetCircle = currAccess && circleGlobalId === null
  let isUpdatingAccess = false
  let circle: any

  if (circleGlobalId) {
    const { id: circleId } = fromGlobalId(circleGlobalId)
    circle = await atomService.findFirst({
      table: 'circle',
      where: { id: circleId, state: CIRCLE_STATE.active },
    })

    if (!circle) {
      throw new CircleNotFoundError(`Cannot find circle ${circleGlobalId}`)
    } else if (circle.owner !== viewer.id) {
      throw new ForbiddenError(
        `Viewer isn't the owner of circle ${circleGlobalId}.`
      )
    } else if (circle.state !== CIRCLE_STATE.active) {
      throw new ForbiddenError(`Circle ${circleGlobalId} cannot be added.`)
    }

    if (!accessType) {
      throw new UserInputError('"accessType" is required on `circle`.')
    }

    if (
      circle.id !== currAccess?.circleId ||
      (circle.id === currAccess?.circleId && accessType !== currAccess?.access)
    ) {
      isUpdatingAccess = true
    }

    // insert to db
    const data = { articleId: article.id, circleId: circle.id }
    await atomService.upsert({
      table: 'article_circle',
      where: data,
      create: { ...data, access: accessType },
      update: { ...data, access: accessType, updatedAt: new Date() },
    })
  } else if (resetCircle) {
    await atomService.deleteMany({
      table: 'article_circle',
      where: { articleId: article.id },
    })
  }

  /**
   * Summary
   */
  const resetSummary = summary === null || summary === ''
  if (summary || resetSummary) {
    await atomService.update({
      table: 'draft',
      where: { id: article.draftId },
      data: {
        summary: summary || null,
        summaryCustomized: !!summary,
        updatedAt: new Date(),
      },
    })
  }

  /**
   * Revision Count
   */
  const isUpdatingContent = !!content
  const isUpdatingCircleOrAccess = isUpdatingAccess || resetCircle
  const shouldRepublish = isUpdatingContent || isUpdatingCircleOrAccess
  const checkRevisionCount = () => {
    const revisionCount = article.revisionCount || 0
    if (revisionCount >= MAX_ARTICLE_REVISION_COUNT) {
      throw new ArticleRevisionReachLimitError(
        'number of revisions reach limit'
      )
    }
  }
  const increaseRevisionCount = async () => {
    checkRevisionCount()

    await atomService.update({
      table: 'article',
      where: { id: article.id },
      data: {
        revisionCount: (article.revisionCount || 0) + 1,
        updatedAt: new Date(),
      },
    })
  }

  /**
   * License
   */
  const resetLicense = license === null

  // check license
  const isARR = license === ARTICLE_LICENSE_TYPE.arr
  const isPaywall =
    (accessType || currAccess?.access) === ARTICLE_ACCESS_TYPE.paywall

  if (isARR && !isPaywall) {
    throw new ForbiddenError(
      'ARR (All Right Reserved) license can only be used by paywalled content.'
    )
  }

  if (license || resetLicense) {
    // we wont increase twice if the article will be republish later
    if (!shouldRepublish) {
      await increaseRevisionCount()
    }

    await atomService.update({
      table: 'draft',
      where: { id: article.draftId },
      data: {
        license: license || ARTICLE_LICENSE_TYPE.cc_by_nc_nd_2,
        updatedAt: new Date(),
      },
    })
  }

  /**
   * Republish article if content or access is changed
   */
  const republish = async (newContent?: string) => {
    checkRevisionCount()

    // fetch updated data before create draft
    const [
      currDraft,
      currArticle,
      currCollections,
      currTags,
      currArticleCircle,
    ] = await Promise.all([
      draftService.baseFindById(article.draftId), // fetch latest draft
      articleService.baseFindById(dbId), // fetch latest article
      articleService.findCollections({ entranceId: article.id, limit: null }),
      tagService.findByArticleId({ articleId: article.id }),
      articleService.findArticleCircle(article.id),
    ])
    const currTagContents = currTags.map((currTag) => currTag.content)
    const currCollectionIds = currCollections.map(
      ({ articleId }: { articleId: string }) => articleId
    )

    // create draft linked to this article
    const cleanedContent = stripClass(
      newContent || currDraft.content,
      'u-area-disable'
    )
    const pipe = flow(sanitize, correctHtml)
    const data: Record<string, any> = {
      uuid: v4(),
      authorId: currDraft.authorId,
      articleId: currArticle.id,
      title: currDraft.title,
      summary: currDraft.summary,
      summaryCustomized: currDraft.summaryCustomized,
      content: pipe(cleanedContent),
      tags: currTagContents,
      cover: currArticle.cover,
      collection: currCollectionIds,
      archived: false,
      publishState: PUBLISH_STATE.pending,
      circleId: currArticleCircle?.circleId,
      access: currArticleCircle?.access,
      license: currDraft?.license,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const revisedDraft = await draftService.baseCreate(data)

    // add job to publish queue
    revisionQueue.publishRevisedArticle({
      draftId: revisedDraft.id,
    })
  }

  if (isUpdatingContent) {
    // check diff distances reaches limit or not
    const cleanedContent = stripClass(content || '', 'u-area-disable')
    const diffs = measureDiffs(
      stripHtml(draft.content, ''),
      stripHtml(cleanedContent, '')
    )
    if (diffs > 50) {
      throw new ArticleRevisionContentInvalidError('revised content invalid')
    }

    await republish(content)
  } else if (isUpdatingCircleOrAccess) {
    await republish()
  }

  /**
   * Result
   */
  const node = await draftService.baseFindById(article.draftId)

  // invalidate circle
  if (circle) {
    node[CACHE_KEYWORD] = [
      {
        id: circle.id,
        type: NODE_TYPES.Circle,
      },
    ]
  }

  return node
}

export default resolver
