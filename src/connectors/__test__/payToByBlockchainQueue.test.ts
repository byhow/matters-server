import {
  BLOCKCHAIN,
  BLOCKCHAIN_CHAINID,
  BLOCKCHAIN_TRANSACTION_STATE,
  PAYMENT_CURRENCY,
  PAYMENT_PROVIDER,
  TRANSACTION_PURPOSE,
  TRANSACTION_REMARK,
  TRANSACTION_STATE,
  TRANSACTION_TARGET_TYPE,
} from 'common/enums'
import { environment, USDTContractAddress } from 'common/environment'
import { PaymentQueueJobDataError } from 'common/errors'
import { payToByBlockchainQueue } from 'connectors/queue'
import { GQLChain } from 'definitions'

import { getQueueResult } from './utils'

// setup mock

const mockFetchLogs = jest.fn()
const mockFetchTxReceipt = jest.fn()
const mockFetchBlockNumber = jest.fn()
jest.mock('connectors/blockchain', () => {
  return {
    __esModule: true,
    CurationContract: jest.fn().mockImplementation(() => {
      return {
        fetchTxReceipt: mockFetchTxReceipt,
        fetchLogs: mockFetchLogs,
        fetchBlockNumber: mockFetchBlockNumber,
        chainId: BLOCKCHAIN_CHAINID.Polygon.PolygonMumbai,
        address: environment.curationContractAddress.toLowerCase(),
      }
    }),
  }
})

// test data

const amount = 1
const state = TRANSACTION_STATE.pending
const purpose = TRANSACTION_PURPOSE.donation
const currency = PAYMENT_CURRENCY.USDT
const provider = PAYMENT_PROVIDER.blockchain
const invalidProviderTxId = '12345'
const recipientId = '1'
const senderId = '2'
const targetId = '1'
const targetType = TRANSACTION_TARGET_TYPE.article
const queue = payToByBlockchainQueue
const chain = BLOCKCHAIN.Polygon.valueOf() as GQLChain

const invalidTxhash =
  '0x209375f2de9ee7c2eed5e24eb30d0196a416924cd956a194e7060f9dcb39515b'
const failedTxhash =
  '0xbad52ae6172aa85e1f883967215cbdc5e70ddc479c7ee22da3c23d06820ee29e'
const txHash =
  '0x649cf52a3c7b6ba16e1d52d4fc409c9ca1307329e691147990abe59c8c16215c'

const invalidTxReceipt = {
  txHash: invalidTxhash,
  reverted: false,
  events: [],
}
const failedTxReceipt = {
  txHash: failedTxhash,
  reverted: true,
  events: [],
}
const txReceipt = {
  txHash,
  reverted: false,
  events: [
    {
      curatorAddress: '0x0ee160cb17e33d5ae367741992072942dfe70cba',
      creatorAddress: '0x999999cf1046e68e36e1aa2e0e07105eddd1f08e',
      uri: 'ipfs://someIpfsDataHash1',
      tokenAddress: USDTContractAddress,
      amount: '1000000000000000000',
    },
  ],
}

// tests

