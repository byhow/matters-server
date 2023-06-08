import { RedisCache } from 'apollo-server-cache-redis'
import { Request, Response } from 'express'
import { Knex } from 'knex'

import {
  PAYMENT_CURRENCY,
  PAYMENT_PROVIDER,
  TRANSACTION_STATE,
  TRANSACTION_PURPOSE,
  VERIFICATION_CODE_STATUS,
} from 'common/enums'
import {
  Alchemy,
  ArticleService,
  AtomService,
  CommentService,
  DraftService,
  NotificationService,
  OAuthService,
  OpenSeaService,
  PaymentService,
  SystemService,
  TagService,
  UserService,
} from 'connectors'

export * from './article'
export * from './language'
export * from './schema'
export * from './notification'
export * from './generic'

export interface User {
  id: string
  uuid: string
  userName: string
  displayName: string
  description: string
  avatar: string
  email: string
  emailVerified: string
  likerId?: string
  passwordHash: string
  paymentPasswordHash?: string
  baseGravity: number
  currGravity: number
  language: LANGUAGES
  // oauthType: any
  role: UserRole
  state: UserState
  createdAt: string
  updatedAt: string
  agreeOn: string
  ethAddress: string
}

export type UserRole = 'admin' | 'user'

export type UserState = 'active' | 'banned' | 'archived'

export type Context = RequestContext & {
  dataSources: DataSources
  cacheKey: string
  redis: RedisCache
}

export type Viewer = (User | { id: null }) & {
  hasRole: (role: UserRole) => boolean
  hasAuthMode: (mode: string) => boolean
  ip?: string
  userAgent: string
  role: string
  language: LANGUAGES
  scope: { [key: string]: any }
  authMode: AuthMode
  oauthClient?: OAuthClient
  agentHash?: string
  token?: string
  group: 'a' | 'b'
}

export interface RequestContext {
  viewer: Viewer
  req: Request
  res: Response
  knex: Knex
}

export interface DataSources {
  atomService: InstanceType<typeof AtomService>
  articleService: InstanceType<typeof ArticleService>
  commentService: InstanceType<typeof CommentService>
  draftService: InstanceType<typeof DraftService>
  userService: InstanceType<typeof UserService>
  systemService: InstanceType<typeof SystemService>
  tagService: InstanceType<typeof TagService>
  notificationService: InstanceType<typeof NotificationService>
  oauthService: InstanceType<typeof OAuthService>
  paymentService: InstanceType<typeof PaymentService>
  alchemyService: InstanceType<typeof Alchemy>
  openseaService: InstanceType<typeof OpenSeaService>
}

export type BasicTableName =
  | 'action'
  | 'article_boost'
  | 'action_user'
  | 'action_comment'
  | 'action_article'
  | 'action_tag'
  | 'transaction'
  | 'appreciation'
  | 'asset'
  | 'asset_map'
  | 'article'
  | 'article_read_count'
  | 'article_tag'
  | 'audio_draft'
  | 'comment'
  | 'collection'
  | 'draft'
  | 'noop'
  | 'user'
  | 'user_oauth'
  | 'user_badge'
  | 'user_notify_setting'
  | 'user_restriction'
  | 'username_edit_history'
  | 'notice_detail'
  | 'notice'
  | 'notice_actor'
  | 'notice_entity'
  | 'push_device'
  | 'report'
  | 'report_asset'
  | 'feedback'
  | 'feedback_asset'
  | 'invitation'
  | 'verification_code'
  | 'search_history'
  | 'tag'
  | 'tag_boost'
  | 'user_boost'
  | 'matters_today'
  | 'matters_choice'
  | 'matters_choice_tag'
  | 'article_recommend_setting'
  | 'log_record'
  | 'oauth_client'
  | 'oauth_access_token'
  | 'oauth_authorization_code'
  | 'oauth_refresh_token'
  | 'user_oauth_likecoin'
  | 'blocklist'
  | 'blocked_search_keyword'
  | 'transaction'
  | 'customer'
  | 'payout_account'
  | 'punish_record'
  | 'entity_type'
  | 'circle'
  | 'circle_invitation'
  | 'circle_price'
  | 'circle_subscription'
  | 'circle_subscription_item'
  | 'action_circle'
  | 'article_circle'
  | 'feature_flag'
  | 'seeding_user'
  | 'announcement'
  | 'announcement_translation'
  | 'topic'
  | 'article_topic'
  | 'chapter'
  | 'article_chapter'
  | 'crypto_wallet'
  | 'crypto_wallet_signature'
  | 'article_translation'
  | 'tag_translation'
  | 'user_ipns_keys'
  | 'user_tags_order'
  | 'blockchain_transaction'
  | 'blockchain_curation_event'
  | 'blockchain_sync_record'

