import type { BaseNoticeType, NoticeItem } from 'definitions'

import _ from 'lodash'

const actorsOptional: Partial<Record<BaseNoticeType, boolean>> = {
  article_published: true,
  official_announcement: true,
  revised_article_published: true,
  revised_article_not_published: true,
  circle_new_article: true,
  campaign_article_featured: true,
}

const entitiesOptional: Partial<Record<BaseNoticeType, boolean>> = {
  user_new_follower: true,
  official_announcement: true,
}

const messageRequired: Partial<Record<BaseNoticeType, boolean>> = {
  official_announcement: true,
}

type NoticeEdges = Array<{ node: NoticeItem; cursor: string }>

export const filterMissingFieldNoticeEdges = (
  edges: NoticeEdges
): NoticeEdges =>
  edges.filter(({ node: notice }) => {
    const noticeType = notice.type

    // check actors
    if (!actorsOptional[noticeType] && _.isEmpty(notice.actors)) {
      return false
    }

    // check entities
    if (!entitiesOptional[noticeType] && _.isEmpty(notice.entities)) {
      return false
    }

    // check message
    if (messageRequired[noticeType] && _.isEmpty(notice.message)) {
      return false
    }

    return true
  })
