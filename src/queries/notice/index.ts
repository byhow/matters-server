import {
  DBNoticeType,
  GQLArticleArticleNoticeType,
  GQLArticleArticleNoticeTypeResolver,
  GQLArticleNoticeType,
  GQLArticleNoticeTypeResolver,
  GQLArticleTagNoticeType,
  GQLArticleTagNoticeTypeResolver,
  GQLCommentCommentNoticeType,
  GQLCommentCommentNoticeTypeResolver,
  GQLCommentNoticeType,
  GQLCommentNoticeTypeResolver,
  GQLOfficialAnnouncementNoticeTypeResolver,
  GQLTagNoticeType,
  GQLTagNoticeTypeResolver,
  GQLTransactionNoticeType,
  GQLTransactionNoticeTypeResolver,
  GQLUserNoticeType,
  GQLUserNoticeTypeResolver,
  GQLUserTypeResolver,
} from 'definitions'

import notices from './notices'

enum NOTICE_TYPE {
  UserNotice = 'UserNotice',
  ArticleNotice = 'ArticleNotice',
  ArticleArticleNotice = 'ArticleArticleNotice',
  CommentNotice = 'CommentNotice',
  CommentCommentNotice = 'CommentCommentNotice',
  ArticleTagNotice = 'ArticleTagNotice',
  TagNotice = 'TagNotice',
  TransactionNotice = 'TransactionNotice',
  OfficialAnnouncementNotice = 'OfficialAnnouncementNotice',
}

