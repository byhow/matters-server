import { VERIFICATION_CODE_STATUS } from 'common/enums'
import { CodeExpiredError, CodeInvalidError } from 'common/errors'
import { MutationToConfirmVerificationCodeResolver } from 'definitions'

const resolver: MutationToConfirmVerificationCodeResolver = async (
  _,
  { input },
  { dataSources: { userService } }
) => {
  const { email: rawEmail } = input
  const email = rawEmail.toLowerCase()
  const [code] = await userService.findVerificationCodes({
    where: { ...input, email, status: VERIFICATION_CODE_STATUS.active },
  })

  if (!code) {
    throw new CodeInvalidError('code does not exists')
  }

  if (code.expiredAt < new Date()) {
    // mark code status as expired
    await userService.markVerificationCodeAs({
      codeId: code.id,
      status: VERIFICATION_CODE_STATUS.expired,
    })
    throw new CodeExpiredError('code is exipred')
  }

  // mark code status as verified
  await userService.markVerificationCodeAs({
    codeId: code.id,
    status: VERIFICATION_CODE_STATUS.verified,
  })

  return code.uuid
}

export default resolver
