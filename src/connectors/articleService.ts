import type {
  GQLSearchExclude,
  GQLSearchFilter,
  Item,
  Article,
  Draft,
  Connections,
} from 'definitions'

import {
  ArticlePageContext,
  makeArticlePage,
} from '@matters/ipns-site-generator'
import DataLoader from 'dataloader'
import { Knex } from 'knex'
import { v4 } from 'uuid'

import {
  APPRECIATION_PURPOSE,
  ARTICLE_ACCESS_TYPE,
  ARTICLE_APPRECIATE_LIMIT,
  ARTICLE_STATE,
  CIRCLE_STATE,
  COMMENT_TYPE,
  COMMENT_STATE,
  MINUTE,
  QUEUE_URL,
  TRANSACTION_PURPOSE,
  TRANSACTION_STATE,
  TRANSACTION_TARGET_TYPE,
  MAX_PINNED_WORKS_LIMIT,
  USER_ACTION,
  USER_STATE,
} from 'common/enums'
import { environment } from 'common/environment'
import {
  ArticleNotFoundError,
  ServerError,
  ForbiddenError,
  ActionLimitExceededError,
} from 'common/errors'
import { getLogger } from 'common/logger'
import { s2tConverter, t2sConverter, normalizeSearchKey } from 'common/utils'
import {
  AtomService,
  BaseService,
  ipfsServers,
  SystemService,
  UserService,
} from 'connectors'

const logger = getLogger('service-article')

const SEARCH_TITLE_RANK_THRESHOLD = 0.001
const SEARCH_DEFAULT_TEXT_RANK_THRESHOLD = 0.0001

export class ArticleService extends BaseService {
  private ipfsServers: typeof ipfsServers
  public dataloader: DataLoader<string, Item>
  public draftLoader: DataLoader<string, Item>

  public constructor(connections: Connections) {
    super('article', connections)
    this.ipfsServers = ipfsServers

    this.dataloader = new DataLoader(async (ids: readonly string[]) => {
      const result = await this.baseFindByIds(ids)

      if (result.findIndex((item: any) => !item) >= 0) {
        throw new ArticleNotFoundError('Cannot find article')
      }

      return result
    })

    // load drafts by aritcle ids
    this.draftLoader = new DataLoader(async (ids: readonly string[]) => {
      const items = await this.baseFindByIds(ids)

      if (items.findIndex((item: any) => !item) >= 0) {
        throw new ArticleNotFoundError('Cannot find article')
      }

      const draftIds = items.map((item: any) => item.draftId)
      const result = await this.baseFindByIds(draftIds, 'draft')
      if (result.findIndex((item: any) => !item) >= 0) {
        throw new ArticleNotFoundError("Cannot find article's linked draft")
      }

      return result
    })
  }

  public loadById = async (id: string): Promise<Article> =>
    this.dataloader.load(id) as Promise<Article>
  public loadByIds = async (ids: string[]): Promise<Article[]> =>
    this.dataloader.loadMany(ids) as Promise<Article[]>

  public loadDraftsByArticles = async (ids: string[]): Promise<Draft[]> =>
    this.draftLoader.loadMany(ids) as Promise<Draft[]>

  /**
   * Create a pending article with linked draft
   */
  public createArticle = async ({
    draftId,
    authorId,
    title,
    slug,
    wordCount,
    summary,
    content,
    cover,
    dataHash,
    mediaHash,
  }: Record<string, any>) =>
    this.baseCreate({
      uuid: v4(),
      state: ARTICLE_STATE.pending,
      draftId,
      authorId,
      title,
      slug,
      wordCount,
      summary,
      content,
      cover,
      dataHash,
      mediaHash,
    })

  /**
   * Update article's pin status and return article
   * Throw error if there already has 3 pinned articles/collections
   * or user is not the author of the article.
   */
  public updatePinned = async (
    articleId: string,
    userId: string,
    pinned: boolean
  ) => {
    const article = await this.baseFindById(articleId)
    if (!article) {
      throw new ArticleNotFoundError('Cannot find article')
    }
    if (article.authorId !== userId) {
      throw new ForbiddenError('Only author can pin article')
    }
    const userService = new UserService(this.connections)
    const totalPinned = await userService.totalPinnedWorks(userId)
    if (pinned === article.pinned) {
      return article
    }
    if (pinned && totalPinned >= MAX_PINNED_WORKS_LIMIT) {
      throw new ActionLimitExceededError(
        `Can only pin up to ${MAX_PINNED_WORKS_LIMIT} articles/collections`
      )
    }
    await this.baseUpdate(articleId, { pinned, pinnedAt: this.knex.fn.now() })
    return { ...article, pinned }
  }

  public findPinnedByAuthor = async (authorId: string) =>
    this.baseFind({
      where: { authorId, pinned: true, state: ARTICLE_STATE.active },
    })

