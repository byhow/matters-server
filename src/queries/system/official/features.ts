import { OfficialToFeaturesResolver } from 'definitions'

export const features: OfficialToFeaturesResolver = async (
  root,
  input,
  { viewer, dataSources: { systemService } }
) => {
  const featureFlags = await systemService.getFeatureFlags()
  const result = await Promise.all(
    featureFlags.map(async ({ name, flag }) => ({
      name,
      enabled: await systemService.isFeatureEnabled(flag, viewer),
    }))
  )
  return result
}
