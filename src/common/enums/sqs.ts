import { environment } from 'common/environment'

export const QUEUE_URL = {
  archiveUser: environment?.awsArchiveUserQueueUrl,

  // notification
  notification: environment?.awsNotificationQueueUrl,

  // likecoin
  likecoinLike: environment?.awsLikecoinLikeUrl,
  likecoinSendPV: environment?.awsLikecoinSendPVUrl,
  likecoinUpdateCivicLikerCache: environment?.awsLikecoinUpdateCivicLikerCache,

  // sendmail
  mail: environment?.awsMailQueueUrl,
  expressMail: environment?.awsExpressMailQueueUrl,

  // IPNS
  ipnsUserPublication: environment?.awsIpnsUserPublicationQueueUrl,
} as const
