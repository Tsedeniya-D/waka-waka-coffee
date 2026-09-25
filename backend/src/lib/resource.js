import { Router } from 'express'
import { authorize, requireRoles } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { idParams, idsBody } from '../validators/common.js'
import { compact, deleteMany, deleteOne, getById, insertOne, runList, updateOne } from './query.js'
import { sendData, sendList, sendNoContent } from '../utils/respond.js'

/**
 * Standard data access for a table. Every call uses the caller's
 * user-scoped client, so RLS applies on top of the route's RBAC check.
 *
 * @param {object} cfg
 * @param {string} cfg.table
 * @param {string} cfg.label           Human name, e.g. 'Farmer'
 * @param {string} [cfg.select]        Columns for single reads / writes
 * @param {string} [cfg.listSelect]    Columns for lists (defaults to select)
 * @param {string[]} [cfg.searchColumns]
 * @param {(q: any) => Record<string, any>} [cfg.filters] query -> equality filters
 * @param {string} [cfg.dateColumn]    column used by from/to filters
 * @param {(db, body, auth) => Promise<object>|object} [cfg.beforeCreate]
 * @param {(db, id, body, auth) => Promise<object>|object} [cfg.beforeUpdate]
 */
export function createResourceService(cfg) {
  const { table, label, select = '*', listSelect = select, searchColumns = [], filters = () => ({}) } = cfg

  return {
    list(db, q = {}) {
      return runList(
        db.from(table).select(listSelect, { count: 'exact' }),
        {
          ...q,
          eq: filters(q),
          searchColumns,
          range: cfg.dateColumn ? { column: cfg.dateColumn, from: q.from, to: q.to, dateOnly: cfg.dateOnly } : undefined,
        },
        `Loading ${label.toLowerCase()} list`
      )
    },
    get(db, id) {
      return getById(db, table, id, select, label)
    },
    async create(db, body, auth) {
      const values = cfg.beforeCreate ? await cfg.beforeCreate(db, body, auth) : body
      return insertOne(db, table, compact(values), select, label.toLowerCase())
    },
    async update(db, id, body, auth) {
      const values = cfg.beforeUpdate ? await cfg.beforeUpdate(db, id, body, auth) : body
      return updateOne(db, table, id, compact(values), select, label)
    },
    remove(db, id) {
      return deleteOne(db, table, id, label)
    },
    removeMany(db, ids) {
      return deleteMany(db, table, ids, `${label.toLowerCase()} records`)
    },
  }
}

/** Standard controller functions for a resource service. */
export function createResourceController(svc) {
  return {
    async list(req, res) {
      sendList(res, await svc.list(req.auth.db, req.valid.query))
    },
    async get(req, res) {
      sendData(res, await (svc.getDetail ?? svc.get)(req.auth.db, req.valid.params.id))
    },
    async create(req, res) {
      sendData(res, await svc.create(req.auth.db, req.valid.body, req.auth), 201)
    },
    async update(req, res) {
      sendData(res, await svc.update(req.auth.db, req.valid.params.id, req.valid.body, req.auth))
    },
    async remove(req, res) {
      await svc.remove(req.auth.db, req.valid.params.id)
      sendNoContent(res)
    },
    async removeMany(req, res) {
      const deleted = await svc.removeMany(req.auth.db, req.valid.body.ids)
      sendData(res, { deleted })
    },
  }
}

/**
 * Router with the standard REST endpoints.
 *   GET / · GET /:id · POST / · PATCH /:id · DELETE /:id · POST /bulk-delete
 * `extend(router)` registers extra endpoints BEFORE the /:id routes.
 * `writeRoles` (canonical roles) further restricts create/update.
 */
export function createResourceRouter({ module, ctrl, schemas, extend, allow = {}, writeRoles }) {
  const router = Router()
  // Shared modules (e.g. lots, customers) are readable by several departments
  // but writable by fewer; mirror the RLS write policies here.
  const canWrite = writeRoles ? requireRoles(...writeRoles, 'admin', 'super_admin') : (_req, _res, next) => next()
  const {
    list: listSchema,
    create: createSchema,
    update: updateSchema,
  } = schemas
  const enabled = { create: true, update: true, remove: true, bulkDelete: false, ...allow }

  if (extend) extend(router)

  router.get('/', authorize(module), validate({ query: listSchema }), ctrl.list)
  if (enabled.create) router.post('/', authorize(module, 'create'), canWrite, validate({ body: createSchema }), ctrl.create)
  if (enabled.bulkDelete) {
    router.post('/bulk-delete', authorize(module, 'delete'), validate({ body: idsBody }), ctrl.removeMany)
  }
  router.get('/:id', authorize(module), validate({ params: idParams }), ctrl.get)
  if (enabled.update) {
    router.patch('/:id', authorize(module, 'update'), canWrite, validate({ params: idParams, body: updateSchema }), ctrl.update)
  }
  if (enabled.remove) router.delete('/:id', authorize(module, 'delete'), validate({ params: idParams }), ctrl.remove)
  return router
}
