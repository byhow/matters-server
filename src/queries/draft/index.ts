import slugify from '@matters/slugify'

import { countWords, makeSummary, toGlobalId } from 'common/utils'

import article from './article'
import assets from './assets'
import collection from './collection'
import draftCover from './cover'
import drafts from './drafts'

export default {
  User: {
    drafts,
  },
  Draft: {
    id: ({ id }: { id: string }) => toGlobalId({ type: 'Draft', id }),
    slug: ({ title }: { title: string }) => slugify(title),
    wordCount: ({ content }: { content?: string }) =>
      content ? countWords(content) : 0,
    summary: ({ content, cover }: { content?: string; cover?: string }) =>
      content ? makeSummary(content, cover ? 110 : 140) : '',
    cover: draftCover,
    collection,
    assets,
    article,
  },
}
