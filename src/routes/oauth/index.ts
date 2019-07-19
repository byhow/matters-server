// external
import querystring from 'querystring'
import { Router } from 'express'
import bodyParser from 'body-parser'
import passport from 'passport'

// internal
import { OAuthService } from 'connectors'
import { getViewerFromReq } from 'common/utils/getViewer'
import { environment } from 'common/environment'
import {
  OAUTH_AUTHORIZATION_TOKEN_EXPIRES_IN,
  OAUTH_ACCESS_TOKEN_EXPIRES_IN,
  OAUTH_REFRESH_TOKEN_EXPIRES_IN
} from 'common/enums'

// local
import passportStrategy from './strategy'
import OAuthServer from './express-oauth-server'

const oAuthRouter = Router()
const oAuthService = new OAuthService()
const oAuthServer = new OAuthServer({
  model: {
    generateAccessToken: oAuthService.generateAccessToken,
    generateRefreshToken: oAuthService.generateRefreshToken,
    getAuthorizationCode: oAuthService.getAuthorizationCode,
    getClient: oAuthService.getClient,
    saveToken: oAuthService.saveToken,
    saveAuthorizationCode: oAuthService.saveAuthorizationCode,
    revokeAuthorizationCode: oAuthService.revokeAuthorizationCode,
    validateScope: oAuthService.validateScope,
    getAccessToken: oAuthService.getAccessToken,
    getRefreshToken: oAuthService.getRefreshToken,
    revokeToken: oAuthService.revokeToken,
    verifyScope: oAuthService.verifyScope
  },
  allowEmptyState: true,
  authenticateHandler: {
    handle: async (req: any, res: any) => {
      const viewer = await getViewerFromReq({ req, res })

      if (!viewer.id) {
        return false
      }

      return viewer
    }
  },
  authorizationCodeLifetime: OAUTH_AUTHORIZATION_TOKEN_EXPIRES_IN / 1000,
  accessTokenLifetime: OAUTH_ACCESS_TOKEN_EXPIRES_IN / 1000,
  refreshTokenLifetime: OAUTH_REFRESH_TOKEN_EXPIRES_IN / 1000
})

/**
 * Routes
 */
oAuthRouter.use('/', bodyParser.json())
oAuthRouter.use('/', bodyParser.urlencoded({ extended: false }))
oAuthRouter.use('/', async (req, res, next) => {
  const viewer = await getViewerFromReq({ req, res })
  req.app.locals.viewer = viewer
  next()
})

/**
 * Routes
 */
// Provider
oAuthRouter.get('/authorize', async (req, res, next) => {
  const qs = querystring.stringify(req.query)
  const grantUrl = `${environment.siteDomain}/oauth/authorize?${qs}`
  const loginUrl = `${environment.siteDomain}/login?${querystring.stringify({
    target: grantUrl
  })}`
  let redirectUrl = ''

  if (req.app.locals.viewer.id) {
    // grant
    redirectUrl = grantUrl
  } else {
    // login then grant
    redirectUrl = loginUrl
  }

  res.redirect(redirectUrl)
})
oAuthRouter.post('/authorize', oAuthServer.authorize())
oAuthRouter.use('/access_token', oAuthServer.token())

// Receiver
passportStrategy()

oAuthRouter.get('/:provider', (req, res, next) => {
  passport.authenticate(req.params.provider)
})
oAuthRouter.get('/:provider/callbabck', (req, res, next) => {
  passport.authenticate(req.params.provider, {
    successRedirect: '/',
    failureRedirect: '/login'
  })
})

export const oauth = oAuthRouter
