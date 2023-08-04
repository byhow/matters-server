import type { GQLMutationResolvers } from 'definitions'

const resolver: GQLMutationResolvers['setFeature'] = async (
  root,
  { input: { name, flag } },
  { dataSources: { systemService }, viewer }
) => {
  const updated = await systemService.setFeatureFlag({ name, flag })
  const enabled = await systemService.isFeatureEnabled(updated.flag, viewer)
  return { name: updated.name, enabled }
}

export default resolver
