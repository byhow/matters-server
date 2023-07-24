import article from './article'
import circle from './circle'
import collection from './collection'
import comment from './comment'
import draft from './draft'
import notice from './notice'
import oauthClient from './oauthClient'
import payment from './payment'
import response from './response'
import scalars from './scalars'
import system from './system'
import user from './user'

const Root = /* GraphQL */ `
  type Query
  type Mutation

  schema {
    query: Query
    mutation: Mutation
  }
`

export default [
  Root,
  article,
  circle,
  comment,
  draft,
  notice,
  scalars,
  system,
  user,
  response,
  payment,
  oauthClient,
  collection,
]
