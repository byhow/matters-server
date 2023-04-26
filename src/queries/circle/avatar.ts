import { CircleToAvatarResolver } from 'definitions'

const resolver: CircleToAvatarResolver = async (
  { avatar },
  _,
  { dataSources: { systemService } }
) => {
  return avatar ? systemService.findAssetUrl(avatar) : null
}

export default resolver
