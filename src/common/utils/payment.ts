import NP from 'number-precision'

import { PAYMENT_CURRENCY, PAYMENT_PROVIDER } from 'common/enums'

NP.enableBoundaryChecking(false)

export const numRound = (num: number, decPlaces: number = 2) => {
  return NP.round(num, decPlaces)
}

/**
 * Convert DB amount to provider amount
 *
 * @see {@url https://stripe.com/docs/currencies#zero-decimal}
 */

interface ToAmountArgs {
  amount: number
  currency?: PAYMENT_CURRENCY
  provider?: Exclude<PAYMENT_PROVIDER, PAYMENT_PROVIDER.likecoin | PAYMENT_PROVIDER.matters>
}

const PROVIDER_CURRENCY_RATE = {
  stripe: {
    HKD: 100,
    LIKE: 1,
  },
}

export const toProviderAmount = ({
  amount,
  currency = PAYMENT_CURRENCY.HKD,
  provider = PAYMENT_PROVIDER.stripe,
}: ToAmountArgs) => {
  const rate = PROVIDER_CURRENCY_RATE[provider][currency]
  return NP.times(amount, rate)
}

/**
 * Convert provider amount to DB amount
 */
export const toDBAmount = ({
  amount,
  currency = PAYMENT_CURRENCY.HKD,
  provider = PAYMENT_PROVIDER.stripe,
}: ToAmountArgs) => {
  const rate = PROVIDER_CURRENCY_RATE[provider][currency]
  return NP.divide(amount, rate)
}

/**
 * Calculate Stripe Fee by a given amount based on their pricing model:
 *
 * @see {@url https://stripe.com/en-hk/pricing}
 * @see {@url https://support.stripe.com/questions/passing-the-stripe-fee-on-to-customers}
 */
const FEE_FIXED = 2.35
const FEE_PERCENT = 0.034

export const calcStripeFee = (amount: number) => {
  const charge = (amount + FEE_FIXED) / (1 - FEE_PERCENT)
  const fee = charge - amount
  return numRound(fee)
}

export const calcMattersFee = (amount: number) => {
  const fee = amount * 0.05
  return numRound(fee)
}
