const table = 'article_read_count'

exports.up = async (knex) => {
  await knex.schema.table(table, (t) => {
    t.index(['created_at'])
  })
}

exports.down = async (knex) => {
  await knex.schema.table(table, (t) => {
    t.dropIndex(['created_at'])
  })
}
