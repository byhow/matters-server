import type { GQLMutationResolvers } from 'definitions'

import { AuthenticationError, UserInputError } from 'common/errors'
import { fromGlobalId } from 'common/utils'

const resolver: GQLMutationResolvers['deleteJournal'] = async (
  _,
  { input: { id: globalId } },
  { viewer, dataSources: { journalService } }
) => {
  if (!viewer.id) {
    throw new AuthenticationError('visitor has no permission')
  }

  const { id, type } = fromGlobalId(globalId)

  if (type !== 'Journal') {
    throw new UserInputError('invalid id')
  }

  await journalService.delete(id, viewer)

  return true
}

export default resolver
