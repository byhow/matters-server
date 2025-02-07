import type {
  GQLPublishArticleInput,
  GQLPutDraftInput,
  GQLSetFeatureInput,
  User,
  Connections,
  DataSources,
} from 'definitions'

import { ApolloServer, GraphQLRequest, GraphQLResponse } from '@apollo/server'

import { authModes, roleAccess } from 'common/utils'
import {
  ArticleService,
  AtomService,
  CommentService,
  DraftService,
  NotificationService,
  OAuthService,
  PaymentService,
  SystemService,
  TagService,
  UserService,
  UserWorkService,
  CollectionService,
  RecommendationService,
  MomentService,
  CampaignService,
  TranslationService,
} from 'connectors'
import {
  PublicationQueue,
  RevisionQueue,
  AssetQueue,
  MigrationQueue,
  PayToByBlockchainQueue,
  PayToByMattersQueue,
  PayoutQueue,
  UserQueue,
} from 'connectors/queue'

import { genConnections, closeConnections } from 'connectors/__test__/utils'
import schema from '../../schema'
import { VERIFICATION_CODE_STATUS } from 'common/enums'

export { genConnections, closeConnections }

interface BaseInput {
  isAdmin?: boolean
  isAuth?: boolean
  isMatty?: boolean
}

export const defaultTestUser = {
  email: 'test1@matters.news',
  password: '123',
  userName: 'test1',
}
export const adminUser = {
  email: 'admin1@matters.news',
  password: '123',
}

export const getUserContext = async (
  { email }: { email: string },
  connections: Connections
) => {
  const userService = new UserService(connections)
  const user = await userService.findByEmail(email)
  if (user === undefined) {
    return { viewer: {} as any as User }
  }
  return {
    viewer: user,
  }
}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const testClient = async ({
  connections,
  userId,
  context,
  isAuth,
  isAdmin,
  isMatty,
  isFrozen,
  isBanned,
  noUserName,
  dataSources,
}: {
  connections: Connections
  userId?: string
  context?: any
  isAuth?: boolean
  isAdmin?: boolean
  isMatty?: boolean
  isFrozen?: boolean
  isBanned?: boolean
  noUserName?: boolean
  dataSources?: Partial<Record<keyof DataSources, any>>
}) => {
  let _context: any = {}
  if (context) {
    _context = context
  } else if (userId) {
    const atomService = new AtomService(connections)
    _context = { viewer: await atomService.userIdLoader.load(userId) }
  } else if (isAuth) {
    _context = await getUserContext(
      {
        email: isMatty
          ? 'hi@matters.news'
          : isFrozen
          ? 'frozen@matters.news'
          : isBanned
          ? 'banned@matters.town'
          : isAdmin
          ? adminUser.email
          : noUserName
          ? 'nousername@matters.town'
          : defaultTestUser.email,
      },
      connections
    )
  }

  const viewer = (_context && _context.viewer) || {}

  if (!viewer.role) {
    viewer.role = isAdmin ? 'admin' : isAuth ? 'user' : 'visitor'
  }

  if (!viewer.authMode) {
    viewer.authMode = viewer.role
  }

  if (!viewer.scope) {
    viewer.scope = {}
  }

  if (!viewer.language) {
    viewer.language = 'en'
  }

  _context.viewer = {
    ...viewer,
    hasRole: (requires: string) =>
      roleAccess.findIndex((role) => role === viewer.role) >=
      roleAccess.findIndex((role) => role === requires),
    hasAuthMode: (requires: string) =>
      authModes.findIndex((mode) => mode === viewer.authMode) >=
      authModes.findIndex((mode) => mode === requires),
  }

  const server = new ApolloServer({
    schema,
    includeStacktraceInErrorResponses: true,
  })
  const publicationQueue = new PublicationQueue(connections)
  const revisionQueue = new RevisionQueue(connections)
  const assetQueue = new AssetQueue(connections)
  const migrationQueue = new MigrationQueue(connections)
  const payToByBlockchainQueue = new PayToByBlockchainQueue(connections)
  const payToByMattersQueue = new PayToByMattersQueue(connections)
  const payoutQueue = new PayoutQueue(connections)
  const userQueue = new UserQueue(connections)
  const queues = {
    publicationQueue,
    revisionQueue,
    assetQueue,
    migrationQueue,
    payToByBlockchainQueue,
    payToByMattersQueue,
    payoutQueue,
    userQueue,
  }
  const notificationService = new NotificationService(connections)
  const genContext = () => ({
    ..._context,
    dataSources: {
      atomService: new AtomService(connections),
      userService: new UserService(connections),
      userWorkService: new UserWorkService(connections),
      articleService: new ArticleService(connections),
      commentService: new CommentService(connections),
      draftService: new DraftService(connections),
      systemService: new SystemService(connections),
      tagService: new TagService(connections),
      oauthService: new OAuthService(connections),
      paymentService: new PaymentService(connections),
      collectionService: new CollectionService(connections),
      recommendationService: new RecommendationService(connections),
      momentService: new MomentService(connections),
      campaignService: new CampaignService(connections),
      translationService: new TranslationService(connections),
      notificationService,
      connections,
      queues,
      ...dataSources,
    },
  })

  await server.start()

  // mock v3 apollo server behavior
  return {
    executeOperation: async (req: GraphQLRequest) =>
      v4ToV3Result(
        await server.executeOperation(req, { contextValue: genContext() })
      ),
  }
}

