import type { GQLCircleResolvers } from 'definitions'

import { INVITATION_STATE } from 'common/enums'

const resolver: GQLCircleResolvers['invitedBy'] = async (
  { id },
  _,
  {
    dataSources: {
      connections: { knex },
    },
    viewer,
  }
) => {
  if (!viewer.id) {
    return null
  }

  const invitation = await knex
    .select()
    .from('circle_invitation')
    .where({ circleId: id, state: INVITATION_STATE.pending })
    .andWhere(function () {
      this.where('user_id', viewer.id).orWhere('email', viewer.email)
    })
    .orderBy('created_at', 'desc')
    .first()

  return invitation
}

export default resolver
