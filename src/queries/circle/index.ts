import { NODE_TYPES } from 'common/enums'
import { toGlobalId } from 'common/utils'
import {
  GQLCircleAnalyticsTypeResolver,
  GQLCircleContentAnalyticsTypeResolver,
  GQLCircleSettingTypeResolver,
  GQLCircleTypeResolver,
  GQLInvitationTypeResolver,
  GQLInviteeTypeResolver,
  GQLInvitesTypeResolver,
  GQLMemberTypeResolver,
  GQLPersonTypeResolver,
  GQLPossibleInviteeTypeNames,
  GQLPriceTypeResolver,
  GQLQueryTypeResolver,
} from 'definitions'

import contentPaywall from './analytics/contentPaywall'
import contentPublic from './analytics/contentPublic'
import avatar from './avatar'
import cover from './cover'
import followers from './followers'
import invitationCircle from './invitation/circle'
import invitee from './invitation/invitee'
import inviter from './invitation/inviter'
import invitedBy from './invitedBy'
import Invites from './invites'
import isFollower from './isFollower'
import isMember from './isMember'
import memberPrice from './member/price'
import memberUser from './member/user'
import members from './members'
import owner from './owner'
import priceCircle from './price/circle'
import prices from './prices'
import rootCircle from './rootCircle'
import enableBroadcast from './setting/enableBroadcast'
import enableDiscussion from './setting/enableDiscussion'
import works from './works'

const circle: {
  Query: GQLQueryTypeResolver

  Circle: GQLCircleTypeResolver
  CircleSetting: GQLCircleSettingTypeResolver
  Member: GQLMemberTypeResolver
  Price: GQLPriceTypeResolver
  Invites: GQLInvitesTypeResolver
  Invitation: GQLInvitationTypeResolver
  Invitee: {
    __resolveType: GQLInviteeTypeResolver
  }
  Person: GQLPersonTypeResolver
  CircleAnalytics: GQLCircleAnalyticsTypeResolver
  CircleContentAnalytics: GQLCircleContentAnalyticsTypeResolver
} = {
  Query: {
    circle: rootCircle,
  },

  Circle: {
    id: ({ id }) => (id ? toGlobalId({ type: NODE_TYPES.Circle, id }) : ''),
    avatar,
    cover,
    prices,
    owner,
    members,
    followers,
    works,
    isFollower,
    isMember,
    setting: (root: any) => root,
    invitedBy,
    invites: (root) => root,
    analytics: (root) => root,
  },

  CircleSetting: {
    enableBroadcast,
    enableDiscussion,
  },

  Member: {
    user: memberUser,
    price: memberPrice,
  },

  Price: {
    id: ({ id }) => (id ? toGlobalId({ type: NODE_TYPES.Price, id }) : ''),
    circle: priceCircle,
  },

  Invites,

  Invitation: {
    id: ({ id }) => (id ? toGlobalId({ type: NODE_TYPES.Invitation, id }) : ''),
    invitee,
    inviter,
    circle: invitationCircle,
    freePeriod: ({ durationInDays }) => durationInDays,
    state: ({ state }) => state,
  },

  Invitee: {
    __resolveType: ({ __type }: { __type: GQLPossibleInviteeTypeNames }) =>
      __type,
  },

  Person: {
    email: ({ email }) => email,
  },

  CircleAnalytics: {
    content: (root) => root,
  },

  CircleContentAnalytics: {
    public: contentPublic,
    paywall: contentPaywall,
  },
}

export default circle