  /**
   * Publish draft data to IPFS
   */
  public publishToIPFS = async (draft: any) => {
    const userService = new UserService(this.connections)
    const systemService = new SystemService(this.connections)
    const atomService = new AtomService(this.connections)

    // prepare metadata
    const {
      title,
      content,
      summary,
      cover,
      tags,
      circleId,
      access,
      authorId,
      articleId,
      updatedAt: publishedAt,
    } = draft
    const author = await userService.loadById(authorId)
    const {
      // avatar,
      displayName,
      userName,
      paymentPointer,
    } = author
    if (!userName || !displayName) {
      throw new ServerError('userName or displayName is missing')
    }
    const [
      // userImg,
      articleCoverImg,
      ipnsKeyRec,
    ] = await Promise.all([
      // avatar && (await systemService.findAssetUrl(avatar)),
      cover && (await systemService.findAssetUrl(cover)),
      atomService.findFirst({
        table: 'user_ipns_keys',
        where: { userId: authorId },
      }),
    ])
    const ipnsKey = ipnsKeyRec?.ipnsKey

    const context: ArticlePageContext = {
      encrypted: false,
      meta: {
        title: `${title} - ${displayName} (${userName})`,
        description: summary,
        authorName: displayName,
        image: articleCoverImg,
      },
      byline: {
        date: publishedAt,
        author: {
          name: `${displayName} (${userName})`,
          uri: `https://${environment.siteDomain}/@${userName}`,
        },
        website: {
          name: 'Matters',
          uri: 'https://' + environment.siteDomain,
        },
      },
      rss: ipnsKey
        ? {
            ipnsKey,
            xml: '../rss.xml',
            json: '../feed.json',
          }
        : undefined,
      article: {
        id: articleId,
        author: {
          userName,
          displayName,
        },
        title,
        summary,
        date: publishedAt,
        content,
        tags: tags?.map((t: string) => t.trim()).filter(Boolean) || [],
      },
    }

    // paywalled content
    if (circleId && access === ARTICLE_ACCESS_TYPE.paywall) {
      context.encrypted = true
    }

    // payment pointer
    if (paymentPointer) {
      context.paymentPointer = paymentPointer
    }

    // make bundle and add content to ipfs
    const directoryName = 'article'
    const { bundle, key } = await makeArticlePage(context)

    let ipfs = this.ipfsServers.client
    let retries = 0

    do {
      try {
        const results = []
        for await (const result of ipfs.addAll(
          bundle.map((file) =>
            file
              ? { ...file, path: `${directoryName}/${file.path}` }
              : undefined
          )
        )) {
          results.push(result)
        }

        // filter out the hash for the bundle
        let entry = results.filter(
          ({ path }: { path: string }) => path === directoryName
        )

        // FIXME: fix missing bundle path and remove fallback logic
        // fallback to index file when no bundle path is matched
        if (entry.length === 0) {
          entry = results.filter(({ path }: { path: string }) =>
            path.endsWith('index.html')
          )
        }

        const contentHash = entry[0].cid.toString()
        const mediaHash = entry[0].cid.toV1().toString() // cid.toV1().toString() // cid.toBaseEncodedString()
        return { contentHash, mediaHash, key }
      } catch (err) {
        // if the active IPFS client throws exception, try a few more times on Secondary
        logger.error(
          `publishToIPFS failed, retries ${++retries} time, ERROR:`,
          err
        )
        ipfs = this.ipfsServers.backupClient
      }
    } while (ipfs && retries <= this.ipfsServers.size) // break the retry if there's no backup

    // re-fill dataHash & mediaHash later in IPNS-listener
    logger.error(`failed publishToIPFS after ${retries} retries.`)
  }

  // DEPRECATED, To Be Deleted
  //  moved to IPNS-Listener
  public publishFeedToIPNS = async ({
    userName,
    numArticles = 50,
    incremental = false,
    forceReplace = false,
    updatedDrafts,
  }: {
    userName: string
    numArticles?: number
    incremental?: boolean
    forceReplace?: boolean
    updatedDrafts?: Item[]
  }) => {
    const userService = new UserService(this.connections)

    try {
      const ipnsKeyRec = await userService.findOrCreateIPNSKey(userName)
      if (!ipnsKeyRec) {
        // cannot do anything if no ipns key
        logger.error('create IPNS key ERROR: %o', ipnsKeyRec)
        return
      }
    } catch (error) {
      logger.error('create IPNS key ERROR: %o', error)
      return
    }
  }

  public sendArticleFeedMsgToSQS = async ({
    article,
    author,
    ipnsData,
  }: {
    article: {
      id: string
      title: string
      slug: string
      dataHash: string
      mediaHash: string
    }
    author: {
      userName: string
      displayName: string
    }
    ipnsData: {
      ipnsKey: string
      lastDataHash: string
    }
  }) =>
    this.aws?.sqsSendMessage({
      messageGroupId: `ipfs-articles-${environment.env}:articles-feed`,
      messageBody: {
        articleId: article.id,
        title: article.title,
        url: `https://${environment.siteDomain}/@${author.userName}/${article.id}-${article.slug}`,
        dataHash: article.dataHash,
        mediaHash: article.mediaHash,

        // ipns info:
        ipnsKey: ipnsData.ipnsKey,
        lastDataHash: ipnsData.lastDataHash,

        // author info:
        userName: author.userName,
        displayName: author.displayName,
      },
      queueUrl: QUEUE_URL.ipfsArticles,
    })

  /**
   * Archive article
   */
  public archive = async (id: string) => {
    const atomService = new AtomService(this.connections)
    const targetArticle = await atomService.findFirst({
      table: 'article',
      where: { id },
    })
    const articles = await atomService.findMany({
      table: 'article',
      where: { draftId: targetArticle.draftId },
    })

    // update db
    for (const article of articles) {
      await this.baseUpdate(article.id, {
        state: ARTICLE_STATE.archived,
        pinned: false,
        updatedAt: new Date(),
      })
    }
  }

