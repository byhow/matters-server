import type { GQLArticleResolvers, Draft } from 'definitions'

import publishedResolver from './newestPublishedDraft'
import unpublishedResolver from './newestUnpublishedDraft'

const resolver: GQLArticleResolvers['drafts'] = async (
  parent,
  args,
  context,
  info
) => {
  const drafts = await Promise.all([
    unpublishedResolver(parent, args, context, info), // keep pending unpublished before published
    publishedResolver(parent, args, context, info),
  ])

  return drafts.filter((draft) => draft) as Draft[]
}

export default resolver
