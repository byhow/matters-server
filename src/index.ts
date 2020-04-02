import * as Sentry from '@sentry/node'
import cors from 'cors'
import express from 'express'
import * as firebase from 'firebase-admin'
import helmet from 'helmet'
import http from 'http'
import 'module-alias/register'
import 'newrelic'
import requestIp from 'request-ip'

import { CORS_OPTIONS } from 'common/enums'
import { environment } from 'common/environment'

import * as routes from './routes'

/**
 * Init
 */
// Sentry
Sentry.init({ dsn: environment.sentryDsn || '' })

// Firebase
try {
  firebase.initializeApp({
    credential: firebase.credential.cert(environment.firebaseCert),
  })
} catch (e) {
  console.error(new Date(), 'Failed to initialize admin, skipped')
}

// Express
const PORT = 4000
const app = express()
const httpServer = http.createServer(app)

/**
 * Middlewares
 */

app.use(helmet())
app.use(requestIp.mw())
app.use(cors(CORS_OPTIONS))

/**
 * Routes
 *
 * @see {@url https://www.apollographql.com/docs/apollo-server
 * /features/subscriptions/#subscriptions-with-additional-middleware}
 */

// GraphQL
const server = routes.graphql(app)
server.installSubscriptionHandlers(httpServer)

// OAuth
app.use('/oauth', routes.oauth)

httpServer.listen(PORT, () => {
  console.log(
    `🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`
  )
  console.log(
    `🚀 Subscriptions ready at ws://localhost:${PORT}${server.subscriptionsPath}`
  )
})
