export default /* GraphQL */ `
  extend type Query {
    article(uuid: UUID!): Article
    tag(input: TagInput): Tag
  }

  input TagInput {
    tag: String!
  }

  extend type Mutation {
    publishArticle(input: PublishArticleInput): Article!
    archiveArticle(input: ArchiveArticleInput): Article!
    subscribeArticle(input: SubscribeArticleInput): Boolean
    unsubscribeArticle(input: UnsubscribeArticleInput): Boolean
    reportArticle(input: ReportArticleInput): Boolean
    appreciateArticle(input: AppreciateArticleInput): Int!
    readArticle(input: ReadArticleInput): Boolean
  }

  type Article {
    uuid: UUID!
    createdAt: DateTime!
    public: Boolean!
    author: User!
    title: String!
    # url for cover
    cover: URL!
    summary: String!
    tags: [Tag!]
    wordCount: Int
    hash: String
    content: String!
    gatewayUrls: [URL]
    upstream: Article
    downstreams: [Article]
    relatedArticles(input: ListInput): [Article]!
    # MAT recieved for this article
    MAT: Int!
    commentCount: Int!
    # Current user has subscribed
    subscribed: Boolean!
    pinnedComments: [Comment]
    comments(input: ListInput): [Comment]
    subscribers(input: ListInput): [User]
    appreciators(input: ListInput): [User]
    hasAppreciate: Boolean!
    publishState: PublishState!
  }

  type Tag {
    text: String
    count: Int
    articles(input: ListInput): [Article]
  }

  input CommentsInput {
    offset: Int
    limit: Int
    byViewer: Boolean
    hasCitation: Boolean
  }

  input PublishArticleInput {
    # publish with draft uuid
    uuid: UUID
  }

  input ArchiveArticleInput {
    uuid: UUID
  }

  input SubscribeArticleInput {
    uuid: UUID
  }

  input UnsubscribeArticleInput {
    uuid: UUID
  }

  input ReportArticleInput {
    uuid: UUID
    category: String
    description: String
  }

  input AppreciateArticleInput {
    uuid: UUID
    amount: Int
  }

  input ReadArticleInput {
    uuid: UUID
  }

  enum PublishState {
    archived
    pending
    error
    published
  }

`
