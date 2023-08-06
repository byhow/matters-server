import type {
  AuthMode,
  GQLAuthResultType,
  GQLMutationResolvers,
} from 'definitions'

import { invalidateFQC } from '@matters/apollo-response-cache'
import { recoverPersonalSignature } from 'eth-sig-util'
import { Contract, utils } from 'ethers'
import { Knex } from 'knex'

import {
  BLOCKCHAIN_CHAINID,
  NODE_TYPES,
  VERIFICATION_CODE_STATUS,
  VERIFICATION_CODE_TYPE,
  AUTH_RESULT_TYPE,
} from 'common/enums'
import {
  CodeExpiredError,
  CodeInactiveError,
  CodeInvalidError,
  CryptoWalletExistsError,
  EmailExistsError,
  EthAddressNotFoundError,
  UserInputError,
} from 'common/errors'
import {
  getAlchemyProvider,
  getViewerFromUser,
  IERC1271,
  setCookie,
} from 'common/utils'
import { redis } from 'connectors'

const resolver: GQLMutationResolvers['walletLogin'] = async (
  _,
  { input: { ethAddress, nonce, signedMessage, signature, email, codeId } },
  context
) => {
  const {
    viewer,
    req,
    res,
    dataSources: { userService, atomService, systemService, tagService },
    knex,
  } = context

  if (!ethAddress || !utils.isAddress(ethAddress)) {
    throw new UserInputError('address is invalid')
  }
  const sig_table = 'crypto_wallet_signature'

  const lastSigning = await atomService.findFirst({
    table: sig_table,
    where: (builder: Knex.QueryBuilder) =>
      builder
        .where({ address: ethAddress, nonce })
        .whereNull('signature')
        .whereRaw('expired_at > CURRENT_TIMESTAMP'),
    orderBy: [{ column: 'id', order: 'desc' }],
  })

  if (!lastSigning) {
    throw new EthAddressNotFoundError(
      `wallet signing for "${ethAddress}" not found`
    )
  }

  // if it's smart contract wallet
  const isValidSignature = async () => {
    const MAGICVALUE = '0x1626ba7e'

    const chainType = 'Polygon'

    const chainNetwork = 'PolygonMainnet'

    const provider = getAlchemyProvider(
      Number(BLOCKCHAIN_CHAINID[chainType][chainNetwork])
    )

    const bytecode = await provider.getCode(ethAddress.toLowerCase())

    const isSmartContract = bytecode && utils.hexStripZeros(bytecode) !== '0x'

    const hash = utils.hashMessage(signedMessage)

    if (isSmartContract) {
      // verify the message for a decentralized account (contract wallet)
      const contractWallet = new Contract(ethAddress, IERC1271, provider)
      const verification = await contractWallet.isValidSignature(
        hash,
        signature
      )

      const doneVerified = verification === MAGICVALUE

      if (!doneVerified) {
        throw new UserInputError('signature is not valid')
      }
    } else {
      // verify signature for EOA account
      const verifiedAddress = recoverPersonalSignature({
        data: signedMessage,
        sig: signature,
      }).toLowerCase()

      if (ethAddress.toLowerCase() !== verifiedAddress) {
        throw new UserInputError('signature is not valid')
      }
    }
  }

  await isValidSignature()

  const user = await userService.findByEthAddress(ethAddress)

  /**
   * Link
   */
  if (viewer.id && viewer.token && !viewer.ethAddress) {
    await atomService.update({
      table: sig_table,
      where: { id: lastSigning.id },
      data: {
        signature,
        userId: viewer.id,
        updatedAt: knex.fn.now(),
      },
    })

    if (user) {
      throw new CryptoWalletExistsError('eth address already has a user')
    }

    await userService.baseUpdate(viewer.id, {
      updatedAt: knex.fn.now(),
      ethAddress: ethAddress.toLowerCase(), // save the lower case ones
    })

    // archive crypto_wallet entry
    await atomService.update({
      table: 'crypto_wallet',
      where: { userId: viewer.id, archived: false },
      data: { updatedAt: knex.fn.now(), archived: true },
    })

    await invalidateFQC({
      node: { type: NODE_TYPES.User, id: viewer.id },
      redis,
    })

    return {
      token: viewer.token,
      auth: true,
      type: AUTH_RESULT_TYPE.LinkAccount,
      user: viewer,
    }
  }

  const archivedCallback = async () =>
    systemService.saveAgentHash(viewer.agentHash || '')

  const tryLogin = async (type: GQLAuthResultType) => {
    const { token } = await userService.loginByEthAddress({
      ethAddress,
      archivedCallback,
    })

    setCookie({ req, res, token, user })

    context.viewer = await getViewerFromUser(user)
    context.viewer.authMode = user.role as AuthMode
    context.viewer.scope = {}

    // update crypto_wallet_signature record
    await atomService.update({
      table: sig_table,
      where: { id: lastSigning.id },
      data: {
        signature,
        userId: user.id,
        updatedAt: new Date(),
        expiredAt: null, // check if expired before reset to null
      },
    })

    return { token, auth: true, type, user }
  }

  if (user) {
    // login
    try {
      return await tryLogin(AUTH_RESULT_TYPE.Login)
    } catch (err) {
      const isNoEthAddress = err instanceof EthAddressNotFoundError
      if (!isNoEthAddress) {
        throw err
      }
    }
  } else {
    // signup
    if (email) {
      if (!codeId) {
        throw new UserInputError('email and codeId are required')
      }
      // check verification code
      const codes = await userService.findVerificationCodes({
        where: {
          uuid: codeId,
          email,
          type: VERIFICATION_CODE_TYPE.register,
        },
      })
      const code = codes?.length > 0 ? codes[0] : {}

      // check code
      if (code.status === VERIFICATION_CODE_STATUS.expired) {
        throw new CodeExpiredError('code is expired')
      }
      if (code.status === VERIFICATION_CODE_STATUS.inactive) {
        throw new CodeInactiveError('code is retired')
      }
      if (code.status !== VERIFICATION_CODE_STATUS.verified) {
        throw new CodeInvalidError('code does not exists')
      }

      // check email
      const otherUser = await userService.findByEmail(email)
      if (otherUser) {
        throw new EmailExistsError('email address has already been registered')
      }

      const userName = await userService.generateUserName(email)
      const newUser = await userService.create({
        email,
        userName,
        displayName: userName,
        ethAddress: ethAddress.toLowerCase(), // save the lower case ones
      })
      // mark code status as used
      await userService.postRegister(newUser, { tagService })
      await userService.markVerificationCodeAs({
        codeId: code.id,
        status: VERIFICATION_CODE_STATUS.used,
      })
    } else {
      const newUser = await userService.create({
        ethAddress: ethAddress.toLowerCase(),
      })
      await userService.postRegister(newUser, { tagService })
    }
  }

  return tryLogin(AUTH_RESULT_TYPE.Signup)
}

export default resolver