  public findByAuthor = async (
    authorId: string,
    {
      columns = ['draft_id'],
      orderBy = 'newest',
      state = 'active',
      skip,
      take,
    }: {
      columns?: string[]
      state?: keyof typeof ARTICLE_STATE | null
      orderBy?:
        | 'newest'
        | 'mostReaders'
        | 'mostAppreciations'
        | 'mostComments'
        | 'mostDonations'
      skip?: number
      take?: number
    } = {}
  ) => {
    const { id: targetTypeId } = await this.baseFindEntityTypeId('article')
    return this.knexRO(
      this.knexRO
        .from(this.table)
        .where({
          authorId,
        })
        .whereNotIn('state', [ARTICLE_STATE.pending, ARTICLE_STATE.error])
        .as('t1')
    )
      .modify((builder: Knex.QueryBuilder) => {
        if (state) {
          builder.andWhere({ 't1.state': state })
        }

        switch (orderBy) {
          case 'newest': {
            builder.orderBy('t1.id', 'desc')
            break
          }
          case 'mostReaders': {
            builder
              .leftJoin(
                this.knexRO('article_ga4_data')
                  .groupBy('article_id')
                  .select(
                    'article_id',
                    this.knex.raw('SUM(total_users) as reader_amount')
                  )
                  .as('t2'),
                't1.id',
                't2.article_id'
              )
              .orderBy([
                { column: 't2.reader_amount', order: 'desc', nulls: 'last' },
                { column: 't1.id', order: 'desc' },
              ])
            break
          }
          case 'mostAppreciations': {
            builder
              .leftJoin(
                this.knexRO('appreciation')
                  .whereIn('purpose', [
                    APPRECIATION_PURPOSE.appreciate,
                    APPRECIATION_PURPOSE.appreciateSubsidy,
                  ])
                  .groupBy('reference_id')
                  .select(
                    'reference_id',
                    this.knex.raw('SUM(amount) as appreciation_amount')
                  )
                  .as('t2'),
                't1.id',
                't2.reference_id'
              )
              .orderBy([
                {
                  column: 't2.appreciation_amount',
                  order: 'desc',
                  nulls: 'last',
                },
                { column: 't1.id', order: 'desc' },
              ])
            break
          }
          case 'mostComments': {
            builder
              .leftJoin(
                this.knexRO('comment')
                  .where({
                    type: COMMENT_TYPE.article,
                    state: COMMENT_STATE.active,
                    targetTypeId,
                  })
                  .groupBy('target_id')
                  .select(
                    'target_id',
                    this.knex.raw('COUNT(1) as comment_count')
                  )
                  .as('t2'),
                't1.id',
                't2.target_id'
              )
              .orderBy([
                {
                  column: 't2.comment_count',
                  order: 'desc',
                  nulls: 'last',
                },
                { column: 't1.id', order: 'desc' },
              ])
            break
          }
          case 'mostDonations': {
            builder
              .leftJoin(
                this.knexRO('transaction')
                  .where({
                    purpose: TRANSACTION_PURPOSE.donation,
                    state: TRANSACTION_STATE.succeeded,
                    targetType: targetTypeId,
                  })
                  .groupBy('target_id')
                  .select(
                    'target_id',
                    this.knex.raw('COUNT(DISTINCT sender_id) as donation_count')
                  )
                  .as('t2'),
                't1.id',
                't2.target_id'
              )
              .orderBy([
                {
                  column: 't2.donation_count',
                  order: 'desc',
                  nulls: 'last',
                },
                { column: 't1.id', order: 'desc' },
              ])
            break
          }
        }

        if (skip !== undefined && Number.isFinite(skip)) {
          builder.offset(skip)
        }
        if (take !== undefined && Number.isFinite(take)) {
          builder.limit(take)
        }
      })
      .select(columns)
  }

  public findByTitle = async ({
    title,
    oss = false,
    filter,
  }: {
    title: string
    oss?: boolean
    filter?: Record<string, any>
  }) => {
    const query = this.knex.select().from(this.table).where({ title })

    if (!oss) {
      query.andWhere({ state: ARTICLE_STATE.active })
    }

    if (filter && Object.keys(filter).length > 0) {
      query.andWhere(filter)
    }

    return query.orderBy('id', 'desc')
  }

  public findByCommentedAuthor = async ({
    id,
    skip,
    take,
  }: {
    id: string
    skip?: number
    take?: number
  }) =>
    this.knex
      .select('article.*')
      .max('comment.id', { as: '_comment_id_' })
      .from('comment')
      .innerJoin(this.table, 'comment.target_id', 'article.id')
      .where({
        'comment.author_id': id,
        'comment.type': COMMENT_TYPE.article,
      })
      .groupBy('article.id')
      .orderBy('_comment_id_', 'desc')
      .modify((builder: Knex.QueryBuilder) => {
        if (skip !== undefined && Number.isFinite(skip)) {
          builder.offset(skip)
        }
        if (take !== undefined && Number.isFinite(take)) {
          builder.limit(take)
        }
      })

  /*********************************
   *                               *
   *           Search              *
   *                               *
   *********************************/

  public searchByMediaHash = async ({
    key,
    oss = false,
    filter,
  }: {
    key: string
    oss?: boolean
    filter?: Record<string, any>
  }) => {
    const query = this.knex.select().from(this.table).where({ mediaHash: key })

    if (!oss) {
      query.andWhere({ state: ARTICLE_STATE.active })
    }

    if (filter && Object.keys(filter).length > 0) {
      query.andWhere(filter)
    }

    const rows = await query
    if (rows.length > 0) {
      return {
        nodes: rows,
        totalCount: rows.length,
      }
    } else {
      throw new ServerError('article search by media hash failed')
    }
  }

