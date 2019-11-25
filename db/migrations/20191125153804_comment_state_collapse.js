const { alterEnumString } = require('../utils')

const table = 'comment'

exports.up = async knex => {
  await knex.raw(
    alterEnumString(table, 'state', [
      'active',
      'archived',
      'banned',
      'collapse'
    ])
  )
}

exports.down = async knex => {
  await knex.raw(
    alterEnumString(table, 'state', ['active', 'archived', 'banned'])
  )
}
