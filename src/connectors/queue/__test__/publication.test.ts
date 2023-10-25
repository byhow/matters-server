import type { Connections } from 'definitions'
import type { Knex } from 'knex'

import Redis from 'ioredis'
import { RedisMemoryServer } from 'redis-memory-server'
import { v4 } from 'uuid'

import { ARTICLE_STATE, PUBLISH_STATE } from 'common/enums'
import { DraftService, ArticleService, UserService } from 'connectors'
import { PublicationQueue } from 'connectors/queue'

import { genConnections, closeConnections } from '../../__test__/utils'

const redisServer = new RedisMemoryServer()

describe('publicationQueue.publishArticle', () => {
  let connections: Connections
  let queue: PublicationQueue
  let draftService: DraftService
  let articleService: ArticleService
  let userService: UserService
  let knex: Knex
  beforeAll(async () => {
    connections = await genConnections()
    knex = connections.knex
    draftService = new DraftService(connections)
    articleService = new ArticleService(connections)
    userService = new UserService(connections)
    const port = await redisServer.getPort()
    const host = await redisServer.getHost()
    queue = new PublicationQueue(connections, {
      createClient: () => {
        return new Redis({
          port,
          host,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        })
      },
    })
  }, 30000)

  afterAll(async () => {
    await closeConnections(connections)
    redisServer.stop()
  })

  test('publish not pending draft', async () => {
    const notPendingDraftId = '1'
    const draft = await draftService.baseFindById(notPendingDraftId)
    expect(draft.state).not.toBe(PUBLISH_STATE.pending)

    const job = await queue.publishArticle({
      draftId: notPendingDraftId,
    })
    await job.finished()
    expect(await job.getState()).toBe('completed')
  })

  test('publish pending draft successfully', async () => {
    const { draft, content, contentHTML } = await createPendingDraft(
      draftService
    )
    const job = await queue.publishArticle({
      draftId: draft.id,
    })
    await job.finished()
    expect(await job.getState()).toBe('completed')
    const updatedDraft = await draftService.baseFindById(draft.id)
    const updatedArticle = await articleService.baseFindById(
      updatedDraft.articleId
    )
    console.log(updatedDraft)

    expect(updatedDraft.content).toBe(contentHTML)
    expect(updatedDraft.contentMd.includes(content)).toBeTruthy()
    expect(updatedDraft.publishState).toBe(PUBLISH_STATE.published)
    expect(updatedArticle.state).toBe(ARTICLE_STATE.active)
  })

  test('publish pending draft concurrently', async () => {
    const { draft } = await createPendingDraft(draftService)
    const job1 = await queue.publishArticle({
      draftId: draft.id,
    })
    const job2 = await queue.publishArticle({
      draftId: draft.id,
    })
    await Promise.all([job1.finished(), job2.finished()])
    const articleCount = await knex('article')
      .where('draft_id', draft.id)
      .count()
    // only one article is created
    expect(articleCount[0].count).toBe('1')
  })

  test.skip('publish pending draft unsuccessfully', async () => {
    // mock
    userService.baseFindById = async (_) => {
      throw Error('mock error in queue test')
    }
    const { draft } = await createPendingDraft(draftService)
    const job = await queue.publishArticle({
      draftId: draft.id,
    })
    try {
      await job.finished()
    } catch {
      // pass
    }
    expect(await job.getState()).toBe('failed')

    const updatedDraft = await draftService.baseFindById(draft.id)
    const updatedArticle = await articleService.baseFindById(
      updatedDraft.articleId
    )

    expect(updatedDraft.publishState).toBe(PUBLISH_STATE.error)
    expect(updatedArticle.state).toBe(ARTICLE_STATE.error)
  })
})

const createPendingDraft = async (draftService: DraftService) => {
  const content = Math.random().toString()
  const contentHTML = `<p>${content} <strong>abc</strong></p>`

  return {
    draft: await draftService.baseCreate({
      authorId: '1',
      uuid: v4(),
      title: 'test title',
      summary: 'test summary',
      content: contentHTML,
      publishState: PUBLISH_STATE.pending,
    }),
    content,
    contentHTML,
  }
}
