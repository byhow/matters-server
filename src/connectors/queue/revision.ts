import type { Connections, Article } from 'definitions'

import { invalidateFQC } from '@matters/apollo-response-cache'
import Queue from 'bull'
import _difference from 'lodash/difference'

import {
  ARTICLE_STATE,
  NOTICE_TYPE,
  NODE_TYPES,
  QUEUE_CONCURRENCY,
  QUEUE_JOB,
  QUEUE_NAME,
  QUEUE_PRIORITY,
} from 'common/enums'
import { environment } from 'common/environment'
import { ServerError } from 'common/errors'
import { getLogger } from 'common/logger'
import { extractMentionIds } from 'common/utils'
import {
  AtomService,
  NotificationService,
  ArticleService,
  UserService,
} from 'connectors'

import { getOrCreateQueue } from './utils'

const logger = getLogger('queue-revision')

interface RevisedArticleData {
  articleId: string
  oldArticleVersionId: string
  newArticleVersionId: string
  iscnPublish?: boolean
}

export class RevisionQueue {
  private connections: Connections
  private q: InstanceType<typeof Queue>

  public constructor(connections: Connections) {
    this.connections = connections
    const [q, created] = getOrCreateQueue(QUEUE_NAME.revision)
    this.q = q
    if (created) {
      this.addConsumers()
    }
  }

  public publishRevisedArticle = (data: RevisedArticleData) =>
    this.q.add(QUEUE_JOB.publishRevisedArticle, data, {
      priority: QUEUE_PRIORITY.CRITICAL,
    })

  /**
   * Cusumers
   */
  private addConsumers = () => {
    // publish revised article
    this.q.process(
      QUEUE_JOB.publishRevisedArticle,
      QUEUE_CONCURRENCY.publishRevisedArticle,
      this.handlePublishRevisedArticle
    )
  }

  /**
   * Publish revised article
   */
  private handlePublishRevisedArticle: Queue.ProcessCallbackFunction<unknown> =
    async (job, done) => {
      const {
        articleId,
        oldArticleVersionId,
        newArticleVersionId,
        iscnPublish,
      } = job.data as RevisedArticleData

      const articleService = new ArticleService(this.connections)
      const userService = new UserService(this.connections)
      const notificationService = new NotificationService(this.connections)
      const atomService = new AtomService(this.connections)

      const article = await atomService.articleIdLoader.load(articleId)
      const oldArticleVersion = await atomService.articleVersionIdLoader.load(
        oldArticleVersionId
      )
      const newArticleVersion = await atomService.articleVersionIdLoader.load(
        newArticleVersionId
      )

      // Step 1: checks
      if (!article) {
        job.progress(100)
        done(null, `Revised article ${articleId} not found`)
        return
      }
      if (!oldArticleVersion) {
        job.progress(100)
        done(null, `old article version ${oldArticleVersionId} not found`)
        return
      }

      if (!newArticleVersion) {
        job.progress(100)
        done(null, `new article version ${newArticleVersionId} not found`)
        return
      }

      if (article.state !== ARTICLE_STATE.active) {
        job.progress(100)
        done(null, `Revised article ${article.id} is not active`)
        return
      }
      job.progress(10)

      // Section1: update local DB related
      const { content: newContent } =
        await atomService.articleContentIdLoader.load(
          newArticleVersion.contentId
        )
      try {
        // Step 2: handle newly added mentions
        if (newArticleVersion.contentId !== oldArticleVersion.contentId) {
          const { content: oldContent } =
            await atomService.articleContentIdLoader.load(
              oldArticleVersion.contentId
            )
          await this.handleMentions(
            {
              article,
              preContent: oldContent,
              content: newContent,
            },
            notificationService
          )
        }
        job.progress(70)
      } catch (err) {
        // ignore errors caused by these steps
        logger.warn('job failed at optional step: %j', {
          err,
          job,
          articleVersionId: newArticleVersionId,
        })
      }

      // Step 3: trigger notifications
      notificationService.trigger({
        event: NOTICE_TYPE.revised_article_published,
        recipientId: article.authorId,
        entities: [{ type: 'target', entityTable: 'article', entity: article }],
      })

      // Step 4: invalidate article and user cache
      await Promise.all([
        invalidateFQC({
          node: { type: NODE_TYPES.User, id: article.authorId },
          redis: this.connections.redis,
        }),
        invalidateFQC({
          node: { type: NODE_TYPES.Article, id: article.id },
          redis: this.connections.redis,
        }),
      ])

      // Section2: publish to external services like: IPFS / IPNS / ISCN / etc...
      const author = await atomService.userIdLoader.load(article.authorId)
      const { userName, displayName } = author
      try {
        // Step5: ipfs publishing
        const {
          contentHash: dataHash,
          mediaHash,
          key,
        } = await articleService.publishToIPFS(
          article,
          newArticleVersion,
          newContent
        )

        // update dataHash and mediaHash
        await atomService.update({
          table: 'article_version',
          where: { id: newArticleVersion.id },
          data: { dataHash, mediaHash },
        })

        // update secret
        if (key && newArticleVersion.circleId) {
          await atomService.update({
            table: 'article_circle',
            where: {
              articleId: articleId,
              circleId: newArticleVersion.circleId,
            },
            data: {
              secret: key,
            },
          })
        }

        // Step6: iscn publishing
        if (iscnPublish) {
          const liker = await userService.findLiker({
            userId: author.id,
          })
          // expect liker to be found
          if (!liker) {
            throw new ServerError(`Liker not found for user ${author.id}`)
          }
          const cosmosWallet = await userService.likecoin.getCosmosWallet({
            liker,
          })

          const iscnId = await userService.likecoin.iscnPublish({
            mediaHash: `hash://sha256/${mediaHash}`,
            ipfsHash: `ipfs://${dataHash}`,
            cosmosWallet, // 'TBD',
            userName: `${displayName} (@${userName})`,
            title: newArticleVersion.title,
            description: newArticleVersion.summary,
            datePublished: article.createdAt.toISOString().substring(0, 10),
            url: `https://${environment.siteDomain}/a/${article.shortHash}`,
            tags: newArticleVersion.tags,

            // for liker auth&headers info
            liker,
            // likerIp,
            // userAgent,
          })

          // handling both cases of set to true or false, but not omit (undefined)
          await atomService.update({
            table: 'article_version',
            where: { id: newArticleVersion.id },
            data: { iscnId },
          })
        }

        if (userName) {
          await articleService.publishFeedToIPNS({
            userName,
          })
        }
      } catch (err) {
        logger.warn('job failed at optional step: %j', {
          err,
          job,
          articleVersionId: newArticleVersionId,
        })
      }

      job.progress(100)

      const updated = await atomService.findUnique({
        table: 'article_version',
        where: { id: newArticleVersionId },
      })

      done(null, {
        articleId: article.id,
        dataHash: updated.dataHash,
        mediaHash: updated.mediaHash,
        iscnPublish,
        iscnId: updated.iscnId,
      })
    }

  private handleMentions = async (
    {
      article,
      preContent,
      content,
    }: {
      article: Article
      preContent: string
      content: string
    },
    notificationService: NotificationService
  ) => {
    const preIds = extractMentionIds(preContent)
    const currIds = extractMentionIds(content)

    const diffs = _difference(currIds, preIds)
    diffs.forEach((id: string) => {
      if (!id) {
        return false
      }

      notificationService.trigger({
        event: NOTICE_TYPE.article_mentioned_you,
        actorId: article.authorId,
        recipientId: id,
        entities: [{ type: 'target', entityTable: 'article', entity: article }],
      })
    })
  }
}
