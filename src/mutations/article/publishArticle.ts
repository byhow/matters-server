import { PUBLISH_ARTICLE_DELAY, PUBLISH_STATE, USER_STATE } from 'common/enums'
import {
  AuthenticationError,
  DraftNotFoundError,
  ForbiddenByStateError,
} from 'common/errors'
import { fromGlobalId } from 'common/utils'
import { publicationQueue } from 'connectors/queue'
import { MutationToPublishArticleResolver } from 'definitions'

const resolver: MutationToPublishArticleResolver = async (
  _,
  { input: { id, delay } },
  { viewer, dataSources: { draftService } }
) => {
  if (!viewer.id) {
    throw new AuthenticationError('visitor has no permission')
  }

  if (
    [USER_STATE.archived, USER_STATE.banned, USER_STATE.frozen].includes(
      viewer.state
    )
  ) {
    throw new ForbiddenByStateError(`${viewer.state} user has no permission`)
  }

  // retrive data from draft
  const { id: draftDBId } = fromGlobalId(id)
  const draft = await draftService.dataloader.load(draftDBId)
  const isPublished = draft.publishState === PUBLISH_STATE.published

  if (draft.authorId !== viewer.id || (draft.archived && !isPublished)) {
    throw new DraftNotFoundError('draft does not exists')
  }

  if (
    draft.publishState === PUBLISH_STATE.pending ||
    (draft.archived && isPublished)
  ) {
    return draft
  }

  const scheduledAt = new Date(Date.now() + (delay || PUBLISH_ARTICLE_DELAY))
  const draftPending = await draftService.baseUpdate(draft.id, {
    publishState: PUBLISH_STATE.pending,
    scheduledAt,
    updatedAt: new Date(),
  })

  // add job to queue
  publicationQueue.publishArticle({ draftId: draftDBId, delay })

  return draftPending
}

export default resolver
