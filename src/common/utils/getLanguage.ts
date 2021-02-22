import _ from 'lodash'

import { LANGUAGE } from 'common/enums'
import logger from 'common/logger'

// map supported language to header language
export const langMap = {
  [LANGUAGE.zh_hant]: [LANGUAGE.zh_hant, 'zh-hk', 'zh', 'zh-tw'],
  [LANGUAGE.zh_hans]: [LANGUAGE.zh_hans, 'zh-cn'],
  [LANGUAGE.en]: [LANGUAGE.en, 'en-us', 'en-au', 'en-za', 'en-gb'],
}

const langList = _.keys(langMap)

const reverseList = _(langMap)
  .values()
  .map((list, i) => list.map((lang) => ({ [lang]: langList[i] })))
  .flatten()
  // @ts-ignore
  .merge()
  .value()

export const reverseMap = _.assign.apply(_, reverseList)

// list of languages that we support
export const supportList = _.keys(reverseMap)

export const getLanguage = (acceptLanguage: string) => {
  try {
    // parse quality values
    const requestList = acceptLanguage
      .split(',')
      .map((lang) => lang.split(';')[0].toLowerCase())

    const supportIndex = requestList.findIndex((lang) =>
      supportList.includes(lang)
    )

    if (supportIndex >= 0) {
      return reverseMap[requestList[supportIndex]]
    }
  } catch (err) {
    logger.error(err)
  }

  return LANGUAGE.zh_hant
}
