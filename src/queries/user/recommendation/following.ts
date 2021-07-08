import _last from 'lodash/last'

import { BATCH_SIZE, MATERIALIZED_VIEW } from 'common/enums'
import {
  connectionFromArray,
  connectionFromPromisedArray,
  cursorToIndex,
} from 'common/utils'
import { RecommendationToFollowingResolver } from 'definitions'

enum ActivityType {
  UserPublishArticleActivity = 'UserPublishArticleActivity',
  UserBroadcastCircleActivity = 'UserBroadcastCircleActivity',
  UserCreateCircleActivity = 'UserCreateCircleActivity',
  UserCollectArticleActivity = 'UserCollectArticleActivity',
  UserSubscribeCircleActivity = 'UserSubscribeCircleActivity',
  UserFollowUserActivity = 'UserFollowUserActivity',
  UserDonateArticleActivity = 'UserDonateArticleActivity',
  UserBookmarkArticleActivity = 'UserBookmarkArticleActivity',
  UserAddArticleTagActivity = 'UserAddArticleTagActivity',
}

const resolver: RecommendationToFollowingResolver = async (
  { id: userId },
  { input },
  {
    dataSources: { userService, commentService, atomService, articleService },
    knex,
  }
) => {
  if (!userId) {
    return connectionFromArray([], input)
  }

  const { first: take, after } = input
  const skip = cursorToIndex(after) + 1

  /**
   * Retrieve activities
   */
  const makeFollowingQuery = ({ viewName }: { viewName: string }) =>
    knex.select().from(
      // filter activies based on user's following user
      knex
        .as('selected_activities')
        .select('acty.*')
        .from('action_user as au')
        .join(`${viewName} as acty`, 'acty.actor_id', 'au.target_id')
        .whereIn('acty.type', [
          ActivityType.UserPublishArticleActivity,
          ActivityType.UserCreateCircleActivity,
          ActivityType.UserCollectArticleActivity,
          ActivityType.UserSubscribeCircleActivity,
          ActivityType.UserFollowUserActivity,
          ActivityType.UserDonateArticleActivity,
          ActivityType.UserBookmarkArticleActivity,
        ])
        .andWhere({
          'au.user_id': userId,
          'au.action': 'follow',
        })
        .union([
          // filter activities based on viewer's following tag
          knex
            .select('acty.*')
            .from('action_tag as at')
            .join(
              `${MATERIALIZED_VIEW.userActivityMaterialized} as acty`,
              'acty.target_id',
              'at.target_id'
            )
            .where({
              'at.user_id': userId,
              'at.action': 'follow',
              'acty.type': ActivityType.UserAddArticleTagActivity,
            }),
          // filter activities based on viewer's following circle
          knex
            .select('acty.*')
            .from('action_circle as ac')
            .join(
              `${MATERIALIZED_VIEW.userActivityMaterialized} as acty`,
              'acty.target_id',
              'ac.target_id'
            )
            .where({
              'ac.user_id': userId,
              'ac.action': 'follow',
              'acty.type': ActivityType.UserBroadcastCircleActivity,
            }),
        ])
    )

  const countQuery = makeFollowingQuery({
    viewName: MATERIALIZED_VIEW.userActivityMaterialized,
  })
    .count()
    .first()

  const followingQuery = makeFollowingQuery({
    viewName: MATERIALIZED_VIEW.userActivityMaterialized,
  })
    .orderBy('created_at', 'desc')
    .offset(skip)
    .limit(take || BATCH_SIZE)

  const [count, activities] = await Promise.all([countQuery, followingQuery])
  const totalCount = parseInt(count ? (count.count as string) : '0', 10)

  /**
   * Fetch actors, nodes and targets of activities
   */
  const nodeLoader = ({ id, type }: { id: string; type: string }) => {
    switch (type) {
      case 'Article':
        return articleService.draftLoader.load(id)
      case 'Comment':
        return commentService.dataloader.load(id)
      case 'Circle':
        return atomService.findFirst({ table: 'circle', where: { id } })
      case 'User':
        return userService.dataloader.load(id)
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
  }: any) => {
    return {
      __type: type,
      actor: await userService.dataloader.load(actorId),
      node: await nodeLoader({ id: nodeId, type: nodeType }),
      target: await nodeLoader({ id: targetId, type: targetType }),
      createdAt,
    }
  }

  return connectionFromPromisedArray(
    Promise.all(activities.map((acty) => activityLoader(acty))),
    input,
    totalCount
  )
}

export default resolver
