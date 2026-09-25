import { createResourceController, createResourceRouter } from '../lib/resource.js'
import { authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { idParams } from '../validators/common.js'
import { sendData } from '../utils/respond.js'
import { farmers, farms, locations, suppliers } from '../services/sourcing.service.js'
import * as collections from '../services/collections.service.js'
import * as lots from '../services/lots.service.js'
import * as v from '../validators/sourcing.validators.js'

export const suppliersRouter = createResourceRouter({
  module: 'suppliers',
  ctrl: createResourceController(suppliers),
  schemas: { list: v.supplierList, create: v.supplierCreate, update: v.supplierUpdate },
})

export const farmersRouter = createResourceRouter({
  module: 'farmers',
  ctrl: createResourceController(farmers),
  schemas: { list: v.farmerList, create: v.farmerCreate, update: v.farmerUpdate },
})

// Farms are managed on the "Farms & Locations" page (locations module).
export const farmsRouter = createResourceRouter({
  module: 'locations',
  ctrl: createResourceController(farms),
  schemas: { list: v.farmList, create: v.farmCreate, update: v.farmUpdate },
})

export const locationsRouter = createResourceRouter({
  module: 'locations',
  ctrl: createResourceController(locations),
  schemas: { list: v.locationList, create: v.locationCreate, update: v.locationUpdate },
})

export const collectionsRouter = createResourceRouter({
  module: 'collection',
  ctrl: createResourceController(collections),
  schemas: { list: v.collectionList, create: v.collectionCreate, update: v.collectionUpdate },
  extend(router) {
    router.patch(
      '/:id/status',
      authorize('collection', 'update'),
      validate({ params: idParams, body: v.collectionStatusBody }),
      async (req, res) => {
        sendData(res, await collections.setStatus(req.auth.db, req.auth.role, req.valid.params.id, req.valid.body))
      }
    )
  },
})

export const lotsRouter = createResourceRouter({
  module: 'lots',
  writeRoles: ['field_officer'],
  ctrl: createResourceController(lots),
  schemas: { list: v.lotList, create: v.lotCreate, update: v.lotUpdate },
})