  public search = async ({
    key: keyOriginal,
    take = 10,
    skip = 0,
    filter,
    exclude,
    viewerId,
    coefficients,
    quicksearch,
  }: {
    key: string
    author?: string
    take: number
    skip: number
    viewerId?: string | null
    filter?: GQLSearchFilter
    exclude?: GQLSearchExclude
    coefficients?: string
    quicksearch?: boolean
  }) => {
    if (quicksearch) {
      return this.quicksearch({ key: keyOriginal, take, skip, filter })
    }
    const key = await normalizeSearchKey(keyOriginal)
    let coeffs = [1, 1, 1, 1]
    try {
      coeffs = JSON.parse(coefficients || '[]')
    } catch (err) {
      logger.error(err)
    }

    const c0 = +(
      coeffs?.[0] ||
      environment.searchPgArticleCoefficients?.[0] ||
      1
    )
    const c1 = +(
      coeffs?.[1] ||
      environment.searchPgArticleCoefficients?.[1] ||
      1
    )
    const c2 = +(
      coeffs?.[2] ||
      environment.searchPgArticleCoefficients?.[2] ||
      1
    )
    const c3 = +(
      coeffs?.[3] ||
      environment.searchPgArticleCoefficients?.[3] ||
      1
    )
    // const c4 = +(coeffs?.[4] || environment.searchPgArticleCoefficients?.[4] || 1)

    // gather users that blocked viewer
    const excludeBlocked = exclude === 'blocked' && viewerId
    let blockedIds: string[] = []
    if (excludeBlocked) {
      blockedIds = (
        await this.knex('action_user')
          .select('user_id')
          .where({ action: USER_ACTION.block, targetId: viewerId })
      ).map(({ userId }) => userId)
    }

    const baseQuery = this.searchKnex
      .from(
        this.searchKnex
          .select(
            '*',
            this.searchKnex.raw(
              '(_text_cd_rank/(_text_cd_rank + 1)) AS text_cd_rank'
            )
          )
          .from(
            this.searchKnex
              .select(
                'id',
                'num_views',
                'title_orig', // 'title',
                'created_at',
                'last_read_at', // -- title, slug,
                this.searchKnex.raw(
                  'percent_rank() OVER (ORDER BY num_views NULLS FIRST) AS views_rank'
                ),
                // this.searchKnex.raw('(CASE WHEN title LIKE ? THEN 1 ELSE 0 END) ::float AS title_like_rank', [`%${key}%`]),
                this.searchKnex.raw(
                  'ts_rank(title_jieba_ts, query) AS title_ts_rank'
                ),
                this.searchKnex.raw(
                  'COALESCE(ts_rank(summary_jieba_ts, query, 1), 0) ::float AS summary_ts_rank'
                ),
                this.searchKnex.raw(
                  'ts_rank_cd(text_jieba_ts, query, 4) AS _text_cd_rank'
                )
              )
              .from('search_index.article')
              .crossJoin(
                this.searchKnex.raw("plainto_tsquery('jiebacfg', ?) query", key)
              )
              .whereIn('state', [ARTICLE_STATE.active])
              .andWhere('author_state', 'NOT IN', [
                // USER_STATE.active
                USER_STATE.archived,
                USER_STATE.banned,
              ])
              .andWhere('author_id', 'NOT IN', blockedIds)
              .andWhereRaw(
                `(query @@ title_jieba_ts OR query @@ summary_jieba_ts OR query @@ text_jieba_ts)`
              )
              .as('t0')
          )
          .as('t1')
      )
      .where('title_ts_rank', '>=', SEARCH_TITLE_RANK_THRESHOLD)
      .orWhere('text_cd_rank', '>=', SEARCH_DEFAULT_TEXT_RANK_THRESHOLD)

    const records = await this.searchKnex
      .select(
        '*',
        this.searchKnex.raw(
          '(? * views_rank + ? * title_ts_rank + ? * summary_ts_rank + ? * text_cd_rank) AS score',
          [c0, c1, c2, c3]
        ),
        this.searchKnex.raw('COUNT(id) OVER() ::int AS total_count')
      )
      .from(baseQuery.as('base'))
      .orderByRaw('score DESC NULLS LAST')
      .orderByRaw('num_views DESC NULLS LAST')
      .orderByRaw('id DESC')
      .modify((builder: Knex.QueryBuilder) => {
        if (take !== undefined && Number.isFinite(take)) {
          builder.limit(take)
        }
        if (skip !== undefined && Number.isFinite(skip)) {
          builder.offset(skip)
        }
      })

    const nodes = (await this.draftLoader.loadMany(
      records.map((item: any) => item.id).filter(Boolean)
    )) as Item[]

    // const totalCount = Number.parseInt(countRes?.count, 10) || nodes.length
    const totalCount = records.length === 0 ? 0 : +records[0].totalCount

    logger.debug(
      `articleService::searchV2 searchKnex instance got ${nodes.length} nodes from: ${totalCount} total:`,
      { key, keyOriginal, baseQuery: baseQuery.toString() },
      // { countRes, articleIds }
      { sample: records?.slice(0, 3) }
    )

    return { nodes, totalCount }
  }

