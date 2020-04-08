import { EMAIL_TEMPLATE_ID } from 'common/enums'
import { environment } from 'common/environment'
import { notificationQueue } from 'connectors/queue/notification'
import { LANGUAGES } from 'definitions'

import { trans } from './utils'

export const sendUserDeletedByAdmin = async ({
  to,
  recipient,
  language = 'zh_hant',
}: {
  to: string
  recipient: {
    displayName: string
  }
  language?: LANGUAGES
}) => {
  const templateId = EMAIL_TEMPLATE_ID.userDeleted[language]
  notificationQueue.sendMail({
    from: environment.emailFromAsk as string,
    templateId,
    personalizations: [
      {
        to,
        // @ts-ignore
        dynamic_template_data: {
          subject: trans.userDeleted(language, {}),
          siteDomain: environment.siteDomain,
          recipient,
        },
      },
    ],
  })
}
