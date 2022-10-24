import { invalidateFQC } from '@matters/apollo-response-cache'
import Queue from 'bull'
import _capitalize from 'lodash/capitalize'

import {
  BLOCKCHAIN_SAFE_CONFIRMS,
  BLOCKCHAIN_TRANSACTION_STATE,
  DB_NOTICE_TYPE,
  MINUTE,
  NODE_TYPES,
  PAYMENT_CURRENCY,
  PAYMENT_PROVIDER,
  QUEUE_CONCURRENCY,
  QUEUE_JOB,
  QUEUE_NAME,
  QUEUE_PRIORITY,
  TRANSACTION_PURPOSE,
  TRANSACTION_REMARK,
  TRANSACTION_STATE,
} from 'common/enums'
import { USDTContractAddress, USDTContractDecimals } from 'common/environment'
import { PaymentQueueJobDataError, UnknownError } from 'common/errors'
import {
  fromTokenBaseUnit,
  getQueueNameForEnv,
  numRound,
  toTokenBaseUnit,
} from 'common/utils'
import { PaymentService } from 'connectors'
import { CurationContract, CurationEvent, Log } from 'connectors/blockchain'
import { GQLChain, Transaction, User } from 'definitions'

import { BaseQueue } from '../baseQueue'

interface PaymentParams {
  txId: string
}

class PayToByBlockchainQueue extends BaseQueue {
  paymentService: InstanceType<typeof PaymentService>
  delay: number

  constructor() {
    super(getQueueNameForEnv(QUEUE_NAME.payToByBlockchain))
    this.paymentService = new PaymentService()
    this.addConsumers()
    this.delay = 5000 // 5s
  }

  /**
   * Producers
   *
   */
  payTo = ({ txId }: PaymentParams) => {
    return this.q.add(
      QUEUE_JOB.payTo,
      { txId },
      {
        delay: this.delay,
        attempts: 8, // roughly total 20 min before giving up
        backoff: {
          type: 'exponential',
          delay: this.delay,
        },
        priority: QUEUE_PRIORITY.NORMAL,
      }
    )
  }

  addRepeatJobs = async () => {
    this.q.add(
      QUEUE_JOB.syncCurationEvents,
      {},
      {
        priority: QUEUE_PRIORITY.NORMAL,
        repeat: { every: MINUTE * 30 },
      }
    )
  }
  // private handleReorgEvent = async (transactionId: string) => {

  //   const tx = await this.paymentService.baseFindById(
  //     transactionId
  //   )
  //   const curation = new CurationContract()
  //   const receipt = await curation.fetchTxReceipt(txHash)

  //   if (tx.state === TRANSACTION_STATE.succeeded) {
  //     if (!receipt) {
  //       // blochchain tx not mined after reorg, update tx to pending
  //       await this.resetBothTxAndBlockchainTx(
  //         transactionId,
  //         tx.providerTxId
  //       )
  //     }
  //     if (receipt && receipt.reverted) {
  //       // blochchain tx failed after reorg, update tx to failed
  //       await this.failBothTxAndBlockchainTx(
  //         transactionId,
  //         tx.providerTxId
  //       )
  //     }
  //   }

  //   if (tx.state === TRANSACTION_STATE.failed) {
  //     if (receipt && !receipt.reverted) {
  //       // blochchain tx succeeded after reorg, update tx to failed
  //       await this.succeedBothTxAndBlockchainTx(
  //         transactionId,
  //         tx.providerTxId
  //       )
  //     }
  //   }
  // }
  /**
   * syncCurationEvents helpers
   *
   */
  fetchCurationLogs = async (
    curation: CurationContract,
    savepoint: number | null
  ): Promise<[Array<Log<CurationEvent>>, number]> => {
    const safeBlockNum =
      (await curation.fetchBlockNumber()) - BLOCKCHAIN_SAFE_CONFIRMS.Polygon

    const fromBlockNum = savepoint ? savepoint + 1 : 0

    if (fromBlockNum === 0) {
      // no sync record in db , request getLog without block range
      const logs = await curation.fetchLogs()
      const filtered = logs.filter((e) => e.blockNumber <= safeBlockNum)

      const newSavepoint =
        logs.length === filtered.length
          ? safeBlockNum
          : filtered[filtered.length - 1].blockNumber

      return [filtered, newSavepoint]
    } else {
      // sync record in db , request getLog with block range
      // as provider only accept 2000 blocks range
      const toBlockNum = Math.min(safeBlockNum, fromBlockNum + 1999)
      if (fromBlockNum >= toBlockNum) {
        return [[], savepoint as number]
      }
      return [await curation.fetchLogs(fromBlockNum, toBlockNum), toBlockNum]
    }
  }

