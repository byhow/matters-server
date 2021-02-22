import { PRICE_STATE, SUBSCRIPTION_STATE } from 'common/enums'
import { CircleToIsMemberResolver } from 'definitions'

const resolver: CircleToIsMemberResolver = async (
  { id },
  _,
  { viewer, dataSources: { atomService }, knex }
) => {
  if (!viewer.id) {
    return false
  }

  const records = await knex
    .select()
    .from('circle_subscription_item as csi')
    .join('circle_price', 'circle_price.id', 'csi.price_id')
    .join('circle_subscription as cs', 'cs.id', 'csi.subscription_id')
    .where({
      'csi.user_id': viewer.id,
      'csi.archived': false,
      'circle_price.circle_id': id,
      'circle_price.state': PRICE_STATE.active,
    })
    .whereIn('cs.state', [
      SUBSCRIPTION_STATE.active,
      SUBSCRIPTION_STATE.trialing,
    ])

  return records && records.length > 0
}

export default resolver