const notice: {
  User: GQLUserTypeResolver
  Notice: any
  UserNotice: GQLUserNoticeTypeResolver
  ArticleNotice: GQLArticleNoticeTypeResolver
  ArticleArticleNotice: GQLArticleArticleNoticeTypeResolver
  ArticleTagNotice: GQLArticleTagNoticeTypeResolver
  TagNotice: GQLTagNoticeTypeResolver
  CommentNotice: GQLCommentNoticeTypeResolver
  CommentCommentNotice: GQLCommentCommentNoticeTypeResolver
  TransactionNotice: GQLTransactionNoticeTypeResolver
  OfficialAnnouncementNotice: GQLOfficialAnnouncementNoticeTypeResolver
} = {
  User: {
    notices,
  },
  Notice: {
    __resolveType: ({ type }: { type: DBNoticeType }) => {
      const noticeTypeMap = {
        // user
        user_new_follower: NOTICE_TYPE.UserNotice,

        // article
        article_published: NOTICE_TYPE.ArticleNotice,
        article_new_appreciation: NOTICE_TYPE.ArticleNotice,
        article_new_subscriber: NOTICE_TYPE.ArticleNotice,
        article_mentioned_you: NOTICE_TYPE.ArticleNotice,
        revised_article_published: NOTICE_TYPE.ArticleNotice,
        revised_article_not_published: NOTICE_TYPE.ArticleNotice,

        // article-artilce
        article_new_collected: NOTICE_TYPE.ArticleArticleNotice,

        // article-tag
        article_tag_has_been_added: NOTICE_TYPE.ArticleTagNotice,
        article_tag_has_been_removed: NOTICE_TYPE.ArticleTagNotice,
        article_tag_has_been_unselected: NOTICE_TYPE.ArticleTagNotice,

        // tag
        tag_adoption: NOTICE_TYPE.TagNotice,
        tag_leave: NOTICE_TYPE.TagNotice,
        tag_add_editor: NOTICE_TYPE.TagNotice,
        tag_leave_editor: NOTICE_TYPE.TagNotice,

        // comment
        comment_pinned: NOTICE_TYPE.CommentNotice,
        comment_mentioned_you: NOTICE_TYPE.CommentNotice,
        article_new_comment: NOTICE_TYPE.CommentNotice,
        subscribed_article_new_comment: NOTICE_TYPE.CommentNotice,

        // comment-comment
        comment_new_reply: NOTICE_TYPE.CommentCommentNotice,

        // transaction
        payment_received_donation: NOTICE_TYPE.TransactionNotice,
        payment_payout: NOTICE_TYPE.TransactionNotice,

        // official
        official_announcement: NOTICE_TYPE.OfficialAnnouncementNotice,
      }

      return noticeTypeMap[type]
    },
  },
  UserNotice: {
    id: ({ uuid }) => uuid,
    type: ({ type }) => {
      switch (type) {
        case 'user_new_follower':
          return GQLUserNoticeType.UserNewFollower
      }
    },
    target: ({ entities, type }, _, { viewer }) => {
      if (type === 'user_new_follower') {
        return viewer
      }
      return null
    },
  },
  ArticleNotice: {
    id: ({ uuid }) => uuid,
    type: ({ type }) => {
      switch (type) {
        case 'article_published':
          return GQLArticleNoticeType.ArticlePublished
        case 'article_new_appreciation':
          return GQLArticleNoticeType.ArticleNewAppreciation
        case 'article_new_subscriber':
          return GQLArticleNoticeType.ArticleNewSubscriber
        case 'article_mentioned_you':
          return GQLArticleNoticeType.ArticleMentionedYou
        case 'revised_article_published':
          return GQLArticleNoticeType.RevisedArticlePublished
        case 'revised_article_not_published':
          return GQLArticleNoticeType.RevisedArticleNotPublished
      }
    },
    target: ({ entities }, _, { dataSources: { draftService } }) =>
      draftService.dataloader.load(entities.target.draftId),
  },
  ArticleArticleNotice: {
    id: ({ uuid }) => uuid,
    type: ({ type }) => {
      switch (type) {
        case 'article_new_collected':
          return GQLArticleArticleNoticeType.ArticleNewCollected
      }
    },
    target: ({ entities }, _, { dataSources: { draftService } }) =>
      draftService.dataloader.load(entities.target.draftId),
    article: ({ entities, type }, _, { dataSources: { draftService } }) => {
      if (type === 'article_new_collected') {
        return draftService.dataloader.load(entities.collection.draftId)
      }
      return null
    },
  },
  ArticleTagNotice: {
    id: ({ uuid }) => uuid,
    type: ({ type }) => {
      switch (type) {
        case 'article_tag_has_been_added':
          return GQLArticleTagNoticeType.ArticleTagAdded
        case 'article_tag_has_been_removed':
          return GQLArticleTagNoticeType.ArticleTagRemoved
        case 'article_tag_has_been_unselected':
          return GQLArticleTagNoticeType.ArticleTagUnselected
      }
    },
    target: ({ entities }, _, { dataSources: { draftService } }) =>
      draftService.dataloader.load(entities.target.draftId),
    tag: ({ entities }) => entities.tag,
  },
  TagNotice: {
    id: ({ uuid }) => uuid,
    type: ({ type }) => {
      switch (type) {
        case 'tag_adoption':
          return GQLTagNoticeType.TagAdoption
        case 'tag_leave':
          return GQLTagNoticeType.TagLeave
        case 'tag_add_editor':
          return GQLTagNoticeType.TagAddEditor
        case 'tag_leave_editor':
          return GQLTagNoticeType.TagAddEditor
      }
    },
    target: ({ entities }) => entities.tag,
  },
  CommentNotice: {
    id: ({ uuid }) => uuid,
    type: ({ type }) => {
      switch (type) {
        case 'comment_pinned':
          return GQLCommentNoticeType.ArticleCommentPinned
        case 'comment_mentioned_you':
          return GQLCommentNoticeType.ArticleCommentMentionedYou
        case 'article_new_comment':
          return GQLCommentNoticeType.ArticleNewComment
        case 'subscribed_article_new_comment':
          return GQLCommentNoticeType.SubscribedArticleNewComment
      }
    },
    target: ({ entities }) => entities.target,
  },
  CommentCommentNotice: {
    id: ({ uuid }) => uuid,
    type: ({ type }) => {
      switch (type) {
        case 'comment_new_reply':
          return GQLCommentCommentNoticeType.CommentNewReply
      }
    },
    target: ({ entities }) => entities.target,
    comment: ({ entities, type }) => {
      if (type === 'comment_new_reply') {
        return entities.reply
      }
      return null
    },
  },
  TransactionNotice: {
    id: ({ uuid }) => uuid,
    type: ({ type }) => {
      switch (type) {
        case 'payment_received_donation':
          return GQLTransactionNoticeType.PaymentReceivedDonation
        case 'payment_payout':
          return GQLTransactionNoticeType.PaymentPayout
      }
    },
    target: ({ entities }) => entities.target,
  },
  OfficialAnnouncementNotice: {
    id: ({ uuid }) => uuid,
    link: ({ data }: { data: any }) => data && data.link,
  },
}

export default notice
