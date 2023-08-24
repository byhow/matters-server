import type { GQLMutationResolvers } from 'definitions'

import { AUTH_RESULT_TYPE, SOCIAL_LOGIN_TYPE } from 'common/enums'
import { UserInputError } from 'common/errors'
import { setCookie } from 'common/utils'

export const socialLogin: GQLMutationResolvers['socialLogin'] = async (
  _,
  { input: { type, authorizationCode, codeVerifier, nonce } },
  { dataSources: { userService }, req, res }
) => {
  let user
  if (type === SOCIAL_LOGIN_TYPE.Twitter) {
    if (codeVerifier === undefined) {
      throw new UserInputError('codeVerifier is required')
    }
    const userInfo = await userService.fetchTwitterUserInfo(
      authorizationCode,
      codeVerifier
    )
    user = await userService.getOrCreateUserBySocialAccount({
      providerAccountId: userInfo.id,
      type: SOCIAL_LOGIN_TYPE.Twitter,
      userName: userInfo.username,
    })
  } else if (type === SOCIAL_LOGIN_TYPE.Facebook) {
    if (codeVerifier === undefined) {
      throw new UserInputError('codeVerifier is required')
    }
    const userInfo = await userService.fetchFacebookUserInfo(
      authorizationCode,
      codeVerifier
    )
    user = await userService.getOrCreateUserBySocialAccount({
      providerAccountId: userInfo.id,
      type: SOCIAL_LOGIN_TYPE.Facebook,
      userName: userInfo.username,
    })
  } else {
    if (nonce === undefined) {
      throw new UserInputError('nonce is required')
    }
    const userInfo = await userService.fetchGoogleUserInfo(
      authorizationCode,
      nonce
    )
    user = await userService.getOrCreateUserBySocialAccount({
      providerAccountId: userInfo.id,
      type: SOCIAL_LOGIN_TYPE.Google,
      email: userInfo.email,
      emailVerified: userInfo.emailVerified,
    })
  }
  const sessionToken = await userService.genSessionToken(user.id)
  setCookie({ req, res, token: sessionToken, user })

  return {
    token: sessionToken,
    auth: true,
    type: AUTH_RESULT_TYPE.Login,
    user,
  }
}

export const addSocialLogin: GQLMutationResolvers['addSocialLogin'] = async (
  _,
  __,
  { dataSources: { userService }, viewer }
) => {
  return userService.loadById(viewer.id)
}

export const removeSocialLogin: GQLMutationResolvers['removeSocialLogin'] =
  async (_, __, { dataSources: { userService }, viewer }) => {
    return userService.loadById(viewer.id)
  }
