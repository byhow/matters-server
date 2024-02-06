import type {
  ActionCircle,
  ActionTag,
  Article,
  ArticleCircle,
  ArticleTag,
  ArticleTopic,
  ArticleChapter,
  ArticleConnection,
  ArticleContent,
  ArticleVersion,
  Asset,
  AssetMap,
  Appreciation,
  Chapter,
  Circle,
  CirclePrice,
  CircleInvitation,
  CircleSubscription,
  CircleSubscriptionItem,
  Collection,
  CollectionArticle,
  Comment,
  Connections,
  CryptoWalletSignature,
  CryptoWallet,
  Customer,
  Draft,
  PunishRecord,
  Tag,
  Topic,
  User,
  UserIpnsKeys,
  UserRestriction,
  UsernameEditHistory,
  VerificationCode,
  PayoutAccount,
  Transaction,
  BlockchainTransaction,
  BlockchainSyncRecord,
  EntityType,
} from 'definitions'
import type { Knex } from 'knex'

import DataLoader from 'dataloader'

import {
  EntityNotFoundError,
  ArticleNotFoundError,
  CommentNotFoundError,
} from 'common/errors'

type Mode = 'id' | 'uuid'

type TableTypeMap = {
  user: User
  user_ipns_keys: UserIpnsKeys
  username_edit_history: UsernameEditHistory
  user_restriction: UserRestriction
  asset: Asset
  asset_map: AssetMap
  draft: Draft
  article: Article
  article_version: ArticleVersion
  article_content: ArticleContent
  article_circle: ArticleCircle
  article_tag: ArticleTag
  article_topic: ArticleTopic
  article_chapter: ArticleChapter
  article_connection: ArticleConnection
  collection: Collection
  collection_article: CollectionArticle
  chapter: Chapter
  comment: Comment
  action_circle: ActionCircle
  action_tag: ActionTag
  circle: Circle
  circle_price: CirclePrice
  circle_invitation: CircleInvitation
  circle_subscription: CircleSubscription
  circle_subscription_item: CircleSubscriptionItem
  customer: Customer
  crypto_wallet: CryptoWallet
  crypto_wallet_signature: CryptoWalletSignature
  tag: Tag
  topic: Topic
  verification_code: VerificationCode
  punish_record: PunishRecord
  payout_account: PayoutAccount
  transaction: Transaction
  blockchain_transaction: BlockchainTransaction
  blockchain_sync_record: BlockchainSyncRecord
  entity_type: EntityType
  appreciation: Appreciation
}

type TableTypeMapKey = keyof TableTypeMap

interface InitLoaderInput {
  table: TableTypeMapKey
  mode: Mode
  error?: Error
}

type FindUniqueFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  where: { id: string } | { hash: string } | { uuid: string }
}) => Promise<D>

type FindFirstFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  select?: keyof D[]
  where: Partial<Record<string, any>>
  whereIn?: [string, string[]]
  orderBy?: Array<{ column: string; order: 'asc' | 'desc' }>
}) => Promise<D>

type FindManyFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  select?: Array<keyof D>
  where?: Partial<Record<keyof D, any>>
  whereIn?: [string, string[]]
  orderBy?: Array<{ column: string; order: 'asc' | 'desc' }>
  orderByRaw?: string
  modifier?: (builder: Knex.QueryBuilder) => void
  skip?: number
  take?: number
}) => Promise<D[]>

type CreateFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  data: Partial<D>
}) => Promise<D>

type UpdateFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  where: Partial<Record<keyof D, any>>
  data: Partial<D>
  columns?: Array<keyof D> | '*'
}) => Promise<D>

type UpdateManyFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  where: Partial<Record<keyof D, any>>
  data: Partial<D>
  columns?: Array<keyof D> | '*'
}) => Promise<D[]>

type UpdateJsonColumnFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  where: Partial<Record<keyof D, any>>
  jsonColumn?: string // default extra column name is 'extra'
  removeKeys?: string[] // keys to remove from extra json column
  jsonData?: Record<string, any> | null
  // resetNull?; boolean
  columns?: string[] | '*' // returning columns
}) => Promise<D>

type UpsertFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  where?: Partial<Record<keyof D, any>>
  create: Partial<D>
  update: Partial<D>
}) => Promise<D>

type DeleteManyFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  where?: Partial<Record<keyof D, any>>
  whereIn?: [string, string[]]
}) => Promise<void>

type CountFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  where: Partial<Record<keyof D, any>>
  whereIn?: [string, string[]]
}) => Promise<number>

type MaxFn = <
  Table extends TableTypeMapKey,
  D extends TableTypeMap[Table]
>(params: {
  table: Table
  where: Partial<Record<keyof D, any>>
  column: keyof D
}) => Promise<number>

interface AtomDataLoader<K, V> {
  load: (key: K) => Promise<V>
  loadMany: (keys: readonly K[]) => Promise<V[]>
}

/**
 * This object is a container for data loaders or system wide services.
 */
export class AtomService {
  private knex: Knex

  public articleIdLoader: AtomDataLoader<string, Article>
  public articleVersionIdLoader: AtomDataLoader<string, ArticleVersion>
  public articleContentIdLoader: AtomDataLoader<string, ArticleContent>
  public circleIdLoader: AtomDataLoader<string, Circle>
  public commentIdLoader: AtomDataLoader<string, Comment>
  public collectionIdLoader: AtomDataLoader<string, Collection>
  public draftIdLoader: AtomDataLoader<string, Draft>
  public userIdLoader: AtomDataLoader<string, User>
  public topicIdLoader: AtomDataLoader<string, Topic>
  public chapterIdLoader: AtomDataLoader<string, Chapter>
  public tagIdLoader: AtomDataLoader<string, Tag>
  public transactionIdLoader: AtomDataLoader<string, Transaction>

  public constructor(connections: Connections) {
    this.knex = connections.knex

    this.articleIdLoader = this.initLoader({
      table: 'article',
      mode: 'id',
      error: new ArticleNotFoundError('Cannot find article'),
    })
    this.articleVersionIdLoader = this.initLoader({
      table: 'article_version',
      mode: 'id',
    })
    this.articleContentIdLoader = this.initLoader({
      table: 'article_content',
      mode: 'id',
    })
    this.draftIdLoader = this.initLoader({ table: 'draft', mode: 'id' })
    this.commentIdLoader = this.initLoader({
      table: 'comment',
      mode: 'id',
      error: new CommentNotFoundError('Cannot find comment'),
    })
    this.collectionIdLoader = this.initLoader({
      table: 'collection',
      mode: 'id',
    })
    this.circleIdLoader = this.initLoader({ table: 'circle', mode: 'id' })
    this.userIdLoader = this.initLoader({ table: 'user', mode: 'id' })
    this.topicIdLoader = this.initLoader({ table: 'topic', mode: 'id' })
    this.chapterIdLoader = this.initLoader({ table: 'chapter', mode: 'id' })
    this.tagIdLoader = this.initLoader({ table: 'tag', mode: 'id' })
    this.transactionIdLoader = this.initLoader({
      table: 'transaction',
      mode: 'id',
    })
  }

  /* Data Loader */

  /**
   * Initialize typical data loader.
   *
   * @remark
   *
   * loader throw error when it cannot find some entities.
   */
  public initLoader = <T>({
    table,
    mode,
    error,
  }: InitLoaderInput): AtomDataLoader<string, T> => {
    const batchFn = async (keys: readonly string[]) => {
      const records = await this.findMany({
        table,
        whereIn: [mode, keys as string[]],
      })

      if (records.findIndex((item: unknown) => !item) >= 0) {
        if (error) {
          throw error
        }
        throw new EntityNotFoundError(`Cannot find entity from ${table}`)
      }

      // fix order based on keys
      return keys.map((key) => records.find((r: any) => r[mode] === key)) as T[]
    }
    return new DataLoader(batchFn) as AtomDataLoader<string, T>
  }

  /* Basic CRUD */

  /**
   * Find an unique record.
   *
   * A Prisma like method for retrieving a record by specified id.
   */
  public findUnique: FindUniqueFn = async ({ table, where }) =>
    this.knex.select().from(table).where(where).first()

  /**
   * Find the first record in rows.
   *
   * A Prisma like method for getting the first record in rows.
   */
  public findFirst: FindFirstFn = async ({
    table,
    where,
    whereIn,
    orderBy,
  }) => {
    const query = this.knex.select().from(table).where(where)

    if (whereIn) {
      query.whereIn(...whereIn)
    }

    if (orderBy) {
      query.orderBy(orderBy)
    }

    return query.first()
  }

