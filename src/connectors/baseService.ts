import type { Connections } from 'definitions'
import type { Redis } from 'ioredis'

import DataLoader from 'dataloader'
import { Knex } from 'knex'
import _ from 'lodash'

import { getLogger } from 'common/logger'
import { aws, cfsvc } from 'connectors'
import { Item, ItemData, TableName } from 'definitions'

const logger = getLogger('service-base')

export class BaseService {
  protected table: TableName
  protected aws: typeof aws
  protected cfsvc: typeof cfsvc
  protected connections: Connections
  protected knex: Knex
  protected knexRO: Knex
  protected searchKnex: Knex
  protected redis: Redis
  dataloader: DataLoader<string, Item>

  public constructor(table: TableName, connections: Connections) {
    this.table = table
    this.connections = connections
    this.knex = connections.knex
    this.knexRO = connections.knexRO
    this.searchKnex = connections.knexSearch
    this.redis = connections.redis
    this.aws = aws
    this.cfsvc = cfsvc
  }

  public baseCount = async (
    where?: { [key: string]: any },
    table?: TableName
  ) => {
    const query = this.knex(table || this.table)
      .count()
      .first()

    if (where) {
      query.where(where)
    }

    const result = await query
    return parseInt(result ? (result.count as string) : '0', 10)
  }

  /**
   * Find an item by a given id.
   */
  public baseFindById = async (
    id: string,
    table?: TableName
  ): Promise<any | null> =>
    this.knex // .select()
      .from(table || this.table)
      .where({ id })
      .first()

  /**
   * Find items by given ids.
   */

  public baseFindByIds = async (ids: readonly string[], table?: TableName) => {
    let rows = await this.knex
      .select()
      .from(table || this.table)
      .whereIn('id', ids as string[])

    rows = ids.map((id) => rows.find((r: any) => r.id === id))

    return rows
  }

  /**
   * Find an item by a given uuid.
   *
   */
  public baseFindByUUID = async (
    uuid: string,
    table?: TableName
  ): Promise<any | null> => {
    const result = await this.knex
      .select()
      .from(table || this.table)
      .where('uuid', uuid)

    if (result && result.length > 0) {
      return result[0]
    }

    return null
  }

  /**
   * Find items by given ids.
   */
  public baseFindByUUIDs = async (
    uuids: readonly string[],
    table?: TableName
  ) => {
    let rows = await this.knex
      .select()
      .from(table || this.table)
      .whereIn('uuid', uuids as string[])

    rows = uuids.map((uuid) => rows.find((r: any) => r.uuid === uuid))

    return rows
  }

  /**
   * Find items by given "where", "offset" and "limit"
   */
  public baseFind = async ({
    table,
    select = ['*'],
    where,
    orderBy, // = [{ column: 'id', order: 'desc' }],
    skip,
    take,
    returnTotalCount,
  }: {
    table?: TableName
    // where?: { [key: string]: any }
    select?: string[]
    where?: Record<string, any>
    orderBy?: Array<{ column: string; order: 'asc' | 'desc' }>
    skip?: number
    take?: number
    returnTotalCount?: boolean
  }) => {
    if (returnTotalCount) {
      select.push(
        this.knex.raw('count(1) OVER() AS total_count') as any as string
      )
    }

    const query = this.knex.select(select).from(table || this.table)

    if (where) {
      query.where(where)
    }
    if (orderBy) {
      query.orderBy(orderBy)
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
   * Create item
   */
  public baseCreate = async (
    data: ItemData,
    table?: TableName,
    columns: string[] = ['*'],
    // onConflict?: [ 'ignore' ] | [ 'merge' ],
    modifier?: (builder: Knex.QueryBuilder) => void,
    trx?: Knex.Transaction
  ) => {
    try {
      const query = this.knex(table || this.table)
        .insert(data)
        .returning(columns)
      if (modifier) {
        query.modify(modifier)
      }
      if (trx) {
        query.transacting(trx)
      }
      const [result] = await query

      return result
    } catch (err) {
      logger.error(err)
      throw err
    }
  }

  /**
   * Create a batch of items
   */
  public baseBatchCreate = async (
    dataItems: ItemData[],
    table?: TableName,
    trx?: Knex.Transaction
  ) => {
    const query = this.knex
      .batchInsert(table || this.table, dataItems)
      .returning('*')
    if (trx) {
      query.transacting(trx)
    }
    return query
  }

  /**
   * Create or Update Item
   */
  public baseUpdateOrCreate = async ({
    where,
    data,
    table,
    createOptions,
    updateUpdatedAt,
    trx,
  }: {
    where: { [key: string]: any }
    data: ItemData
    table?: TableName
    createOptions?: { [key: string]: any }
    updateUpdatedAt?: boolean
    trx?: Knex.Transaction
  }) => {
    const tableName = table || this.table
    const item = await this.knex(tableName).select().where(where).first()

    // create
    if (!item) {
      let createData = data
      if (createOptions) {
        createData = { ...createData, ...createOptions }
      }
      return this.baseCreate(createData, tableName, undefined, undefined, trx)
    }

    // update
    const query = this.knex(tableName)
      .where(where)
      .update({
        ...data,
        ...(updateUpdatedAt ? { updatedAt: this.knex.fn.now() } : null),
      })
      .returning('*')

    if (trx) {
      query.transacting(trx)
    }

    const [updatedItem] = await query

    return updatedItem
  }

  /**
   * Find or Create Item
   */
  public baseFindOrCreate = async ({
    where,
    data,
    table,
    columns = ['*'],
    modifier,
    skipCreate = false,
    trx,
  }: {
    where: { [key: string]: any }
    data: ItemData
    table?: TableName
    columns?: string[]
    modifier?: (builder: Knex.QueryBuilder) => void
    skipCreate?: boolean
    trx?: Knex.Transaction
  }) => {
    const tableName = table || this.table
    const item = await this.knex(tableName).select(columns).where(where).first()

    // create
    if (!item && !skipCreate) {
      return this.baseCreate(data, tableName, columns, modifier, trx)
    }

    // find
    return item
  }

  /**
   * Update an item by a given id.
   */
  public baseUpdate = async (
    id: string,
    data: ItemData,
    table?: TableName,
    trx?: Knex.Transaction
  ) => {
    const query = this.knex
      .where('id', id)
      .update({ ...data, updatedAt: this.knex.fn.now() })
      .into(table || this.table)
      .returning('*')

    if (trx) {
      query.transacting(trx)
    }
    const [updatedItem] = await query

    logger.debug('Updated id %s in %s', id, table ?? this.table)
    return updatedItem
  }
  /**
   * Update a batch of items by given ids.
   */
  public baseBatchUpdate = async (
    ids: string[],
    data: ItemData,
    table?: TableName
  ) =>
    this.knex
      .whereIn('id', ids)
      .update(data)
      .into(table || this.table)
      .returning('*')

  /**
   * Delete an item by a given id.
   */
  public baseDelete = async (id: string, table?: TableName) =>
    this.knex(table || this.table)
      .where({ id })
      .del()

  /**
   * Delete a batch of items by  given ids.
   */
  protected baseBatchDelete = async (ids: string[], table?: TableName) =>
    this.knex(table || this.table)
      .whereIn('id', ids)
      .del()

  /**
   * Find entity type id by a given type string.
   */
  public baseFindEntityTypeId = async (entityType: string) =>
    this.knexRO('entity_type').select('id').where({ table: entityType }).first()

  /**
   * Find entity type table by a given id.
   */
  public baseFindEntityTypeTable = async (id: string) =>
    this.knexRO('entity_type').select('table').where({ id }).first()
}
