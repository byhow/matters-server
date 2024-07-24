import type { GQLMutationResolvers } from 'definitions'

import {
  normalizeArticleHTML,
  sanitizeHTML,
} from '@matters/matters-editor/transformers'

import {
  MAX_CONTENT_LINK_TEXT_LENGTH,
  PUBLISH_STATE,
  USER_STATE,
  AUDIT_LOG_ACTION,
} from 'common/enums'
import {
  DraftNotFoundError,
  ForbiddenByStateError,
  ForbiddenError,
  UserInputError,
} from 'common/errors'
import { auditLog } from 'common/logger'
import { fromGlobalId } from 'common/utils'

const resolver: GQLMutationResolvers['publishArticle'] = async (
  _,
  { input: { id, iscnPublish } },
  {
    viewer,
    dataSources: {
      draftService,
      atomService,
      queues: { publicationQueue },
    },
  }
) => {
  if (
    [USER_STATE.archived, USER_STATE.banned, USER_STATE.frozen].includes(
      viewer.state
    )
  ) {
    throw new ForbiddenByStateError(`${viewer.state} user has no permission`)
  }

  if (!viewer.userName) {
    throw new ForbiddenError('user has no username')
  }

  // retrieve data from draft
  const { id: draftDBId } = fromGlobalId(id)
  const draft = await atomService.draftIdLoader.load(draftDBId)
  const isPublished = draft.publishState === PUBLISH_STATE.published

  if (draft.authorId !== viewer.id || (draft.archived && !isPublished)) {
    throw new DraftNotFoundError('draft does not exists')
  }

  if (!draft.title.trim()) {
    throw new UserInputError('title is required')
  }

  if (!draft.content) {
    throw new UserInputError('content is required')
  }

  if (
    draft.publishState === PUBLISH_STATE.pending ||
    (draft.archived && isPublished)
  ) {
    return draft
  }

  const draftPending = await draftService.baseUpdate(draft.id, {
    content: normalizeArticleHTML(
      sanitizeHTML(draft.content, { maxHardBreaks: -1, maxSoftBreaks: -1 }),
      {
        truncate: {
          maxLength: MAX_CONTENT_LINK_TEXT_LENGTH,
          keepProtocol: false,
        },
      }
    ),
    publishState: PUBLISH_STATE.pending,
    iscnPublish,
  })

  // add job to queue
  publicationQueue.publishArticle({ draftId: draftDBId, iscnPublish })
  auditLog({
    actorId: viewer.id,
    action: AUDIT_LOG_ACTION.addPublishArticleJob,
    entity: 'draft',
    entityId: draft.id,
    status: 'succeeded',
  })

  return draftPending
}

export default resolver