  /**
   * Find multiple records by given clauses.
   *
   * A Prisma like mehtod for fetching records.
   */
  public findMany: FindManyFn = async ({
    table,
    select = ['*'],
    where,
    whereIn,
    orderBy,
    orderByRaw,
    modifier,
    skip,
    take,
  }) => {
    const query = this.knex.select(select).from(table)

    if (where) {
      query.where(where)
    }

    if (whereIn) {
      query.whereIn(...whereIn)
    }

    if (orderBy) {
      query.orderBy(orderBy)
    }

    if (orderByRaw) {
      query.orderByRaw(orderByRaw)
    }

    if (modifier) {
      query.modify(modifier)
    }

    if (skip) {
      query.offset(skip)
    }

    if (take || take === 0) {
      query.limit(take)
    }
    return query
  }

  /**
   * Create a new record by given data.
   *
   * A Prisma like method for creating one record.
   */
  public create: CreateFn = async ({ table, data }) => {
    const [record] = await this.knex(table).insert(data).returning('*')
    return record
  }

  /**
   * Update an unique record.
   *
   * A Prisma like method for updating a record.
   */
  public update: UpdateFn = async ({ table, where, data, columns = '*' }) => {
    const [record] = await this.knex
      .where(where)
      .update({ ...data, updatedAt: this.knex.fn.now() })
      .into(table)
      .returning(columns as string)
    return record
  }

  public updateJsonColumn: UpdateJsonColumnFn = async ({
    table,
    where,
    jsonColumn = 'extra', // the json column's name
    removeKeys = [], // the keys to remove from jsonb data
    jsonData, // the extra data to append into jsonb data
    // resetNull,
    columns = '*',
  }) => {
    const [record] = await this.knex
      .table(table)
      .where(where)
      .update(
        jsonColumn,
        jsonData == null
          ? null
          : this.knex.raw(
              String.raw`(COALESCE(:jsonColumn:, '{}'::jsonb) - :removeKeys ::text[]) || :jsonData ::jsonb`,
              {
                jsonColumn,
                removeKeys,
                jsonData,
              }
            )
      )
      .update('updatedAt', this.knex.fn.now())
      .returning(columns)
    return record
  }

  /**
   * Update many records.
   *
   * A Prisma like method for updating many records.
   */
  public updateMany: UpdateManyFn = async ({
    table,
    where,
    data,
    columns = '*',
  }) => {
    const records = await this.knex
      .where(where)
      .update(data)
      .into(table)
      .returning(columns as string)
    return records
  }

  /**
   * Upsert an unique record.
   *
   * A Prisma like method for updating or creating a record.
   */
  public upsert: UpsertFn = async ({ table, where, create, update }) => {
    // TODO: Use onConflict instead
    // @see {@link https://github.com/knex/knex/pull/3763}
    const record = await this.knex(table)
      .select()
      .where(where as Record<string, any>)
      .first()

    // create
    if (!record) {
      return this.knex(table).insert(create).returning('*')
    }

    // update
    const [updatedRecord] = await this.knex(table)
      .where(where as Record<string, any>)
      .update({ ...update, updatedAt: this.knex.fn.now() })
      .returning('*')

    return updatedRecord
  }

  /**
   * Delete records.
   *
   * A Prisma like method for deleting multiple records.
   */
  public deleteMany: DeleteManyFn = async ({ table, where, whereIn }) => {
    const action = this.knex(table)
    if (where) {
      action.where(where as Record<string, any>)
    }
    if (whereIn) {
      action.whereIn(...whereIn)
    }
    await action.del()
  }

  /**
   * Count records.
   *
   * A Prisma like method for counting records.
   */
  public count: CountFn = async ({ table, where, whereIn }) => {
    const action = this.knex.count().from(table).where(where)
    if (whereIn) {
      action.whereIn(...whereIn)
    }
    const record = await action.first()

    return parseInt(record ? (record.count as string) : '0', 10)
  }

  /**
   * Max of given column.
   *
   * A Prisma like method for getting max.
   */
  public max: MaxFn = async ({ table, where, column }) => {
    const record = await this.knex(table).max(column).where(where).first()
    return parseInt(record ? (record.count as string) : '0', 10)
  }
}
