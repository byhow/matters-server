const { baseDown } = require('../utils')

const table = 'user_badge'

exports.up = async knex => {
  await knex('entity_type').insert({ table })
  await knex.schema.createTable(table, t => {
    t.bigIncrements('id').primary()
    t.bigInteger('user_id')
      .unsigned()
      .notNullable()
    t.enu('type', ['seed']).notNullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())

    t.unique(['user_id', 'type'])

    t.foreign('user_id')
      .references('id')
      .inTable('user')
  })
}

exports.down = baseDown(table)
