import { MutationToRenameTagResolver } from 'definitions'
import { fromGlobalId } from 'common/utils'

const resolver: MutationToRenameTagResolver = async (
  root,
  { input: { id, content } },
  { viewer, dataSources: { tagService } }
) => {
  const { id: dbId } = fromGlobalId(id)
  const newTag = await tagService.renameTag({ tagId: dbId, content })
  return newTag
}

export default resolver
