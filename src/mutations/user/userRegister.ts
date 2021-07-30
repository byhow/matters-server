import { random } from 'lodash'

import {
  AUTO_FOLLOW_TAGS,
  CIRCLE_STATE,
  DB_NOTICE_TYPE,
  INVITATION_STATE,
  VERIFICATION_CODE_STATUS,
} from 'common/enums'
import { environment } from 'common/environment'
import {
  CodeInvalidError,
  DisplayNameInvalidError,
  EmailExistsError,
  EmailInvalidError,
  NameExistsError,
  NameInvalidError,
  PasswordInvalidError,
} from 'common/errors'
import {
  isValidDisplayName,
  isValidEmail,
  isValidPassword,
  isValidUserName,
  makeUserName,
  setCookie,
} from 'common/utils'
import {
  GQLVerificationCodeType,
  MutationToUserRegisterResolver,
} from 'definitions'

const resolver: MutationToUserRegisterResolver = async (
  root,
  { input },
  {
    viewer,
    dataSources: { atomService, tagService, userService, notificationService },
    req,
    res,
  }
) => {
  const { email: rawEmail, userName, displayName, password, codeId } = input
  const email = rawEmail.toLowerCase()
  if (!isValidEmail(email, { allowPlusSign: false })) {
    throw new EmailInvalidError('invalid email address format')
  }

  // check verification code
  const [code] = await userService.findVerificationCodes({
    where: {
      uuid: codeId,
      email,
      type: GQLVerificationCodeType.register,
      status: VERIFICATION_CODE_STATUS.verified,
    },
  })
  if (!code) {
    throw new CodeInvalidError('code does not exists')
  }

  // check email
  const otherUser = await userService.findByEmail(email)
  if (otherUser) {
    throw new EmailExistsError('email address has already been registered')
  }

  // check display name
  // Note: We will use "userName" to pre-fill "displayName" in step-1 of signUp flow on website
  const shouldCheckDisplayName = displayName !== userName
  if (shouldCheckDisplayName && !isValidDisplayName(displayName)) {
    throw new DisplayNameInvalidError('invalid user display name')
  }

  // check password
  if (!isValidPassword(password)) {
    throw new PasswordInvalidError('invalid user password')
  }

  let newUserName
  if (userName) {
    if (!isValidUserName(userName)) {
      throw new NameInvalidError('invalid user name')
    }

    if (await userService.checkUserNameExists(userName)) {
      throw new NameExistsError('user name already exists')
    }

    newUserName = userName
  } else {
    // Programatically generate user name
    let retries = 0
    const mainName = makeUserName(email)
    newUserName = mainName
    while (
      !isValidUserName(newUserName) ||
      (await userService.checkUserNameExists(newUserName))
    ) {
      if (retries >= 20) {
        throw new NameInvalidError('cannot generate user name')
      }
      newUserName = `${mainName}${random(1, 999)}`
      retries += 1
    }
  }

  const newUser = await userService.create({
    ...input,
    email,
    userName: newUserName,
  })

  // auto follow matty
  await userService.follow(newUser.id, environment.mattyId)

  // auto follow tags
  const items = await Promise.all(
    AUTO_FOLLOW_TAGS.map((content) => tagService.findByContent({ content }))
  )
  await Promise.all(
    items.map((tags) => {
      const tag = tags[0]
      if (tag) {
        return tagService.follow({ targetId: tag.id, userId: newUser.id })
      }
    })
  )

  if (environment.mattyChoiceTagId) {
    await tagService.follow({
      targetId: environment.mattyChoiceTagId,
      userId: newUser.id,
    })
  }

  // mark code status as used
  await userService.markVerificationCodeAs({
    codeId: code.id,
    status: VERIFICATION_CODE_STATUS.used,
  })

  // send email
  notificationService.mail.sendRegisterSuccess({
    to: email,
    recipient: {
      displayName,
    },
    language: viewer.language,
  })

  // send circle invitations' notices if user is invited
  const invitations = await atomService.findMany({
    table: 'circle_invitation',
    where: { email, state: INVITATION_STATE.pending },
  })
  await Promise.all(
    invitations.map(async (invitation) => {
      const circle = await atomService.findFirst({
        table: 'circle',
        where: {
          id: invitation.circleId,
          state: CIRCLE_STATE.active,
        },
      })
      notificationService.trigger({
        event: DB_NOTICE_TYPE.circle_invitation,
        actorId: invitation.inviter,
        recipientId: newUser.id,
        entities: [
          {
            type: 'target',
            entityTable: 'circle',
            entity: circle,
          },
        ],
      })
    })
  )

  const { token, user } = await userService.login({ ...input, email })

  setCookie({ req, res, token, user })

  return { token, auth: true }
}

export default resolver
