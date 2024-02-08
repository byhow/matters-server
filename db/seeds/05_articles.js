exports.seed = async function (knex, Promise) {
  const articleTable = 'article'
  const articleVersionTable = 'article_version'
  const articleContentTable = 'article_content'

  await knex(articleVersionTable).del()
  await knex(articleContentTable).del()
  await knex(articleTable).del()

  const rows1 = await knex(articleContentTable)
    .insert([
      {
        content: '<div>some html string</div>',
        hash: 'hash1',
      },
    ])
    .returning('id')
  const contentId1 = rows1[0].id

  const rows2 = await knex(articleTable)
    .insert([
      {
        author_id: 1,
        state: 'active',
      },
      {
        author_id: 2,
        state: 'active',
      },
      {
        author_id: 3,
        state: 'active',
      },
      {
        author_id: 1,
        state: 'active',
      },
      {
        author_id: 7,
        state: 'active',
      },
      {
        author_id: 1,
        state: 'active',
      },
    ])
    .returning('id')
  const articleIds = rows2.map((row) => row.id)

  return knex(articleVersionTable).insert([
    {
      article_id: articleIds[0],
      content_id: contentId1,
      title: 'test article 1',
      summary: 'Some text',
      summary_customized: true,
      word_count: '1000',
      data_hash: 'someIpfsDataHash1',
      media_hash: 'someIpfsMediaHash1',
      tags: [],
      connections: [],
      pin_state: 'pinned',
      access: 'public',
      license: 'cc_by_nc_nd_4',
      can_comment: 'true',
      sensitive_by_author: 'false',
    },
    {
      article_id: articleIds[1],
      content_id: contentId1,
      title: 'test article 2',
      summary: 'Some text',
      summary_customized: true,
      word_count: '1000',
      data_hash: 'someIpfsDataHash2',
      media_hash: 'someIpfsMediaHash2',
      tags: [],
      connections: [],
      pin_state: 'pinned',
      access: 'public',
      license: 'cc_by_nc_nd_4',
      can_comment: 'true',
      sensitive_by_author: 'false',
    },
    {
      article_id: articleIds[2],
      content_id: contentId1,
      title: 'test article 3',
      summary: 'Some text',
      summary_customized: true,
      word_count: '1000',
      data_hash: 'someIpfsMediaHash3',
      media_hash: 'someIpfsMediaHash3',
      tags: [],
      connections: [],
      pin_state: 'pinned',
      access: 'public',
      license: 'cc_by_nc_nd_4',
      can_comment: 'true',
      sensitive_by_author: 'false',
    },
    {
      article_id: articleIds[3],
      content_id: contentId1,
      title: 'test article 4',
      summary: 'Some text',
      summary_customized: true,
      word_count: '1000',
      data_hash: 'someIpfsMediaHash4',
      media_hash: 'someIpfsMediaHash4',
      tags: [],
      connections: [],
      pin_state: 'pinned',
      access: 'public',
      license: 'cc_by_nc_nd_4',
      can_comment: 'true',
      sensitive_by_author: 'false',
    },
    {
      article_id: articleIds[4],
      content_id: contentId1,
      title: 'test article 5 active user',
      summary: 'Some text',
      summary_customized: true,
      word_count: '1000',
      data_hash: 'someIpfsMediaHash5',
      media_hash: 'someIpfsMediaHash5',
      tags: [],
      connections: [],
      pin_state: 'pinned',
      access: 'public',
      license: 'cc_by_nc_nd_4',
      can_comment: 'true',
      sensitive_by_author: 'false',
    },
    {
      article_id: articleIds[5],
      content_id: contentId1,
      title: 'test article 6',
      summary: 'Some text',
      summary_customized: true,
      word_count: 1000,
      data_hash: 'someIpfsMediaHash4',
      media_hash: 'someIpfsMediaHash4',
      tags: [],
      connections: [],
      pin_state: 'pinned',
      access: 'public',
      license: 'cc_by_nc_nd_4',
      can_comment: 'true',
      sensitive_by_author: 'false',
    },
  ])
}
