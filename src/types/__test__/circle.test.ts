import _get from 'lodash/get'

import { testClient } from './utils'

const GET_VIEWER_OWN_CIRCLES = `
  query {
    viewer {
      ownCircles {
        id
        members(input: { first: null }) {
          totalCount
        }
      }
      articles(input: { first: 1 }) {
        edges {
          node {
            id
          }
        }
      }
    }
  }
`

const QUERY_CIRCLE = `
  query($input: NodeInput!) {
    node(input: $input) {
      ... on Circle {
        id
        members(input: { first: null }) {
          totalCount
        }
      }
    }
  }
`

const PUT_CIRCLE = `
  mutation($input: PutCircleInput!) {
    putCircle(input: $input) {
      id
      name
      displayName
      prices {
        id
        amount
        currency
      }
      owner {
        id
      }
    }
  }
`

const TOGGLE_FOLLOW_CIRCLE = `
  mutation($input: ToggleItemInput!) {
    toggleFollowCircle(input: $input) {
      id
      followers(input: { first: null }) {
        totalCount
        edges {
          node {
            ...on User {
              id
            }
          }
        }
      }
    }
  }
`

const SUBSCRIBE_CIRCLE = `
  mutation($input: SubscribeCircleInput!) {
    subscribeCircle(input: $input) {
      client_secret
    }
  }
`

const UNSUBSCRIBE_CIRCLE = `
  mutation($input: UnsubscribeCircleInput!) {
    unsubscribeCircle(input: $input) {
      id
      members(input: { first: null }) {
        totalCount
      }
    }
  }
`

const PUT_CIRCLE_ARTICLES = `
  mutation($input: PutCircleArticlesInput!) {
    putCircleArticles(input: $input) {
      id
      works(input: { first: 0 }) {
        totalCount
        edges {
          node {
            id
            limitedFree
          }
        }
      }
    }
  }
`

describe('circle CRUD', () => {
  // shared setting
  const errorPath = 'errors.0.extensions.code'

  const userClient = { isAuth: true, isAdmin: false }
  const adminClient = { isAuth: true, isAdmin: true }

  test('create circle', async () => {
    const path = 'data.putCircle'
    const { mutate } = await testClient(userClient)
    const input: Record<string, any> = {
      name: 'very_long_circle_name',
      displayName: 'very long circle name',
      amount: 10,
    }

    // test long circle name
    const data1 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(data1, errorPath)).toBe('NAME_INVALID')

    // test circle name with symbol
    input.name = 'circle-name'
    const data2 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(data2, errorPath)).toBe('NAME_INVALID')

    // test long circle display name
    input.name = 'circle1'
    const data3 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(data3, errorPath)).toBe('DISPLAYNAME_INVALID')

    // test invalid display name
    input.displayName = '，'
    const data4 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(data4, errorPath)).toBe('DISPLAYNAME_INVALID')

    input.displayName = 'Circle 1'
    const data5 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })

    expect(_get(data5, `${path}.name`)).toBe('circle1')
    expect(_get(data5, `${path}.displayName`)).toBe('Circle 1')
    expect(_get(data5, `${path}.prices[0].amount`)).toBe(10)
    expect(_get(data5, `${path}.prices[0].currency`)).toBe('HKD')

    // test create multiple circles
    const data6 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(data6, errorPath)).toBe('FORBIDDEN')

    // test create a duplicate circle
    const { mutate: adminMutate } = await testClient(adminClient)
    const data7 = await adminMutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(data7, errorPath)).toBe('NAME_EXISTS')
  })

  test('update circle', async () => {
    const path = 'data.putCircle'
    const { query, mutate } = await testClient(userClient)
    const { data } = await query({
      query: GET_VIEWER_OWN_CIRCLES,
    })
    const circle = _get(data, 'viewer.ownCircles[0]')
    const input: Record<string, any> = {
      id: circle.id,
      name: 'very_long_circle_name',
    }

    // test cricle name
    const updatedData1 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(updatedData1, errorPath)).toBe('NAME_INVALID')

    input.name = 'circle1'
    const updatedData2 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(updatedData2, errorPath)).toBe('DUPLICATE_CIRCLE')

    input.name = 'circle2'
    const updatedData3 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(updatedData3, `${path}.name`)).toBe('circle2')

    // test circle display name
    delete input.name
    input.displayName = 'very long circle name'
    const updatedData4 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(updatedData4, errorPath)).toBe('DISPLAYNAME_INVALID')

    input.displayName = '，'
    const updatedData5 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(updatedData5, errorPath)).toBe('DISPLAYNAME_INVALID')

    input.displayName = 'Circle 2'
    const updatedData6 = await mutate({
      mutation: PUT_CIRCLE,
      variables: { input },
    })
    expect(_get(updatedData6, `${path}.displayName`)).toBe('Circle 2')
  })

  test('toggle follow circle', async () => {
    const path = 'data.toggleFollowCircle'
    const { query, mutate } = await testClient(userClient)
    const { data } = await query({
      query: GET_VIEWER_OWN_CIRCLES,
    })
    const circle = _get(data, 'viewer.ownCircles[0]')

    // test follow circle
    const { mutate: adminMutate } = await testClient(adminClient)
    const updatedData1 = await adminMutate({
      mutation: TOGGLE_FOLLOW_CIRCLE,
      variables: { input: { id: circle.id, enabled: true } },
    })
    expect(_get(updatedData1, `${path}.followers.edges`).length).toBe(1)

    // test unfollow circle
    const updatedData2 = await adminMutate({
      mutation: TOGGLE_FOLLOW_CIRCLE,
      variables: { input: { id: circle.id, enabled: false } },
    })
    expect(_get(updatedData2, `${path}.followers.edges`).length).toBe(0)
  })

  test('toggle circle articles', async () => {
    const path = 'data.putCircleArticles'
    const { query, mutate } = await testClient(userClient)
    const { data } = await query({
      query: GET_VIEWER_OWN_CIRCLES,
    })
    const circle = _get(data, 'viewer.ownCircles[0]')
    const article = _get(data, 'viewer.articles.edges[0].node')

    // add
    const input: Record<string, any> = {
      id: circle.id,
      articles: [article.id],
      type: 'add',
    }

    const addedData = await mutate({
      mutation: PUT_CIRCLE_ARTICLES,
      variables: { input },
    })
    expect(_get(addedData, `${path}.works.edges[0].node.id`)).toBe(article.id)
    expect(_get(addedData, `${path}.works.totalCount`)).toBe(1)
    expect(_get(addedData, `${path}.works.edges[0].node.limitedFree`)).toBe(
      true
    )

    // remove
    input.type = 'remove'
    const removedData = await mutate({
      mutation: PUT_CIRCLE_ARTICLES,
      variables: { input },
    })
    expect(_get(removedData, errorPath)).toBe('FORBIDDEN')
  })
})