  public searchV3 = async ({
    key: keyOriginal,
    take = 10,
    skip = 0,
    quicksearch,
    filter,
  }: {
    key: string
    author?: string
    take: number
    skip: number
    viewerId?: string | null
    filter?: GQLSearchFilter
    exclude?: GQLSearchExclude
    coefficients?: string
    quicksearch?: boolean
  }) => {
    if (quicksearch) {
      return this.quicksearch({ key: keyOriginal, take, skip, filter })
    }
    const key = await normalizeSearchKey(keyOriginal)
    try {
      const u = new URL(`${environment.tsQiServerUrl}/api/articles/search`)
      u.searchParams.set('q', key?.trim())
      u.searchParams.set('fields', 'id,title,summary')
      if (take) {
        u.searchParams.set('limit', `${take}`)
      }
      if (skip) {
        u.searchParams.set('offset', `${skip}`)
      }
      logger.info(`searchV3 fetching from: "%s"`, u.toString())
      const {
        nodes: records,
        total: totalCount,
        query,
      } = await fetch(u).then((res) => res.json())
      logger.info(
        `searchV3 found ${records?.length}/${totalCount} results from tsquery: '${query}': sample: %j`,
        records[0]
      )

      const nodes = (await this.draftLoader.loadMany(
        records.map((item: any) => `${item.id}`).filter(Boolean)
      )) as Item[]

      return { nodes, totalCount }
    } catch (err) {
      logger.error(`searchV3 ERROR:`, err)
      return { nodes: [], totalCount: 0 }
    }
  }

  private quicksearch = async ({
    key,
    take,
    skip,
    filter,
  }: {
    key: string
    take?: number
    skip?: number
    filter?: GQLSearchFilter
  }) => {
    const keySimplified = await t2sConverter.convertPromise(key)
    const keyTraditional = await s2tConverter.convertPromise(key)
    const records = await this.knexRO
      .select('id', this.knexRO.raw('COUNT(1) OVER() ::int AS total_count'))
      .where(function () {
        this.whereILike('title', `%${key}%`)
          .orWhereILike('title', `%${keyTraditional}%`)
          .orWhereILike('title', `%${keySimplified}%`)
      })
      .from('article')
      .orderBy('id', 'desc')
      .where({ state: ARTICLE_STATE.active })
      .modify((builder: Knex.QueryBuilder) => {
        if (filter && filter.authorId) {
          builder.where({ authorId: filter.authorId })
        }
        if (take !== undefined && Number.isFinite(take)) {
          builder.limit(take)
        }
        if (skip !== undefined && Number.isFinite(skip)) {
          builder.offset(skip)
        }
      })

    const nodes = (await this.draftLoader.loadMany(
      records.map((item: { id: string }) => item.id).filter(Boolean)
    )) as Draft[]
    const totalCount = +(records?.[0]?.totalCount ?? 0)
    return { nodes, totalCount }
  }

  /**
   * Boost & Score
   */
  public setBoost = async ({ id, boost }: { id: string; boost: number }) =>
    this.baseUpdateOrCreate({
      where: { articleId: id },
      data: { articleId: id, boost, updatedAt: new Date() },
      table: 'article_boost',
    })

  /*********************************
   *                               *
   *          Appreciaton          *
   *                               *
   *********************************/
  /**
   * Sum total appreciaton by a given article id.
   */
  public sumAppreciation = async (articleId: string) => {
    const result = await this.knex
      .select()
      .from('appreciation')
      .whereIn(
        ['reference_id', 'purpose'],
        [
          [articleId, APPRECIATION_PURPOSE.appreciate],
          [articleId, APPRECIATION_PURPOSE.appreciateSubsidy],
        ]
      )
      .sum('amount', { as: 'sum' })
      .first()
    return parseInt(result?.sum || '0', 10)
  }

  /**
   * Count an article's appreciations by a given articleId.
   */
  public countAppreciations = async (articleId: string) => {
    const result = await this.knexRO('appreciation')
      .countDistinct(this.knexRO.raw('(sender_id, reference_id)'))
      .where({
        referenceId: articleId,
        purpose: APPRECIATION_PURPOSE.appreciate,
      })
    const count = (result[0] as { count: string }).count
    return +count
  }

  /**
   * Find an article's appreciations by a given articleId.
   */
  public findAppreciations = async ({
    referenceId,
    take,
    skip,
  }: {
    referenceId: string
    take?: number
    skip?: number
  }) =>
    this.knexRO('appreciation')
      .select(
        'reference_id',
        'sender_id',
        this.knexRO.raw('count(1) OVER() AS total_count')
      )
      .where({
        referenceId,
        purpose: APPRECIATION_PURPOSE.appreciate,
      })
      .groupBy('sender_id', 'reference_id')
      .sum('amount as amount')
      .max('created_at as created_at')
      .orderBy('created_at', 'desc')
      .modify((builder: Knex.QueryBuilder) => {
        if (skip !== undefined && Number.isFinite(skip)) {
          builder.offset(skip)
        }
        if (take !== undefined && Number.isFinite(take)) {
          builder.limit(take)
        }
      })

  public appreciateLeftByUser = async ({
    articleId,
    userId,
  }: {
    articleId: string
    userId: string
  }) => {
    const appreciations = await this.knex('appreciation')
      .select()
      .where({
        senderId: userId,
        referenceId: articleId,
        purpose: APPRECIATION_PURPOSE.appreciate,
      })
      .sum('amount as total')
      .first()
    const total = appreciations?.total ?? 0

    return Math.max(ARTICLE_APPRECIATE_LIMIT - total, 0)
  }