  syncCurationEvents = async (logs: Array<Log<CurationEvent>>) => {
    const events = []
    for (const log of logs) {
      if (!log.removed) {
        const data: any = { ...log.event }
        const blockchainTx =
          await this.paymentService.findOrCreateBlockchainTransaction(
            { chain: GQLChain.Polygon, txHash: log.txHash },
            { state: BLOCKCHAIN_TRANSACTION_STATE.succeeded }
          )
        data.blockchainTransactionId = blockchainTx.id
        data.contractAddress = log.address
        await this.handleNewEvent(log, blockchainTx)

        events.push(data)
      } else {
        // getlogs from final blocks should not return removed logs
        throw new UnknownError('unexpected removed logs')
      }
    }
    if (events.length >= 0) {
      await this.paymentService.baseBatchCreate(
        events,
        'blockchain_curation_event'
      )
    }
  }

  /**
   * Consumers
   *
   */
  private addConsumers = () => {
    this.q.process(
      QUEUE_JOB.payTo,
      QUEUE_CONCURRENCY.payToByBlockchain,
      this.handlePayTo
    )
    this.q.process(
      QUEUE_JOB.syncCurationEvents,
      1,
      this.handleSyncCurationEvents
    )
  }

  /**
   * Pay-to handler.
   *
   */
  private handlePayTo: Queue.ProcessCallbackFunction<unknown> = async (job) => {
    const data = job.data as PaymentParams
    const txId = data.txId

    const tx = await this.paymentService.baseFindById(txId)
    if (!tx) {
      job.discard()
      throw new PaymentQueueJobDataError('pay-to pending tx not found')
    }

    if (tx.provider !== PAYMENT_PROVIDER.blockchain) {
      job.discard()
      throw new PaymentQueueJobDataError('wrong pay-to queue')
    }

    const blockchainTx =
      await this.paymentService.findBlockchainTransactionById(tx.providerTxId)

    if (!blockchainTx) {
      job.discard()
      throw new PaymentQueueJobDataError('blockchain transaction not found')
    }

    const curation = new CurationContract()
    const txReceipt = await curation.fetchTxReceipt(blockchainTx.txHash)

    if (!txReceipt) {
      throw new PaymentQueueJobDataError('blockchain transaction not mined')
    }

    if (txReceipt.reverted) {
      await this.failBothTxAndBlockchainTx(txId, blockchainTx.id)
      return data
    }
    const [recipient, sender, article] = await Promise.all([
      this.userService.baseFindById(tx.recipientId),
      this.userService.baseFindById(tx.senderId),
      this.atomService.findFirst({
        table: 'article',
        where: { id: tx.targetId },
      }),
    ])

    const creatorAddress = recipient.ethAddress
    const curatorAddress = sender.ethAddress
    const cid = article.dataHash
    const tokenAddress = USDTContractAddress
    const amount = tx.amount
    const decimals = USDTContractDecimals

    // txReceipt does not match with tx record in database
    if (
      !(await this.containMatchedEvent(txReceipt.events, {
        creatorAddress,
        curatorAddress,
        cid,
        tokenAddress,
        amount,
        decimals,
      }))
    ) {
      await this.updateTxAndBlockchainTxState(
        {
          txId,
          txState: TRANSACTION_STATE.canceled,
          txRemark: TRANSACTION_REMARK.INVALID,
        },
        {
          blockchainTxId: blockchainTx.id,
          blockchainTxState: BLOCKCHAIN_TRANSACTION_STATE.succeeded,
        }
      )
      return data
    }

    // update pending tx
    await this.succeedBothTxAndBlockchainTx(txId, blockchainTx.id)

    this.notify({ tx, sender, recipient, article })
    this.invalidCache(tx.targetType, tx.transactionId)
    job.progress(100)

    return data
  }

  /**
   * syncCurationEvents handler.
   *
   */
  private handleSyncCurationEvents: Queue.ProcessCallbackFunction<unknown> =
    async (job) => {
      // fetch events
      const syncRecordTable = 'blockchain_sync_record'
      const curation = new CurationContract()
      const chainId = curation.chainId
      const contractAddress = curation.address
      const record = await this.atomService.findFirst({
        table: syncRecordTable,
        where: { chainId, contractAddress },
      })
      const oldSavepoint = record ? parseInt(record.blockNumber, 10) : null
      const [logs, newSavepoint] = await this.fetchCurationLogs(
        curation,
        oldSavepoint
      )

      // update tx state and save events
      await this.syncCurationEvents(logs)

      // save progress
      await this.paymentService.baseUpdateOrCreate({
        table: syncRecordTable,
        where: { chainId, contractAddress },
        data: { chainId, contractAddress, blockNumber: newSavepoint },
      })

      return { newSavepoint }
    }

