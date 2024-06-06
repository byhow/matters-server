const { baseDown } = require('../utils')

const table = 'journal'

exports.up = async (knex) => {
  await knex('entity_type').insert({ table })
  await knex.schema.createTable(table, (t) => {
    t.bigIncrements('id').primary()
    t.bigInteger('author_id').unsigned().notNullable()
    t.text('content')
    t.enu('state', ['active', 'archived'])
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())

    t.foreign('author_id').references('id').inTable('user')
  })
}

exports.down = baseDown(table)
