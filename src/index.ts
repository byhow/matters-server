require('newrelic')
require('module-alias/register')
require('dotenv').config()
// external
import { ApolloServer } from 'apollo-server'
// internal
import logger from 'common/logger'
import { environment, isProd } from 'common/environment'
import { DataSources } from 'definitions'
import { makeContext, initSubscriptions } from 'common/utils'
import scheduleQueue from 'connectors/queue/schedule'
import {
  ArticleService,
  CommentService,
  DraftService,
  SystemService,
  TagService,
  UserService,
  NotificationService
} from 'connectors'
// local
import schema from './schema'

// start schedule jobs
scheduleQueue.start()

const server = new ApolloServer({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://web-stage.matters.news',
      'https://web-develop.matters.news',
      'http://matters-server-develop.ap-southeast-1.elasticbeanstalk.com/'
    ],
    credentials: true
  },
  schema,
  context: makeContext,
  engine: {
    apiKey: environment.apiKey
  },
  subscriptions: initSubscriptions(),
  dataSources: (): DataSources => ({
    userService: new UserService(),
    articleService: new ArticleService(),
    commentService: new CommentService(),
    draftService: new DraftService(),
    systemService: new SystemService(),
    tagService: new TagService(),
    notificationService: new NotificationService()
  }),
  debug: !isProd
  // mocks
})

server
  .listen({ port: process.env.PORT || 4000 })
  .then(({ url, subscriptionsUrl }) => {
    logger.info(`🚀 Server ready at ${url}`)
    logger.info(`🚀 Subscriptions ready at ${subscriptionsUrl}`)
  })
