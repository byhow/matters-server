import { MailData } from '@sendgrid/helpers/classes/mail'

import { QUEUE_JOB, QUEUE_NAME, QUEUE_PRIORITY } from 'common/enums'
import { mailService, PushParams, pushService } from 'connectors'

import { BaseQueue } from './baseQueue'

class NotificationQueue extends BaseQueue {
  constructor() {
    super(QUEUE_NAME.notification)
    this.addConsumers()
  }

  /**
   * Producers
   */
  sendMail = (data: MailData) => {
    return this.q.add(QUEUE_JOB.sendMail, data, {
      priority: QUEUE_PRIORITY.NORMAL
    })
  }

  pushNotification = (data: PushParams) => {
    return this.q.add(QUEUE_JOB.pushNotification, data, {
      priority: QUEUE_PRIORITY.NORMAL
    })
  }

  /**
   * Cusumers
   */
  private addConsumers = () => {
    this.q.process(QUEUE_JOB.sendMail, async (job, done) => {
      try {
        const result = await mailService.send(job.data as MailData)
        job.progress(100)
        done(null, result)
      } catch (e) {
        done(e)
      }
    })
    this.q.process(QUEUE_JOB.pushNotification, async (job, done) => {
      try {
        const result = await pushService.push(job.data as PushParams)
        job.progress(100)
        done(null, result)
      } catch (e) {
        done(e)
      }
    })
  }
}

export const notificationQueue = new NotificationQueue()
