import type { GQLRecommendationResolvers } from 'definitions'

import _chunk from 'lodash/chunk'
import _times from 'lodash/times'

import {
  connectionFromArray,
  connectionFromPromisedArray,
  fromConnectionArgs,
  indexToCursor,
} from 'common/utils'

import {
  makeBaseActivityQuery,
  makeCircleActivityQuery,
  makeReadArticlesTagsActivityQuery,
  makeUserDonateArticleActivityQuery,
  makeUserFollowUserActivityQuery,
  makeUserSubscribeCircleActivityQuery,
} from './sql'

export enum RecommendationSource {
  ReadArticlesTags = 'ReadArticlesTags',
  UserFollowing = 'UserFollowing',
  UserDonation = 'UserDonation',
  UserSubscription = 'UserSubscription',
}

const resolver: GQLRecommendationResolvers['following'] = async (
  { id: userId },
  { input },
  {
    dataSources: {
      userService,
      commentService,
      tagService,
      atomService,
      articleService,
      connections: { knexRO },
    },
  }
) => {
  if (!userId) {
    return connectionFromArray([], input)
  }

  const { take, skip } = fromConnectionArgs(input)

  // Retrieve activities
  const [count, activities] = await Promise.all([
    makeBaseActivityQuery({ userId }, knexRO).count().first(),
    makeBaseActivityQuery({ userId }, knexRO)
      .orderBy('created_at', 'desc')
      .offset(skip)
      .limit(take),
  ])
  const totalCount = parseInt(count ? (count.count as string) : '0', 10)

  /**
   * Utils
   */
  const nodeLoader = ({ id, type }: { id: string; type: string }) => {
    switch (type) {
      case 'Article':
        return atomService.articleIdLoader.load(id)
      case 'Comment':
        return atomService.commentIdLoader.load(id)
      case 'Circle':
        return atomService.findFirst({ table: 'circle', where: { id } })
      case 'User':
        return atomService.userIdLoader.load(id)
      case 'Tag':
        return atomService.tagIdLoader.load(id)
    }
  }
  const activityLoader = async ({
    type,
    actorId,
    nodeId,
    nodeType,
    targetId,
    targetType,
    createdAt,
  }: any) => ({
    __type: type,
    actor: await atomService.userIdLoader.load(actorId),
    node: await nodeLoader({ id: nodeId, type: nodeType }),
    target: await nodeLoader({ id: targetId, type: targetType }),
    createdAt,
  })
  const recommenders = [
    {
      source: RecommendationSource.ReadArticlesTags,
      query: () => makeReadArticlesTagsActivityQuery({ userId }, knexRO),
    },
    {
      source: RecommendationSource.UserFollowing,
      query: () => makeUserFollowUserActivityQuery({ userId }, knexRO),
    },
    {
      source: RecommendationSource.UserDonation,
      query: () => makeUserDonateArticleActivityQuery({ userId }, knexRO),
    },
    {
      source: RecommendationSource.UserSubscription,
      query: () => makeUserSubscribeCircleActivityQuery({ userId }, knexRO),
    },
  ]

  const connections = await connectionFromPromisedArray(
    Promise.all(activities.map((acty) => activityLoader(acty))),
    input,
    totalCount
  )

  // remake edges: every 5 activities
  // will append 1 circle activity and 1 recommendation activity
  const edges: any[] = []
  for (const [index, edge] of connections.edges.entries()) {
    edges.push(edge)

    const step = 5
    const position = skip + index + 1

    const shouldAppendRecommendations = position % step === 0
    if (position < step || !shouldAppendRecommendations) {
      continue
    }

    // append circle activity
    const circleTake = 1
    const circleSkip = (Math.ceil(position / step) - 1) * circleTake
    const circleActivities = await makeCircleActivityQuery({ userId }, knexRO)
      .orderBy('created_at', 'desc')
      .offset(circleSkip)
      .limit(circleTake)

    if (circleActivities.length >= 0) {
      edges.push(
        ...(await Promise.all(
          circleActivities.map((acty, i) => ({
            cursor: indexToCursor(`circle:${circleSkip}:${i}`),
            node: activityLoader(acty),
          }))
        ))
      )
    }

    // append recommendation rotarily based on current edge index
    const recommenderCount = recommenders.length
    const recommendationTake = 5
    const recommendationSkip =
      (Math.ceil(position / step / recommenderCount) - 1) * recommendationTake
    const recommendationCursor = indexToCursor(
      `recommendation:${recommendationSkip}`
    )
    const pick = (Math.floor(position / step) - 1) % recommenderCount
    const { source, query: recommendationQuery } = recommenders[pick]
    const recommendation = await recommendationQuery()
      .offset(recommendationSkip)
      .limit(recommendationTake)

    if (recommendation.length <= 0) {
      continue
    }

    switch (source) {
      case RecommendationSource.UserFollowing:
        edges.push({
          cursor: recommendationCursor,
          node: {
            __type: 'UserRecommendationActivity',
            source,
            nodes: await atomService.userIdLoader.loadMany(
              recommendation.map(({ nodeId }: { nodeId: string }) => nodeId)
            ),
          },
        })
        break
      case RecommendationSource.UserDonation:
        edges.push({
          cursor: recommendationCursor,
          node: {
            __type: 'ArticleRecommendationActivity',
            source,
            nodes: await atomService.articleIdLoader.loadMany(
              recommendation.map(({ nodeId }: { nodeId: string }) => nodeId)
            ),
          },
        })
        break
      case RecommendationSource.ReadArticlesTags:
        edges.push({
          cursor: recommendationCursor,
          node: {
            __type: 'ArticleRecommendationActivity',
            source,
            nodes: await atomService.articleIdLoader.loadMany(
              recommendation.map(({ articleId }) => articleId)
            ),
          },
        })
        break
      case RecommendationSource.UserSubscription:
        edges.push({
          cursor: recommendationCursor,
          node: {
            __type: 'CircleRecommendationActivity',
            source,
            nodes: await atomService.findMany({
              table: 'circle',
              whereIn: [
                'id',
                recommendation.map(({ nodeId }: { nodeId: string }) => nodeId),
              ],
            }),
          },
        })
        break
    }
  }

  return {
    ...connections,
    edges,
  }
}

export default resolver