  /**
   * User appreciate an article
   */
  public appreciate = async ({
    articleId,
    senderId,
    recipientId,
    amount,
    type,
  }: {
    articleId: string
    senderId: string
    recipientId: string
    amount: number
    type: string
  }) => {
    const appreciation = {
      senderId,
      recipientId,
      referenceId: articleId,
      purpose: APPRECIATION_PURPOSE.appreciate,
      type,
    }

    // find appreciations within 1 minutes and bundle
    const bundle = await this.knex('appreciation')
      .select()
      .where(appreciation)
      .andWhere(
        'created_at',
        '>=',
        this.knex.raw(`now() - INTERVAL '5 minutes'`)
      )
      .orderBy('created_at')
      .first()

    let result

    if (bundle) {
      result = await this.knex('appreciation')
        .where({ id: bundle.id })
        .update({
          amount: Math.min(bundle.amount + amount, ARTICLE_APPRECIATE_LIMIT),
          createdAt: this.knex.fn.now(),
        })
    } else {
      const uuid = v4()
      result = await this.knex('appreciation')
        .insert({
          ...appreciation,
          uuid,
          amount,
        })
        .into('appreciation')
        .returning('*')
    }

    return result
  }

  /*********************************
   *                               *
   *              Tag              *
   *                               *
   *********************************/
  /**
   * Find tags by a given article id.
   */
  public findTagIds = async ({
    id: articleId,
  }: {
    id: string
  }): Promise<any | null> => {
    const result = await this.knex
      .select('tag_id')
      .from('article_tag')
      .where({ articleId })
      .orderBy('created_at', 'desc')

    return result.map(({ tagId }: { tagId: string }) => tagId)
  }

  /*********************************
   *                               *
   *          Subscription         *
   *                               *
   *********************************/
  /**
   * Find an article's subscribers by a given targetId (article).
   */
  public findSubscriptions = async ({
    id: targetId,
    take,
    skip,
  }: {
    id: string
    take?: number
    skip?: number
  }) =>
    this.knex
      .select()
      .from('action_article')
      .where({ targetId, action: USER_ACTION.subscribe })
      .orderBy('id', 'desc')
      .modify((builder: Knex.QueryBuilder) => {
        if (skip !== undefined && Number.isFinite(skip)) {
          builder.offset(skip)
        }
        if (take !== undefined && Number.isFinite(take)) {
          builder.limit(take)
        }
      })

  /*********************************
   *                               *
   *         Read History          *
   *                               *
   *********************************/
  /**
   * User read an article
   */
  public read = async ({
    userId,
    articleId,
    ip,
  }: {
    articleId: string
    userId?: string | null
    ip?: string
  }) => {
    const table = 'article_read_count'

    /** *
     * recording parameters:
     * updatedAt: last heart beat update
     * lastRead: last new read start timestamp
     * readTime: total read time in seconds, accumulated from heart beat and updatedAt
     */

    // current read data
    const newData = {
      articleId,
      userId,
      updatedAt: new Date(),
      archived: false,
      ip,
    }

    // get past record
    const record = await this.baseFind({ where: { articleId, userId }, table })

    /**
     * Case 1: no past record exists
     * create new record and return
     */
    if (!record || record.length === 0) {
      await this.baseCreate(
        {
          ...newData,
          count: 1,
          timedCount: 1,
          readTime: userId ? 0 : null,
          lastRead: new Date(),
        },
        table
      )
      return { newRead: true }
    }

    // get old data
    const oldData = record[0]

    // prepare funtion to only update count
    const updateReadCount = async () => {
      await this.baseUpdate(
        oldData.id,
        {
          ...oldData,
          ...newData,
          count: parseInt(oldData.count, 10) + 1,
          timedCount: parseInt(oldData.timedCount, 10) + 1,
          lastRead: new Date(),
        },
        table
      )
    }

    /**
     *
     * Case 2: visitor
     * don't accumulate read time
     * add a new count and update last read timestamp for visitors
     */
    if (!userId) {
      await updateReadCount()
      return { newRead: true }
    }

    // for logged-in user, calculate lapsed time in milisecondes
    // based on updatedAt
    const lapse = Date.now() - new Date(oldData.updatedAt).getTime()

    // calculate total time since last read started
    const readLength = Date.now() - new Date(oldData.lastRead).getTime()

    // calculate total read time by accumulating heart beat
    const readTime = Math.round(parseInt(oldData.readTime, 10) + lapse / 1000)

    /**
     * Case 3: user continuous read that exceeds 30 minutes
     * stop accumulating read time and only update updatedAt
     *
     * also check if lapse time is longer than 5 minutes,
     * if so it's a new read and go to case 4
     */
    if (lapse < MINUTE * 5 && readLength > MINUTE * 30) {
      await this.baseUpdate(
        oldData.id,
        {
          updatedAt: newData.updatedAt,
        },
        table
      )
      return { newRead: false }
    }

    /**
     * Case 4: lapse equal or longer than 5 minutes
     * treat as a new read
     * add a new count and update last read timestamp
     */
    if (lapse >= MINUTE * 5) {
      await updateReadCount()
      return { newRead: true }
    }

    /**
     * Case 5: all other normal readings
     * accumulate time and update data
     */
    await this.baseUpdate(
      oldData.id,
      {
        ...oldData,
        ...newData,
        readTime,
      },
      table
    )
    return { newRead: false }
  }

  /*********************************
   *                               *
   *          Connection           *
   *                               *
   *********************************/
  /**
   * Find an article's connections by a given article id.
   */
  public findConnections = async ({
    entranceId,
    take,
    skip,
  }: {
    entranceId: string
    take?: number
    skip?: number
  }) =>
    this.knex('article_connection')
      .select('article_id', 'state')
      .innerJoin('article', 'article.id', 'article_id')
      .where({ entranceId, state: ARTICLE_STATE.active })
      .orderBy('order', 'asc')
      .modify((builder: Knex.QueryBuilder) => {
        if (skip !== undefined && Number.isFinite(skip)) {
          builder.offset(skip)
        }
        if (take !== undefined && Number.isFinite(take)) {
          builder.limit(take)
        }
      })