  private handleNewEvent = async (
    log: Log<CurationEvent>,
    blockchainTx: {
      id: string
      transactionId: string
      state: BLOCKCHAIN_TRANSACTION_STATE
    }
  ) => {
    const event = log.event
    // related tx record has resolved
    if (
      blockchainTx.transactionId &&
      blockchainTx.state === BLOCKCHAIN_TRANSACTION_STATE.succeeded
    ) {
      return
    }

    // check if donation is from Matters

    if (
      !ignoreCaseMatch(event.tokenAddress, USDTContractAddress) ||
      !isValidUri(event.uri)
    ) {
      return
    }

    const curatorUser = await this.userService.findByEthAddress(
      event.curatorAddress
    )
    if (!curatorUser) {
      return
    }

    const creatorUser = await this.userService.findByEthAddress(
      event.creatorAddress
    )
    if (!creatorUser) {
      return
    }

    const cid = extractCid(event.uri)
    const articles = await this.articleService.baseFind({
      where: { author_id: creatorUser.id, data_hash: cid },
    })
    if (articles.length === 0) {
      return
    }
    const article = articles[0]

    // donation is from Matters
    const amount = parseFloat(
      fromTokenBaseUnit(event.amount, USDTContractDecimals)
    )

    if (blockchainTx.transactionId) {
      // this blackchain tx record, related tx record, validate it
      const tx = await this.paymentService.baseFindById(
        blockchainTx.transactionId
      )
      if (
        tx.senderId === curatorUser.id &&
        tx.recipientId === creatorUser.id &&
        tx.targetId === article.id &&
        toTokenBaseUnit(tx.amount, USDTContractDecimals) === event.amount
      ) {
        // related tx record is valid, update its state
        await this.succeedBothTxAndBlockchainTx(tx.id, blockchainTx.id)
      } else {
        // related tx record is invalid, update its state
        // cancel it and add new one
        const trx = await this.knex.transaction()
        try {
          await this.paymentService.baseUpdate(
            tx.id,
            {
              state: TRANSACTION_STATE.canceled,
              remark: TRANSACTION_REMARK.INVALID,
            },
            'transaction',
            trx
          )
          const newTx = await this.paymentService.createTransaction(
            {
              amount,
              state: TRANSACTION_STATE.succeeded,
              purpose: TRANSACTION_PURPOSE.donation,
              currency: PAYMENT_CURRENCY.USDT,
              provider: PAYMENT_PROVIDER.blockchain,
              providerTxId: blockchainTx.id,
              recipientId: creatorUser.id,
              senderId: curatorUser.id,
              targetId: article.id,
            },
            trx
          )
          await this.paymentService.baseUpdate(
            blockchainTx.id,
            {
              transactionId: newTx.id,
              state: BLOCKCHAIN_TRANSACTION_STATE.succeeded,
            },
            'blockchain_transaction',
            trx
          )
          await trx.commit()
        } catch (error) {
          await trx.rollback()
          throw error
        }
      }
    } else {
      // no related tx record, create one
      const trx = await this.knex.transaction()
      try {
        const tx = await this.paymentService.createTransaction(
          {
            amount,
            state: TRANSACTION_STATE.succeeded,
            purpose: TRANSACTION_PURPOSE.donation,
            currency: PAYMENT_CURRENCY.USDT,
            provider: PAYMENT_PROVIDER.blockchain,
            providerTxId: blockchainTx.id,
            recipientId: creatorUser.id,
            senderId: curatorUser.id,
            targetId: article.id,
          },
          trx
        )
        await this.paymentService.baseUpdate(
          blockchainTx.id,
          { transactionId: tx.id },
          'blockchain_transaction',
          trx
        )
        await trx.commit()
      } catch (error) {
        await trx.rollback()
        throw error
      }
    }
  }

  private updateTxAndBlockchainTxState = async (
    {
      txId,
      txState,
      txRemark,
    }: {
      txId: string
      txState: TRANSACTION_STATE
      txRemark?: TRANSACTION_REMARK
    },
    {
      blockchainTxId,
      blockchainTxState,
    }: {
      blockchainTxId: string
      blockchainTxState: BLOCKCHAIN_TRANSACTION_STATE
    }
  ) => {
    const trx = await this.knex.transaction()
    try {
      await this.paymentService.markTransactionStateAs(
        {
          id: txId,
          state: txState,
          remark: txRemark,
        },
        trx
      )
      await this.paymentService.markBlockchainTransactionStateAs(
        {
          id: blockchainTxId,
          state: blockchainTxState,
        },
        trx
      )
      await trx.commit()
    } catch (error) {
      await trx.rollback()
      throw error
    }
  }

