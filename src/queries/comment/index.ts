import { ARTICLE_PIN_COMMENT_LIMIT } from 'common/enums'
import { toGlobalId } from 'common/utils'

import article from './article'
import articleCommentCount from './article/commentCount'
import articleComments from './article/comments'
import articleFeaturedComments from './article/featuredComments'
import pinCommentLeft from './article/pinCommentLeft'
import articlePinnedComments from './article/pinnedComments'
import author from './author'
import comments from './comments'
import content from './content'
import downvotes from './downvotes'
import myVote from './myVote'
import parentComment from './parentComment'
import replyTo from './replyTo'
import upvotes from './upvotes'
import userCommentedArticles from './user/commentedArticles'

export default {
  User: {
    commentedArticles: userCommentedArticles
  },
  Article: {
    commentCount: articleCommentCount,
    pinCommentLimit: () => ARTICLE_PIN_COMMENT_LIMIT,
    pinCommentLeft,
    pinnedComments: articlePinnedComments,
    featuredComments: articleFeaturedComments,
    comments: articleComments
  },
  Comment: {
    id: ({ id }: { id: string }) => toGlobalId({ type: 'Comment', id }),
    replyTo,
    article,
    content,
    author,
    upvotes,
    downvotes,
    myVote,
    comments,
    parentComment
  }
}
