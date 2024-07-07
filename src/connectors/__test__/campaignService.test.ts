import type { Connections } from 'definitions'

import { CAMPAIGN_STATE, USER_STATE, CAMPAIGN_USER_STATE } from 'common/enums'
import { ForbiddenError } from 'common/errors'
import { CampaignService, AtomService } from 'connectors'

import { genConnections, closeConnections } from './utils'

let connections: Connections
let campaignService: CampaignService
let atomService: AtomService

beforeAll(async () => {
  connections = await genConnections()
  campaignService = new CampaignService(connections)
  atomService = new AtomService(connections)
}, 30000)

afterAll(async () => {
  await closeConnections(connections)
})

const campaignData = {
  name: 'test',
  description: 'test',
  link: 'https://test.com',
  applicationPeriod: [
    new Date('2010-01-01 11:30'),
    new Date('2010-01-01 15:00'),
  ] as const,
  writingPeriod: [
    new Date('2010-01-02 11:30'),
    new Date('2010-01-02 15:00'),
  ] as const,
  creatorId: '1',
}

describe('create writing_challenge campaign', () => {
  test('success', async () => {
    const campaign = await campaignService.createWritingChallenge(campaignData)
    expect(campaign).toBeDefined()
    expect(campaign.state).toBe(CAMPAIGN_STATE.pending)

    // add stages

    const stages1 = [{ name: 'stage1' }, { name: 'stage2' }]
    const stages1Result = await campaignService.updateStages(
      campaign.id,
      stages1
    )
    expect(stages1Result.map((s) => s.name)).toEqual(stages1.map((s) => s.name))
    expect(stages1Result.map((s) => s.period)).toEqual([null, null])

    // update stages

    const stages2 = [
      {
        name: 'stage1',
        period: [
          new Date('2010-01-03 11:30'),
          new Date('2010-01-03 15:00'),
        ] as const,
      },
      {
        name: 'stage3',
        period: [
          new Date('2010-01-03 11:30'),
          new Date('2010-01-03 15:00'),
        ] as const,
      },
    ]
    const stages2Result = await campaignService.updateStages(
      campaign.id,
      stages2
    )
    expect(stages2Result.map((s) => s.name)).toEqual(stages2.map((s) => s.name))
    expect(stages2Result[0].period).not.toBeNull()
  })
})

test('find all campaigns', async () => {
  const pendingCampaign = await campaignService.createWritingChallenge({
    ...campaignData,
    state: CAMPAIGN_STATE.pending,
  })
  const activeCampaign = await campaignService.createWritingChallenge({
    ...campaignData,
    state: CAMPAIGN_STATE.active,
  })
  const finishedCampaign = await campaignService.createWritingChallenge({
    ...campaignData,
    state: CAMPAIGN_STATE.finished,
  })
  const archivedCampaign = await campaignService.createWritingChallenge({
    ...campaignData,
    state: CAMPAIGN_STATE.archived,
  })
  const [campaigns1, totalCount1] = await campaignService.findAndCountAll(
    { take: 10, skip: 0 },
    { excludeStates: [] }
  )
  const campaignIds1 = campaigns1.map((c) => c.id)
  expect(campaigns1.length).toBeGreaterThan(0)
  expect(totalCount1).toBeGreaterThan(0)
  expect(campaignIds1).toContain(pendingCampaign.id)
  expect(campaignIds1).toContain(activeCampaign.id)
  expect(campaignIds1).toContain(finishedCampaign.id)
  expect(campaignIds1).toContain(archivedCampaign.id)

  const [campaigns2, totalCount2] = await campaignService.findAndCountAll({
    take: 10,
    skip: 0,
  })
  const campaignIds2 = campaigns2.map((c) => c.id)

  expect(campaigns2.length).toBeLessThan(campaigns1.length)
  expect(totalCount2).toBeLessThan(totalCount1)
  expect(campaignIds2).not.toContain(archivedCampaign.id)
  expect(campaignIds2).not.toContain(pendingCampaign.id)
})

describe('application', () => {
  test('apply successfully', async () => {
    const user = await atomService.findFirst({
      table: 'user',
      where: { state: USER_STATE.active },
    })
    const campaign = await campaignService.createWritingChallenge({
      state: CAMPAIGN_STATE.active,
      ...campaignData,
    })
    const application = await campaignService.apply(campaign, user)
    expect(application).toBeDefined()
    expect(application.state).toBe(CAMPAIGN_USER_STATE.pending)

    const application2 = await campaignService.apply(campaign, user)
    expect(application2).toBeDefined()
    expect(application2.id).toBe(application.id)
  })
  test('campaign applicationPeriod is checked', async () => {
    const now = new Date()
    const future1 = new Date(now.getTime() + 1000 * 60 * 60 * 24)
    const future2 = new Date(now.getTime() + 1000 * 60 * 60 * 48)
    const campaign = await campaignService.createWritingChallenge({
      state: CAMPAIGN_STATE.active,
      ...campaignData,
      applicationPeriod: [future1, future2] as const,
    })
    const user = await atomService.findFirst({
      table: 'user',
      where: { state: USER_STATE.active },
    })
    expect(campaignService.apply(campaign, user)).rejects.toThrowError(
      ForbiddenError
    )
  })
})