  private failBothTxAndBlockchainTx = async (
    txId: string,
    blockchainTxId: string
  ) => {
    await this.updateTxAndBlockchainTxState(
      { txId, txState: TRANSACTION_STATE.failed },
      {
        blockchainTxId,
        blockchainTxState: BLOCKCHAIN_TRANSACTION_STATE.reverted,
      }
    )
  }

  private succeedBothTxAndBlockchainTx = async (
    txId: string,
    blockchainTxId: string
  ) => {
    await this.updateTxAndBlockchainTxState(
      { txId, txState: TRANSACTION_STATE.succeeded },
      {
        blockchainTxId,
        blockchainTxState: BLOCKCHAIN_TRANSACTION_STATE.succeeded,
      }
    )
  }
  // private resetBothTxAndBlockchainTx = async (
  //   txId: string,
  //   blockchainTxId: string
  // ) => {
  //   await this.updateTxAndBlockchainTxState(
  //     { txId, txState: TRANSACTION_STATE.pending },
  //     {
  //       blockchainTxId,
  //       blockchainTxState: BLOCKCHAIN_TRANSACTION_STATE.pending,
  //     }
  //   )
  // }

  private containMatchedEvent = async (
    events: CurationEvent[],
    {
      curatorAddress,
      creatorAddress,
      cid,
      tokenAddress,
      amount,
      decimals,
    }: {
      curatorAddress?: string
      creatorAddress?: string
      cid: string
      tokenAddress: string
      amount: string
      decimals: number
    }
  ) => {
    if (events.length === 0) {
      return false
    } else {
      if (!curatorAddress || !creatorAddress) {
        return false
      }
      for (const event of events) {
        if (
          ignoreCaseMatch(event.curatorAddress, curatorAddress) &&
          ignoreCaseMatch(event.creatorAddress, creatorAddress) &&
          ignoreCaseMatch(event.tokenAddress, tokenAddress) &&
          event.amount === toTokenBaseUnit(amount, decimals) &&
          isValidUri(event.uri) &&
          extractCid(event.uri) === cid
        ) {
          return true
        }
      }
    }
    return false
  }

  private notify = async ({
    tx,
    sender,
    recipient,
    article,
  }: {
    tx: Transaction
    sender: User
    recipient: User
    article: {
      title: string
      slug: string
      authorId: string
      mediaHash: string
    }
  }) => {
    const amount = numRound(parseFloat(tx.amount))
    // send email to sender
    const author = await this.atomService.findFirst({
      table: 'user',
      where: { id: article.authorId },
    })
    const _article = {
      id: tx.targetId,
      title: article.title,
      slug: article.slug,
      mediaHash: article.mediaHash,
      author: {
        displayName: author.displayName,
        userName: author.userName,
      },
    }

    this.notificationService.mail.sendPayment({
      to: sender.email,
      recipient: {
        displayName: sender.displayName,
        userName: sender.userName,
      },
      type: 'donated',
      article: _article,
      tx: {
        recipient,
        sender,
        amount,
        currency: tx.currency,
      },
    })

    // send email to recipient
    this.notificationService.trigger({
      event: DB_NOTICE_TYPE.payment_received_donation,
      actorId: sender.id,
      recipientId: recipient.id,
      entities: [{ type: 'target', entityTable: 'transaction', entity: tx }],
    })

    this.notificationService.mail.sendPayment({
      to: recipient.email,
      recipient: {
        displayName: recipient.displayName,
        userName: recipient.userName,
      },
      type: 'receivedDonation',
      tx: {
        recipient,
        sender,
        amount,
        currency: tx.currency,
      },
      article: _article,
    })
  }

  private invalidCache = async (targetType: string, targetId: string) => {
    // manaully invalidate cache
    if (targetType) {
      const entity = await this.userService.baseFindEntityTypeTable(targetType)
      const entityType =
        NODE_TYPES[
          (_capitalize(entity?.table) as keyof typeof NODE_TYPES) || ''
        ]
      if (entityType && this.cacheService) {
        invalidateFQC({
          node: { type: entityType, id: targetId },
          redis: this.cacheService.redis,
        })
      }
    }
  }
}

const ignoreCaseMatch = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase()

const isValidUri = (uri: string): boolean => /^ipfs:\/\//.test(uri)

const extractCid = (uri: string): string => uri.replace('ipfs://', '')

export const payToByBlockchainQueue = new PayToByBlockchainQueue()
