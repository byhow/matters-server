import { AsyncLocalStorage } from 'async_hooks'
import { createLogger, format, transports } from 'winston'

import { environment } from 'common/environment'

export const contextStorage = new AsyncLocalStorage<Map<string, string>>()

const setContext = format((info, _) => {
  const context = contextStorage.getStore()
  if (context) {
    info.requestId = context!.get('requestId')
    // info.jobId = context!.get('jobId')
  }
  return info
})

const createWinstonLogger = (name: string, level: string) =>
  createLogger({
    level,
    format: format.combine(
      format.splat(),
      format.errors({ stack: true }),
      setContext(),
      format.label({ label: name }),
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      format.printf(
        (info) =>
          `${info.timestamp} ${info.requestId ?? '-'} ${info.label} ${
            info.level
          }: ${info.message} ${info.stack ?? ''}`
      )
    ),
    transports: [new transports.Console({ level })],
  })

const loggers = new Map()

export const getLogger = (name: string) => {
  const logger = loggers.get(name)
  if (logger) {
    return logger
  }
  const level = environment.debug.includes(name)
    ? 'debug'
    : environment.loggingLevel
  const newLogger = createWinstonLogger(name, level)
  loggers.set(name, newLogger)
  return newLogger
}

// print environment

getLogger('env').debug('environment %s', environment)