  /**
   * Count an article is connected by how many active articles.
   */
  public countActiveConnectedBy = async (id: string) => {
    const query = this.knexRO('article_connection')
      .rightJoin('article', 'article_connection.entrance_id', 'article.id')
      .where({
        'article_connection.article_id': id,
        'article.state': ARTICLE_STATE.active,
      })
      .countDistinct('entrance_id')
      .first()
    const result = await query
    return parseInt(result ? (result.count as string) : '0', 10)
  }

  /*********************************
   *                               *
   *           Response            *
   *                               *
   *********************************/
  private makeResponseQuery = ({
    id,
    order,
    state,
    fields = '*',
    articleOnly = false,
  }: {
    id: string
    order: string
    state?: string
    fields?: string
    articleOnly?: boolean
  }) =>
    this.knex.select(fields).from((wrapper: Knex) => {
      wrapper
        .select(
          this.knex.raw('row_number() over (order by created_at) as seq, *')
        )
        .from((knex: Knex) => {
          const source = knex.union((operator: any) => {
            operator
              .select(
                this.knex.raw(
                  "'Article' as type, entrance_id as entity_id, article_connection.created_at"
                )
              )
              .from('article_connection')
              .rightJoin(
                'article',
                'article_connection.entrance_id',
                'article.id'
              )
              .where({
                'article_connection.article_id': id,
                'article.state': state,
              })
          })

          if (articleOnly !== true) {
            source.union((operator: any) => {
              operator
                .select(
                  this.knex.raw(
                    "'Comment' as type, id as entity_id, created_at"
                  )
                )
                .from('comment')
                .where({
                  targetId: id,
                  parentCommentId: null,
                  type: COMMENT_TYPE.article,
                })
            })
          }

          source.as('base_sources')
          return source
        })
        .orderBy('created_at', order)
        .as('sources')
    })

  private makeResponseFilterQuery = ({
    id,
    entityId,
    order,
    state,
    articleOnly,
  }: {
    id: string
    entityId: string
    order: string
    state?: string
    articleOnly?: boolean
  }) => {
    const query = this.makeResponseQuery({
      id,
      order,
      state,
      fields: 'seq',
      articleOnly,
    })
    return query.where({ entityId }).first()
  }

  public findResponses = ({
    id,
    order = 'desc',
    state = ARTICLE_STATE.active,
    after,
    before,
    first,
    includeAfter = false,
    includeBefore = false,
    articleOnly = false,
  }: {
    id: string
    order?: string
    state?: string
    after?: string
    before?: string
    first?: number
    includeAfter?: boolean
    includeBefore?: boolean
    articleOnly?: boolean
  }) => {
    const query = this.makeResponseQuery({ id, order, state, articleOnly })
    if (after) {
      const subQuery = this.makeResponseFilterQuery({
        id,
        order,
        state,
        entityId: after,
        articleOnly,
      })
      if (includeAfter) {
        query.andWhere('seq', order === 'asc' ? '>=' : '<=', subQuery)
      } else {
        query.andWhere('seq', order === 'asc' ? '>' : '<', subQuery)
      }
    }
    if (before) {
      const subQuery = this.makeResponseFilterQuery({
        id,
        order,
        state,
        entityId: before,
      })
      if (includeBefore) {
        query.andWhere('seq', order === 'asc' ? '<=' : '>=', subQuery)
      } else {
        query.andWhere('seq', order === 'asc' ? '<' : '>', subQuery)
      }
    }
    if (first) {
      query.limit(first)
    }
    return query
  }

  public responseRange = async ({
    id,
    order,
    state,
  }: {
    id: string
    order: string
    state: string
  }) => {
    const query = this.makeResponseQuery({ id, order, state, fields: '' })
    const { count, max, min } = (await query
      .max('seq')
      .min('seq')
      .count()
      .first()) as Record<string, any>
    return {
      count: parseInt(count, 10),
      max: parseInt(max, 10),
      min: parseInt(min, 10),
    }
  }

  /*********************************
   *                               *
   *          Transaction          *
   *                               *
   *********************************/
  /**
   * Count an article's transactions by a given articleId.
   */
  public countTransactions = async ({
    purpose = TRANSACTION_PURPOSE.donation,
    state = TRANSACTION_STATE.succeeded,
    targetId,
    targetType = TRANSACTION_TARGET_TYPE.article,
    senderId,
  }: {
    purpose?: TRANSACTION_PURPOSE
    state?: TRANSACTION_STATE
    targetId: string
    targetType?: TRANSACTION_TARGET_TYPE
    senderId?: string
  }) => {
    const { id: entityTypeId } = await this.baseFindEntityTypeId(targetType)
    const result = await this.knexRO
      .select()
      .from((knex: Knex.QueryBuilder) => {
        const source = knex
          .select('sender_id', 'target_id')
          .from('transaction')
          .where({
            purpose,
            state,
            targetId,
            targetType: entityTypeId,
          })
          .groupBy('sender_id', 'target_id')
        source.as('source')
      })
      .modify((builder: Knex.QueryBuilder) => {
        if (senderId) {
          builder.where({ senderId })
        }
      })
      .count()
      .first()

    return parseInt((result?.count as string) || '0', 10)
  }

