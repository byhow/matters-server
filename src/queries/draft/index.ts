import { makeSummary } from '@matters/ipns-site-generator'
import slugify from '@matters/slugify'

import { NODE_TYPES } from 'common/enums'
import { countWords, toGlobalId } from 'common/utils'

import * as draftAccess from './access'
import articleDrafts from './article/drafts'
import articleNewestPublishedDraft from './article/newestPublishedDraft'
import articleNewestUnpublishedDraft from './article/newestUnpublishedDraft'
import assets from './assets'
import collection from './collection'
import draftContent from './content'
import draftCover from './cover'
import drafts from './drafts'

export default {
  Article: {
    drafts: articleDrafts,
    newestUnpublishedDraft: articleNewestUnpublishedDraft,
    newestPublishedDraft: articleNewestPublishedDraft,
  },
  User: {
    drafts,
  },
  Draft: {
    id: ({ id }: { id: string }) => toGlobalId({ type: NODE_TYPES.Draft, id }),
    slug: ({ title }: { title: string }) => slugify(title),
    mediaHash: ({ mediaHash }: { mediaHash: string }) => mediaHash || '',
    wordCount: ({ content }: { content?: string }) =>
      content ? countWords(content) : 0,
    summary: ({ summary, content }: { summary?: string; content: string }) =>
      summary || makeSummary(content || ''),
    content: draftContent,
    cover: draftCover,
    collection,
    assets,
    article: (root: any) => (root.articleId ? root : null),
    access: (root: any) => root,
    license: ({ license }: { license: any }) => license,
  },
  DraftAccess: {
    type: ({ access }: { access: string }) => access,
    circle: draftAccess.circle,
  },
}
