import { GQLRecommendationTypeResolver } from 'definitions/schema'

import { authors } from './authors'
import { followeeArticles } from './followeeArticles'
import { followeeComments } from './followeeComments'
import { followeeDonatedArticles } from './followeeDonatedArticles'
import { followingTags } from './followingTags'
import { followingTagsArticles } from './followingTagsArticles'
import { hottest } from './hottest'
import { hottestTags } from './hottestTags'
import { icymi } from './icymi'
import { interest } from './interest'
import { newest } from './newest'
import { recommendArticles } from './recommendArticles'
import { selectedTags } from './selectedTags'
import { tags } from './tags'
import { topics } from './topics'
import { valued } from './valued'

const resolvers: GQLRecommendationTypeResolver = {
  authors,
  followeeArticles,
  followeeComments,
  followeeDonatedArticles,
  followingTags,
  followingTagsArticles,
  hottest,
  icymi,
  newest,
  recommendArticles,
  tags,
  topics,
  valued,
  interest,
  hottestTags,
  selectedTags,
}

export default resolvers