const v4ToV3Result = (res: GraphQLResponse): any => {
  const { body } = res
  if (body.kind === 'single') {
    return body.singleResult as any
  } else {
    return body.initialResult as any
  }
}

export const publishArticle = async (
  input: GQLPublishArticleInput,
  connections: Connections
) => {
  const PUBLISH_ARTICLE = `
    mutation($input: PublishArticleInput!) {
      publishArticle(input: $input) {
        id
        publishState
        title
        content
        createdAt
        iscnPublish
        indentFirstLine
        article { id iscnId content indentFirstLine }
      }
    }
  `

  const server = await testClient({
    isAuth: true,
    connections,
  })

  const { data } = await server.executeOperation({
    query: PUBLISH_ARTICLE,
    variables: { input },
  })

  const draft = data && data.publishArticle
  return draft
}

interface PutDraftInput {
  client?: {
    isFrozen?: boolean
    context?: { viewer: User }
  }
  draft: GQLPutDraftInput
}

export const putDraft = async (
  { draft, client }: PutDraftInput,
  connections: Connections
) => {
  const PUT_DRAFT = `
    mutation($input: PutDraftInput!) {
      putDraft(input: $input) {
        id
        collection(input: { first: 10 }) {
          totalCount
          edges {
            node {
              id
            }
          }
        }
        tags
        cover
        title
        summary
        summaryCustomized
        content
        createdAt
        sensitiveByAuthor
        license
        requestForDonation
        replyToDonator
        iscnPublish
        canComment
        indentFirstLine
        campaigns {
           campaign {
              id
              name
           }
           stage {
              id
              name
           }
        }
      }
    }
  `

  const server = await testClient({
    isAuth: true,
    connections,
    ...client,
  })
  const result = await server.executeOperation({
    query: PUT_DRAFT,
    variables: { input: draft },
  })

  if (!result.data) {
    // if no return data, then pass entire result to parent
    return result
  }

  const putDraftResult = result && result.data && result.data.putDraft
  return putDraftResult
}

export const registerUser = async (email: string, connections: Connections) => {
  const EMAIL_REGISTER = `
    mutation EmailRegister($input: EmailLoginInput!) {
      emailLogin(input: $input) {
        auth
        token
      }
    }
  `

  const userService = new UserService(connections)
  const code = await userService.createVerificationCode({
    type: 'register',
    email,
  })
  await userService.markVerificationCodeAs({
    codeId: code.id,
    status: VERIFICATION_CODE_STATUS.verified,
  })

  const server = await testClient({ connections })
  return server.executeOperation({
    query: EMAIL_REGISTER,
    variables: { input: { email, passwordOrCode: code.code } },
  })
}

export const updateUserDescription = async (
  {
    email,
    description,
  }: {
    email?: string
    description: string
  },
  connections: Connections
) => {
  const UPDATE_USER_INFO_DESCRIPTION = `
    mutation UpdateUserInfo($input: UpdateUserInfoInput!) {
      updateUserInfo(input: $input) {
        info {
          description
        }
      }
    }
  `

  let _email = defaultTestUser.email
  if (email) {
    _email = email
  }
  const context = await getUserContext({ email: _email }, connections)
  const server = await testClient({
    context,
    connections,
  })
  return server.executeOperation({
    query: UPDATE_USER_INFO_DESCRIPTION,
    variables: { input: { description } },
  })
}

export const updateUserState = async (
  {
    id,
    emails,
    state,
    password,
  }: {
    id?: string
    emails?: string[]
    state: string
    password?: string
  },
  connections: Connections
) => {
  const UPDATE_USER_STATE = `
    mutation UpdateUserState($input: UpdateUserStateInput!) {
      updateUserState(input: $input) {
        id
        status {
          state
        }
        info {
          email
        }
      }
    }
  `

  const server = await testClient({ isAdmin: true, isAuth: true, connections })
  return server.executeOperation({
    query: UPDATE_USER_STATE,
    variables: { input: { id, state, emails, password } },
  })
}

export const setFeature = async (
  {
    isAdmin = true,
    isAuth = true,
    isMatty = true,
    input,
  }: { input: GQLSetFeatureInput } & BaseInput,
  connections: Connections
) => {
  const SET_FEATURE_FLAG = `
    mutation ($input: SetFeatureInput!) {
      setFeature(input: $input) {
        name
        enabled
      }
    }
  `
  const server = await testClient({ isAdmin, isAuth, isMatty, connections })
  const result = await server.executeOperation({
    query: SET_FEATURE_FLAG,
    variables: { input },
  })
  const data = result?.data?.setFeature
  return data
}