export type View =
  | 'tag_count_view'
  | 'user_reader_view'
  | 'article_count_view'
  | 'article_hottest_view'
  | 'transaction_delta_view'
  | 'article_value_view'
  | 'mat_views.tags_lasts'

export type MaterializedView =
  | 'article_count_materialized'
  | 'tag_count_materialized'
  | 'user_reader_materialized'
  | 'article_value_materialized'
  | 'featured_comment_materialized'
  | 'curation_tag_materialized'
  | 'article_hottest_materialized'
  | 'most_active_author_materialized'
  | 'most_appreciated_author_materialized'
  | 'most_trendy_author_materialized'
  | 'user_activity_materialized'
  | 'recently_read_tags_materialized'
  | 'article_read_time_materialized'
  | 'recommended_articles_from_read_tags_materialized'

export type TableName = BasicTableName | View | MaterializedView

export interface ThirdPartyAccount {
  accountName: 'facebook' | 'wechat' | 'google'
  baseUrl: string
  token: string
}

export interface BatchParams {
  input: {
    [key: string]: any
  }
}

export type S3Bucket =
  | 'matters-server-dev'
  | 'matters-server-stage'
  | 'matters-server-production'

export interface Item {
  [key: string]: any
  id: string
}

export interface ItemData {
  [key: string]: any
}

export type ResponseType = 'Article' | 'Comment'

export type TransactionTargetType = 'Article' | 'Transaction'

export type UserOAuthLikeCoinAccountType = 'temporal' | 'general'

export interface UserOAuthLikeCoin {
  likerId: string
  accountType: UserOAuthLikeCoinAccountType
  accessToken: string
  refreshToken: string
  expires: Date
  scope: string | string[]
}

export interface OAuthClient {
  [key: string]: any
  id: string
  redirectUris?: string | string[]
  grants: string | string[]
  accessTokenLifetime?: number
  refreshTokenLifetime?: number
}

export interface OAuthAuthorizationCode {
  [key: string]: any
  authorizationCode: string
  expiresAt: Date
  redirectUri: string
  scope?: string | string[]
  client: OAuthClient
  user: User
}

export interface OAuthToken {
  [key: string]: any
  accessToken: string
  accessTokenExpiresAt?: Date
  refreshToken?: string
  refreshTokenExpiresAt?: Date
  scope?: string | string[]
  client: OAuthClient
  user: User
}

export interface OAuthRefreshToken {
  [key: string]: any
  refreshToken: string
  refreshTokenExpiresAt?: Date
  scope?: string | string[]
  client: OAuthClient
  user: User
}

export interface VerficationCode {
  id: string
  uuid: string
  expiredAt: Date
  code: string
  type: GQLVerificationCodeType
  status: VERIFICATION_CODE_STATUS
  email: string
}

export type Falsey = '' | 0 | false | null | undefined

export type AuthMode = 'visitor' | 'oauth' | 'user' | 'admin'

export type SkippedListItemType = 'agent_hash' | 'email' | 'domain'

/**
 * Payment
 */
export interface Customer {
  id: string
  userId: string
  provider: string
  customerId: string
  cardLast4: string
}

export interface CircleSubscription {
  id: string
  state: string
  userId: string
  provider: string
  providerSubscriptionId: string
}

export interface CirclePrice {
  id: string
  amount: number
  currency: PAYMENT_CURRENCY
  circleId: string
  provider: PAYMENT_PROVIDER
  providerPriceId: string
}

export interface Transaction {
  id: string
  amount: string
  currency: PAYMENT_CURRENCY
  state: TRANSACTION_STATE
  purpose: TRANSACTION_PURPOSE
  provider: PAYMENT_PROVIDER
  providerTxId: string
  senderId: string
  recipientId: string
  targetId: string
  targetType: string
  fee: string
  remark: string
  parentId: string
  createdAt: string
  updatedAt: string
}
