const baseConfig = {
  client: 'postgresql',
  connection: {
    host: process.env.MATTERS_PG_HOST,
    user: process.env.MATTERS_PG_USER,
    password: process.env.MATTERS_PG_PASSWORD,
    database: process.env.MATTERS_PG_DATABASE,
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: './db/migrations',
  },
  seeds: {
    directory: './db/seeds',
  },
}

module.exports = {
  test: {
    ...baseConfig,
    connection: {
      ...baseConfig.connection,
      database: 'test_' + process.env['MATTERS_PG_DATABASE'], // always prefix test db with 'test_'
    },
  },

  local: baseConfig,

  development: baseConfig,

  stage: baseConfig,

  production: {
    ...baseConfig,
    pool: {
      min: 2,
      max: 10,
    },
  },
}