describe('payToByBlockchainQueue.payTo', () => {
  beforeAll(() => {
    queue.delay = 1
    mockFetchTxReceipt.mockClear()
    mockFetchTxReceipt.mockImplementation(async (hash: string) => {
      if (hash === invalidTxhash) {
        return invalidTxReceipt
      } else if (hash === failedTxhash) {
        return failedTxReceipt
      } else if (hash === txHash) {
        return txReceipt
      } else {
        return null
      }
    })
  })

  test('job with wrong tx id will fail', async () => {
    const wrongTxId = '12345'
    const job = await queue.payTo({ txId: wrongTxId })
    await expect(getQueueResult(queue.q, job.id)).rejects.toThrow(
      new PaymentQueueJobDataError('pay-to pending tx not found')
    )
    expect(await job.getState()).toBe('failed')
  })

  test('tx with wrong provier will fail', async () => {
    const tx = await queue.paymentService.createTransaction({
      amount,
      state,
      purpose,
      currency,
      provider: PAYMENT_PROVIDER.matters,
      providerTxId: invalidProviderTxId + '1',
      recipientId,
      senderId,
      targetId,
      targetType,
    })
    const job = await queue.payTo({ txId: tx.id })
    await expect(getQueueResult(queue.q, job.id)).rejects.toThrow(
      new PaymentQueueJobDataError('wrong pay-to queue')
    )
    expect(await job.getState()).toBe('failed')
  })

  test('tx with wrong providerTxId will fail', async () => {
    const tx = await queue.paymentService.createTransaction({
      amount,
      state,
      purpose,
      currency,
      provider,
      providerTxId: invalidProviderTxId + '2',
      recipientId,
      senderId,
      targetId,
      targetType,
    })
    const job = await queue.payTo({ txId: tx.id })
    await expect(getQueueResult(queue.q, job.id)).rejects.toThrow(
      new PaymentQueueJobDataError('blockchain transaction not found')
    )
    expect(await job.getState()).toBe('failed')
  })

  test('not mined tx will fail and retry', async () => {
    const tx =
      await queue.paymentService.findOrCreateTransactionByBlockchainTxHash({
        chain,
        txHash: 'fakeHash',
        amount,
        state,
        purpose,
        currency,
        recipientId,
        senderId,
        targetId,
        targetType,
      })
    const job = await queue.payTo({ txId: tx.id })
    await expect(getQueueResult(queue.q, job.id)).rejects.toThrow(
      new PaymentQueueJobDataError('blockchain transaction not mined')
    )
    expect(await job.getState()).toBe('active')
  })

  test('failed blockchain transation will mark transaction and blockchainTx as failed', async () => {
    const tx =
      await queue.paymentService.findOrCreateTransactionByBlockchainTxHash({
        chain,
        txHash: failedTxhash,
        amount,
        state,
        purpose,
        currency,
        recipientId,
        senderId,
        targetId,
        targetType,
      })
    const job = await queue.payTo({ txId: tx.id })
    expect(await getQueueResult(queue.q, job.id)).toStrictEqual({ txId: tx.id })
    const ret = await queue.paymentService.baseFindById(tx.id)
    expect(ret.state).toBe(TRANSACTION_STATE.failed)
    const blockchainTx = await queue.paymentService.baseFindById(
      tx.providerTxId,
      'blockchain_transaction'
    )
    expect(blockchainTx.state).toBe(BLOCKCHAIN_TRANSACTION_STATE.reverted)
  })

  test('succeeded invalid blockchain transaction will mark transaction as canceled', async () => {
    const tx =
      await queue.paymentService.findOrCreateTransactionByBlockchainTxHash({
        chain,
        txHash: invalidTxhash,
        amount,
        state,
        purpose,
        currency,
        recipientId,
        senderId,
        targetId,
        targetType,
      })
    const job = await queue.payTo({ txId: tx.id })
    expect(await getQueueResult(queue.q, job.id)).toStrictEqual({ txId: tx.id })
    const ret = await queue.paymentService.baseFindById(tx.id)
    expect(ret.state).toBe(TRANSACTION_STATE.canceled)
    expect(ret.remark).toBe(TRANSACTION_REMARK.INVALID)
    const blockchainTx = await queue.paymentService.baseFindById(
      tx.providerTxId,
      'blockchain_transaction'
    )
    expect(blockchainTx.state).toBe(BLOCKCHAIN_TRANSACTION_STATE.succeeded)
  })

  test('succeeded valid blockchain transaction will mark transaction and blockchainTx as succeeded', async () => {
    const curator = await queue.userService.create({
      userName: 'curator',
      ethAddress: '0x0ee160cb17e33d5ae367741992072942dfe70cba',
    })
    const tx =
      await queue.paymentService.findOrCreateTransactionByBlockchainTxHash({
        chain,
        txHash,
        amount,
        state,
        purpose,
        currency,
        recipientId,
        senderId: curator.id,
        targetId,
        targetType,
      })
    const job = await queue.payTo({ txId: tx.id })
    expect(await getQueueResult(queue.q, job.id)).toStrictEqual({ txId: tx.id })
    const ret = await queue.paymentService.baseFindById(tx.id)
    expect(ret.state).toBe(TRANSACTION_STATE.succeeded)
    const blockchainTx = await queue.paymentService.baseFindById(
      tx.providerTxId,
      'blockchain_transaction'
    )
    expect(blockchainTx.state).toBe(BLOCKCHAIN_TRANSACTION_STATE.succeeded)
  })
})

describe('payToByBlockchainQueue.syncCurationEvents', () => {
  const syncTable = 'blockchain_sync_record'
  const chainId = BLOCKCHAIN_CHAINID.Polygon.PolygonMumbai
  const contractAddress = environment.curationContractAddress.toLowerCase()
  const latestBlockNum = 30000128
  const knex = queue.knex

  beforeAll(() => {
    mockFetchTxReceipt.mockImplementation(async (hash: string) => {
      if (hash === invalidTxhash) {
        return invalidTxReceipt
      } else if (hash === failedTxhash) {
        return failedTxReceipt
      } else if (hash === txHash) {
        return txReceipt
      } else {
        return null
      }
    })
    mockFetchLogs.mockImplementation(
      async (fromBlock?: number, toBlock?: number) => {
        return []
      }
    )
    mockFetchBlockNumber.mockReturnValue(Promise.resolve(latestBlockNum))
  })
  beforeEach(async () => {
    await knex(syncTable).del()
  })
  test('fetch all logs if no sync record and add record', async () => {
    mockFetchLogs.mockClear()
    await queue._handleSyncCurationEvents()
    expect(mockFetchLogs).toHaveBeenCalledWith()

    const record = await queue.knex(syncTable).first()
    expect(record.chainId).toBe(chainId)
    expect(record.contractAddress).toBe(contractAddress)
    expect(record.blockNumber).toBe('30000000')
  })
  test.only('fetch logs in range if have sync record and update record', async () => {
    const oldBlockNum = '20000000'
    const inserted = await queue
      .knex(syncTable)
      .insert({ chainId, contractAddress, blockNumber: oldBlockNum }, [
        'chainId',
        'contractAddress',
        'blockNumber',
      ])
    expect(inserted[0].blockNumber).toBe(oldBlockNum)

    mockFetchLogs.mockClear()
    await queue._handleSyncCurationEvents()
    expect(mockFetchLogs).toHaveBeenCalledWith(20000001, 20002000)

    const record = await queue.knex(syncTable).first()
    expect(record.blockNumber).toBe('20002000')
  })
})
