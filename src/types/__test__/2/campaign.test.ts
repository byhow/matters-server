import type { Connections, User } from 'definitions'

import { v4 } from 'uuid'

import { IMAGE_ASSET_TYPE, LANGUAGE } from 'common/enums'
import { SystemService, AtomService } from 'connectors'

import { genConnections, closeConnections, testClient } from '../utils'

let connections: Connections
// let campaignService: CampaignService
let systemService: SystemService
let atomService: AtomService

beforeAll(async () => {
  connections = await genConnections()
  // campaignService = new CampaignService(connections)
  systemService = new SystemService(connections)
  atomService = new AtomService(connections)
}, 30000)

afterAll(async () => {
  await closeConnections(connections)
})

describe('create or update wrting challenges', () => {
  const PUT_WRITING_CHALLENGE = /* GraphQL */ `
    mutation ($input: PutWritingChallengeInput!) {
      putWritingChallenge(input: $input) {
        id
        shortHash
        name
        description
        cover
        link
        applicationPeriod {
          start
          end
        }
        writingPeriod {
          start
          end
        }
        stages {
          name
          period {
            start
            end
          }
        }
        state
      }
    }
  `
  const translations = [
    {
      text: 'test' + LANGUAGE.zh_hant,
      language: LANGUAGE.zh_hant,
    },
    { text: 'test' + LANGUAGE.zh_hans, language: LANGUAGE.zh_hans },
    { text: 'test' + LANGUAGE.en, language: LANGUAGE.en },
  ]
  const name = translations
  const description = translations
  let admin: User
  let normalUser: User
  let cover: string
  const link = 'https://test.com'
  const applicationPeriod = {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-02'),
  }
  const writingPeriod = {
    start: new Date('2024-01-03'),
    end: new Date('2024-01-04'),
  }
  const stages = [
    {
      name: translations,
      period: {
        start: new Date('2024-01-03'),
        end: new Date('2024-01-04'),
      },
    },
  ]
  beforeAll(async () => {
    admin = await atomService.findFirst({
      table: 'user',
      where: { role: 'admin' },
    })
    normalUser = await atomService.findFirst({
      table: 'user',
      where: { role: 'user' },
    })
    const asset = await systemService.findAssetOrCreateByPath(
      {
        uuid: v4(),
        authorId: admin.id,
        type: IMAGE_ASSET_TYPE.campaignCover,
        path: 'test.jpg',
      },
      '1',
      admin.id
    )
    cover = asset.uuid
  })
  test('create success', async () => {
    const server = await testClient({
      connections,
      isAuth: true,
      context: { viewer: admin },
    })
    const { data, errors } = await server.executeOperation({
      query: PUT_WRITING_CHALLENGE,
      variables: {
        input: {
          name,
          description,
          cover,
          link,
          applicationPeriod,
          writingPeriod,
          stages,
        },
      },
    })
    expect(errors).toBeUndefined()
    expect(data.putWritingChallenge.shortHash).toBeDefined()
  })
  test('stage period can be unbounded', async () => {
    const server = await testClient({
      connections,
      isAuth: true,
      context: { viewer: admin },
    })
    const stagesUnbounded = [
      {
        name: translations,
        period: {
          start: new Date('2024-01-03'),
        },
      },
    ]
    const { data, errors } = await server.executeOperation({
      query: PUT_WRITING_CHALLENGE,
      variables: {
        input: {
          name,
          description,
          cover,
          link,
          applicationPeriod,
          writingPeriod,
          stages: stagesUnbounded,
        },
      },
    })
    expect(errors).toBeUndefined()
    expect(data.putWritingChallenge.stages[0].period.end).toBeNull()
  })

  test('update success', async () => {
    const server = await testClient({
      connections,
      isAuth: true,
      context: { viewer: admin },
    })
    const { data } = await server.executeOperation({
      query: PUT_WRITING_CHALLENGE,
      variables: {
        input: {
          name,
          description,
          cover,
          link,
          applicationPeriod,
          writingPeriod,
          stages,
        },
      },
    })

    const newName = Object.keys(LANGUAGE).map((lang) => ({
      text: 'updated' + lang,
      language: lang,
    }))

    const { data: updatedData, errors } = await server.executeOperation({
      query: PUT_WRITING_CHALLENGE,
      variables: {
        input: {
          id: data.putWritingChallenge.id,
          name: newName,
        },
      },
    })
    expect(errors).toBeUndefined()
    expect(updatedData.putWritingChallenge.name).toContain('updated')
  })
  test('user without admin role can not create', async () => {
    const server = await testClient({
      connections,
      isAuth: true,
      context: { viewer: normalUser },
    })
    const { errors } = await server.executeOperation({
      query: PUT_WRITING_CHALLENGE,
      variables: {
        input: {
          name,
          description,
          cover,
          link,
          applicationPeriod,
          writingPeriod,
          stages,
        },
      },
    })
    expect(errors[0].extensions.code).toBe('FORBIDDEN')
  })
})
