import { ARTICLE_STATE } from 'common/enums'
import { ArticleToContentResolver } from 'definitions'

const resolver: ArticleToContentResolver = (
  { content, state },
  _,
  { viewer }
) => {
  const isActive = state === ARTICLE_STATE.active
  const isAdmin = viewer.hasRole('admin')

  if (isActive || isAdmin) {
    return content
  }

  return ''
}

export default resolver