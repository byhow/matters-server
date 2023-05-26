import { createHash } from 'crypto'
import { Request, Response, Router } from 'express'

import { getLogger } from 'common/logger'
import { getViewerFromReq } from 'common/utils'
import { cfsvc } from 'connectors'
import { GQLAssetType } from 'definitions'

const logger = getLogger('route-img-cache')

export const imgCache = Router()

imgCache.get('/*', async (req: Request, res: Response) => {
  let viewer
  try {
    viewer = await getViewerFromReq({ req })
  } catch (err) {
    logger.error(err)
  }
  if (!viewer?.id) {
    res.status(401).end()
    return
  }

  const origUrl = req.params[0]
  const uuid = createHash('md5').update(origUrl).digest('hex')

  // get image key by url
  let key = await cfsvc.getFileKeyByUrl(GQLAssetType.imgCached, origUrl, uuid)

  // upload to Cloudflare Images if not exists
  if (!key) {
    try {
      key = await cfsvc.baseServerSideUploadFile(
        GQLAssetType.imgCached,
        origUrl,
        uuid
      )
    } catch (err) {
      logger.error(err)
      res.status(400).end()
      return
    }
  }

  return res.redirect(cfsvc.genUrl(key))
})
