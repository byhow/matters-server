import { APPRECIATION_TYPES, USER_STATE } from 'common/enums'
import { environment } from 'common/environment'
import {
  ActionLimitExceededError,
  ArticleNotFoundError,
  AuthenticationError,
  ForbiddenByStateError,
  ForbiddenByTargetStateError,
  ForbiddenError,
} from 'common/errors'
import { fromGlobalId, isFeatureEnabled } from 'common/utils'
import { gcp } from 'connectors'
import { appreciationQueue } from 'connectors/queue'
import { MutationToAppreciateArticleResolver } from 'definitions'

const resolver: MutationToAppreciateArticleResolver = async (
  root,
  { input: { id, amount, token, superLike } },
  {
    viewer,
    dataSources: {
      userService,
      articleService,
      draftService,
      notificationService,
      systemService,
    },
  }
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

  if (!viewer.likerId) {
    throw new ForbiddenError('viewer has no liker id')
  }

  const { id: dbId } = fromGlobalId(id)
  const article = await articleService.dataloader.load(dbId)
  if (!article) {
    throw new ArticleNotFoundError('target article does not exists')
  }
  const node = await draftService.baseFindById(article.draftId)
  if (!node) {
    throw new ArticleNotFoundError(
      'target article linked draft does not exists'
    )
  }

  if (article.authorId === viewer.id && !superLike) {
    throw new ForbiddenError('cannot appreciate your own article')
  }

  const author = await userService.dataloader.load(article.authorId)
  if (!author) {
    throw new ForbiddenError('author has no liker id')
  }

  if (author.state === USER_STATE.frozen) {
    throw new ForbiddenByTargetStateError(
      `cannot appreciate ${author.state} user`
    )
  }

  /**
   * Super Like
   */
  if (superLike) {
    const liker = await userService.findLiker({ userId: viewer.id })
    if (!liker || !author) {
      throw new ForbiddenError('viewer or author has no liker id')
    }

    const canSuperLike = await userService.likecoin.canSuperLike({
      liker,
      url: `${environment.siteDomain}/@${author.userName}/${node.slug}-${node.mediaHash}`,
      likerIp: viewer.ip,
      userAgent: viewer.userAgent,
    })

    if (!canSuperLike) {
      throw new ForbiddenError('cannot super like')
    }

    await userService.likecoin.superlike({
      liker,
      likerIp: viewer.ip,
      userAgent: viewer.userAgent,
      authorLikerId: author.likerId,
      url: `${environment.siteDomain}/@${author.userName}/${node.slug}-${node.mediaHash}`,
    })

    // insert record
    await articleService.superlike({
      articleId: article.id,
      senderId: viewer.id,
      recipientId: article.authorId,
      amount: 1,
      type: APPRECIATION_TYPES.like,
    })

    return node
  }

  /**
   * Like
   */
  const appreciateLeft = await articleService.appreciateLeftByUser({
    articleId: dbId,
    userId: viewer.id,
  })
  if (appreciateLeft <= 0) {
    throw new ActionLimitExceededError('too many appreciations')
  }

  // Check if amount exceeded limit. if yes, then use the left amount.
  const validAmount = Math.min(amount, appreciateLeft)

  // protect from scripting
  const feature = await systemService.getFeatureFlag('verify_appreciate')

  if (feature && isFeatureEnabled(feature.flag, viewer)) {
    const isHuman = await gcp.recaptcha({ token, ip: viewer.ip })
    if (!isHuman) {
      throw new ForbiddenError('appreciate via script is not allowed')
    }
  }

  // insert appreciation job
  appreciationQueue.appreciate({
    amount: validAmount,
    articleId: article.id,
    senderId: viewer.id,
    senderIP: viewer.ip,
    userAgent: viewer.userAgent,
  })

  return node
}

export default resolver
