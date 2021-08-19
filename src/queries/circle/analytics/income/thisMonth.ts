import {
  PAYMENT_PROVIDER,
  PRICE_STATE,
  TRANSACTION_PURPOSE,
  TRANSACTION_STATE,
  TRANSACTION_TARGET_TYPE,
} from 'common/enums'
import { CircleIncomeAnalyticsToThisMonthResolver } from 'definitions'

const resolver: CircleIncomeAnalyticsToThisMonthResolver = async (
  { id, owner },
  _,
  { dataSources: { atomService, systemService }, knex }
) => {
  const [{ id: entityTypeId }, price] = await Promise.all([
    systemService.baseFindEntityTypeId(TRANSACTION_TARGET_TYPE.circlePrice),
    atomService.findFirst({
      table: 'circle_price',
      where: { circleId: id, state: PRICE_STATE.active },
    }),
  ])

  const result = await knex
    .select()
    .from('transaction')
    .where({
      state: TRANSACTION_STATE.succeeded,
      purpose: TRANSACTION_PURPOSE.subscriptionSplit,
      provider: PAYMENT_PROVIDER.matters,
      recipientId: owner,
      targetType: entityTypeId,
      targetId: price.id,
    })
    .andWhere(
      'created_at',
      '<',
      knex.raw(`date_trunc('month', current_date + interval '1' month)`)
    )
    .andWhere('created_at', '>=', knex.raw(`date_trunc('month', current_date)`))
    .sum('amount as total')

  if (!result || !result[0]) {
    return 0
  }

  return parseInt(result[0].total || 0, 10)
}

export default resolver
