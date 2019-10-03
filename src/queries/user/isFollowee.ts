import { UserToIsFolloweeResolver } from 'definitions'

const resolver: UserToIsFolloweeResolver = async (
  { id },
  _,
  { viewer, dataSources: { userService } }
) => {
  if (!viewer.id) {
    return false
  }
  return userService.isFollowing({
    userId: viewer.id,
    targetId: id
  })
}

export default resolver
