import _trim from 'lodash/trim'

import { PAYMENT_CURRENCY } from 'common/enums'
import {
  AssetNotFoundError,
  AuthenticationError,
  DuplicateCircleError,
  EntityNotFoundError,
  ServerError,
  UserInputError,
} from 'common/errors'
import { fromGlobalId } from 'common/utils'
import { MutationToPutCircleResolver } from 'definitions'

enum ACTION {
  add = 'add',
  update = 'update',
}

const resolver: MutationToPutCircleResolver = async (
  root,
  { input: { id, avatar, cover, name, displayName, description, amount } },
  { viewer, dataSources: { atomService, paymentService }, knex }
) => {
  if (!viewer.id) {
    throw new AuthenticationError('visitor has no permission')
  }

  const action = id ? ACTION.update : ACTION.add
  const trimedName = _trim(name)
  const trimedDisplayName = _trim(displayName)
  const trimedDescription = _trim(description)

  switch (action) {
    case ACTION.add: {
      // checks: valid amount, duplicate circle
      if (!trimedName || !trimedDisplayName) {
        throw new UserInputError(
          'circleName and displayName is required for creation'
        )
      }
      if (amount < 0) {
        throw new UserInputError('minimal amount is 0')
      }
      const places = amount % 1 ? amount.toString().split('.')[1].length : 0
      if (places > 2) {
        throw new UserInputError('maximum 2 decimal places')
      }

      const [hasCircle, sameCircle] = await Promise.all([
        atomService.count({ table: 'circle', where: { owner: viewer.id } }),
        atomService.count({
          table: 'circle',
          where: { name: trimedName },
        }),
      ])

      if (hasCircle > 0) {
        throw new DuplicateCircleError('alredy own a circle')
      }
      if (sameCircle > 0) {
        throw new DuplicateCircleError(`duplicate circle name: ${trimedName}`)
      }

      // create a stripe product
      const stripeProduct = await paymentService.stripe.createProduct({
        name: trimedName,
        owner: viewer.id,
      })

      if (!stripeProduct) {
        throw new ServerError('cannot retrieve stripe product')
      }

      // create a stripe price
      const stripePrice = await paymentService.stripe.createPrice({
        amount,
        currency: PAYMENT_CURRENCY.HKD,
        interval: 'month',
        productId: stripeProduct.id,
      })

      if (!stripePrice) {
        throw new ServerError('cannot retrieve stripe price')
      }

      const circle = await knex.transaction(async (trx) => {
        // create a matters circle
        const [record] = await trx
          .insert({
            name: trimedName,
            displayName: trimedDisplayName,
            description: trimedDescription,
            owner: viewer.id,
            providerProductId: stripeProduct.id,
          })
          .into('circle')
          .returning('*')

        // creat a matters price
        await trx
          .insert({
            amount,
            circleId: record.id,
            providerPriceId: stripePrice.id,
          })
          .into('circle_price')

        return record
      })

      return circle
    }

    case ACTION.update: {
      let data: Record<string, any> = {}
      let unusedAssetIds: string[] = []

      const { id: circleId } = fromGlobalId(id || '')
      const circle = await atomService.findFirst({
        table: 'circle',
        where: { id: circleId, owner: viewer.id },
      })

      if (!circle) {
        throw new EntityNotFoundError(`Circle ${circleId} not found`)
      }

      // transform update paramters
      if (trimedName) {
        const sameCircle = await atomService.count({
          table: 'circle',
          where: { name: trimedName },
        })

        if (sameCircle > 0) {
          throw new DuplicateCircleError(`duplicate circle name: ${trimedName}`)
        }
        data = { ...data, name: trimedName }
      }

      if (avatar) {
        const avatarAsset = await atomService.findFirst({
          table: 'asset',
          where: { uuid: avatar },
        })

        if (!avatarAsset) {
          throw new AssetNotFoundError('circle avatar not found')
        }
        data = { ...data, avatar: avatarAsset.id }

        // store unused avatar
        if (circle.avatar) {
          unusedAssetIds = [...unusedAssetIds, circle.avatar]
        }
      }

      if (cover) {
        const coverAsset = await atomService.findFirst({
          table: 'asset',
          where: { uuid: cover },
        })

        if (!coverAsset) {
          throw new AssetNotFoundError('circle avatar not found')
        }
        data = { ...data, cover: coverAsset.id }

        // store unused cover
        if (circle.cover) {
          unusedAssetIds = [...unusedAssetIds, circle.cover]
        }
      }

      if (trimedDisplayName) {
        data = { ...data, displayName: trimedDisplayName }
      }

      if (trimedDescription) {
        data = { ...data, description: trimedDescription }
      }

      const updatedCircle = await atomService.update({
        table: 'circle',
        where: { id: circleId },
        data,
      })

      // update stripe product name
      if (data.name) {
        await paymentService.stripe.updateProduct({
          id: updatedCircle.providerProductId,
          name: data.name,
        })
      }

      // delete unused assets
      const unusedAssets = await atomService.findMany({
        table: 'asset',
        whereIn: ['id', unusedAssetIds],
      })
      await knex.transaction(async (trx) => {
        await trx('asset_map').whereIn('asset_id', unusedAssetIds).del()
        await trx('asset').whereIn('id', unusedAssetIds).del()
      })
      await Promise.all(
        unusedAssets.map((asset) => atomService.aws.baseDeleteFile(asset.path))
      )

      return updatedCircle
    }
  }
}

export default resolver
