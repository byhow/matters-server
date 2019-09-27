import { ArticleService } from 'connectors'

const articleService = new ArticleService()

// beforeAll(async () => {
//   await articleService.es.clear()
//   await articleService.initSearch()
// })

test('publish', async () => {
  const articlePublished = await articleService.publish({
    authorId: '1',
    title: 'test',
    cover: '1',
    summary: 'test-summary',
    content: '<div>test-html-string</div>',
    draftId: '1'
  })
  expect(articlePublished.mediaHash).toBeDefined()
  expect(articlePublished.dataHash).toBeDefined()
  expect(articlePublished.state).toBe('active')
})

test('countByAuthor', async () => {
  const count = await articleService.countByAuthor('1')
  expect(count).toBeDefined()
})

test('sumAppreciation', async () => {
  const appreciation = await articleService.sumAppreciation('1')
  expect(appreciation).toBeDefined()
})

test('findByAuthor', async () => {
  const articles = await articleService.findByAuthor('1')
  expect(articles.length).toBeDefined()
})

test('findTransactions', async () => {
  const appreciations = await articleService.findTransactions({
    referenceId: '1'
  })
  expect(appreciations.length).toBe(4)
})

test('findTagIds', async () => {
  const tagIds = await articleService.findTagIds({ id: '1' })
  expect(tagIds.length).toEqual(2)
})

test('findSubscriptions', async () => {
  const subs = await articleService.findSubscriptions({ id: '2' })
  expect(subs.length).toEqual(2)
})

test('update', async () => {
  const article = await articleService.baseUpdate('1', {
    state: 'archived'
  })
  expect(article.state).toEqual('archived')
})
