import { random } from 'lodash'

import { AUTO_FOLLOW_TAGS } from 'common/enums'
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
import { MutationToUserRegisterResolver } from 'definitions'

const resolver: MutationToUserRegisterResolver = async (
  root,
  { input },
  {
    viewer,
    dataSources: { tagService, userService, notificationService },
    req,
    res,
  }
) => {
  const { email: rawEmail, userName, displayName, password, codeId } = input
  const email = rawEmail ? rawEmail.toLowerCase() : null
  if (!isValidEmail(email, { allowPlusSign: false })) {
    throw new EmailInvalidError('invalid email address format')
  }

  // check verification code
  const [code] = await userService.findVerificationCodes({
    where: {
      uuid: codeId,
      email,
      type: 'register',
      status: 'verified',
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

  // mark code status as used
  await userService.markVerificationCodeAs({
    codeId: code.id,
    status: 'used',
  })

  // send email
  notificationService.mail.sendRegisterSuccess({
    to: email,
    recipient: {
      displayName,
    },
    language: viewer.language,
  })

  const { token, user } = await userService.login({ ...input, email })

  setCookie({ req, res, token, user })

  return { token, auth: true }
}

export default resolver