  /**
   * Find an article's transactions by a given articleId.
   */
  public findTransactions = async ({
    take,
    skip,
    purpose = TRANSACTION_PURPOSE.donation,
    state = TRANSACTION_STATE.succeeded,
    targetId,
    targetType = TRANSACTION_TARGET_TYPE.article,
    senderId,
  }: {
    take?: number
    skip?: number
    purpose?: TRANSACTION_PURPOSE
    state?: TRANSACTION_STATE
    targetId: string
    targetType?: TRANSACTION_TARGET_TYPE
    senderId?: string
  }) => {
    const { id: entityTypeId } = await this.baseFindEntityTypeId(targetType)
    return this.knex('transaction')
      .select('sender_id', 'target_id')
      .where({
        purpose,
        state,
        targetId,
        targetType: entityTypeId,
      })
      .groupBy('sender_id', 'target_id')
      .sum('amount as amount')
      .max('created_at as created_at')
      .orderBy('created_at', 'desc')
      .modify((builder: Knex.QueryBuilder) => {
        if (skip !== undefined && Number.isFinite(skip)) {
          builder.offset(skip)
        }
        if (take !== undefined && Number.isFinite(take)) {
          builder.limit(take)
        }
        if (senderId) {
          builder.where({ senderId })
        }
      })
  }

  /**
   * Count articles which also donated by the donator of a given article
   */
  private makeRelatedDonationsQuery = ({
    articleId,
    targetTypeId,
    notIn,
  }: {
    articleId: string
    targetTypeId: string
    notIn: string[]
  }) => {
    // 1 LIKE = 0.05 HKD
    const RATE_HKD_TO_LIKE = 20

    const baseWhere = {
      targetType: targetTypeId,
      state: TRANSACTION_STATE.succeeded,
      purpose: TRANSACTION_PURPOSE.donation,
    }

    const donatorsQuery = this.knex('transaction')
      .select('sender_id as user_id')
      .where({
        targetId: articleId,
        ...baseWhere,
      })
      .groupBy('sender_id')
      .as('donators')

    const relatedDonationsQuery = this.knex('transaction')
      .select('target_id')
      .select(
        this.knex.raw(`
            sum(
              CASE WHEN currency = 'HKD' THEN
                amount * ${RATE_HKD_TO_LIKE}
              ELSE
                amount
              END
            ) score
          `)
      )
      .rightJoin(donatorsQuery, 'donators.user_id', 'transaction.sender_id')
      .where({ ...baseWhere })
      .whereNotIn('target_id', notIn)
      .groupBy('target_id')
      .as('related_donations')

    return this.knex
      .select('article.*')
      .from(this.table)
      .rightJoin(
        relatedDonationsQuery,
        'article.id',
        'related_donations.target_id'
      )
      .where({ state: ARTICLE_STATE.active })
  }

  public countRelatedDonations = async ({
    articleId,
    notIn,
  }: {
    articleId: string
    notIn: string[]
  }) => {
    const { id: entityTypeId } = await this.baseFindEntityTypeId(
      TRANSACTION_TARGET_TYPE.article
    )

    const query = this.makeRelatedDonationsQuery({
      articleId,
      targetTypeId: entityTypeId,
      notIn,
    })

    const result = await this.knex.from(query.as('base')).count().first()

    return parseInt(result ? (result.count as string) : '0', 10)
  }

  /**
   * Find articles which also donated by the donator of a given article
   */
  public findRelatedDonations = async ({
    articleId,
    notIn,
    take,
    skip,
  }: {
    articleId: string
    notIn: string[]
    take?: number
    skip?: number
  }) => {
    const { id: entityTypeId } = await this.baseFindEntityTypeId(
      TRANSACTION_TARGET_TYPE.article
    )

    const query = this.makeRelatedDonationsQuery({
      articleId,
      targetTypeId: entityTypeId,
      notIn,
    })

    if (skip !== undefined && Number.isFinite(skip)) {
      query.offset(skip)
    }
    if (take !== undefined && Number.isFinite(take)) {
      query.limit(take)
    }

    return query.orderBy('score')
  }

  /*********************************
   *                               *
   *            Access             *
   *                               *
   *********************************/
  public findArticleCircle = async (articleId: string) =>
    this.knex
      .select('article_circle.*')
      .from('article_circle')
      .join('circle', 'article_circle.circle_id', 'circle.id')
      .where({
        'article_circle.article_id': articleId,
        'circle.state': CIRCLE_STATE.active,
      })
      .first()

  public countReaders = async (articleId: string): Promise<number> => {
    const res = await this.knexRO('article_ga4_data')
      .where({ articleId })
      .select(this.knex.raw('SUM(total_users) as reader_amount'))
      .first()
    return parseInt(res?.readerAmount || '0', 10)
  }

  public latestArticles = async ({
    skip,
    take,
    maxTake,
    oss,
  }: {
    skip: number
    take: number
    maxTake: number
    oss: boolean
  }) => {
    const query = this.knexRO
      .select('article_set.draft_id', 'article_set.id')
      .from(
        this.knexRO
          .select('id', 'draft_id', 'author_id')
          .from('article')
          .where({ state: ARTICLE_STATE.active })
          .whereNotIn(
            'author_id',
            this.knexRO('user_restriction')
              .select('user_id')
              .where('type', 'articleNewest')
          )
          .orderBy('id', 'desc')
          .limit(maxTake * 2) // add some extra to cover excluded ones in settings
          .as('article_set')
      )
      .leftJoin(
        'article_recommend_setting as setting',
        'article_set.id',
        'setting.article_id'
      )
      .where((builder: Knex.QueryBuilder) => {
        if (!oss) {
          builder.whereRaw('in_newest IS NOT false')
        }
      })
      .as('newest')

    return this.knexRO
      .select()
      .from(query.limit(maxTake))
      .orderBy('id', 'desc')
      .offset(skip)
      .limit(take)
  }
}
