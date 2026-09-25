/**
 * Role-based access control, mirroring frontend/src/lib/permissions.ts
 * (MODULE_ACCESS) so the API and the UI agree on who can do what.
 *
 * The database (RLS + admin user creation) also knows three department
 * synonyms: procurement, quality, warehouse. RLS treats them the same as
 * field_officer, quality_officer and warehouse_officer, so the API does too.
 */

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  SALES: 'sales',
  EXPORT_MANAGER: 'export_manager',
  FIELD_OFFICER: 'field_officer',
  QUALITY_OFFICER: 'quality_officer',
  WAREHOUSE_OFFICER: 'warehouse_officer',
  PROCUREMENT: 'procurement',
  QUALITY: 'quality',
  WAREHOUSE: 'warehouse',
  USER: 'user',
})

/** Synonym -> canonical role used by the permission matrix. */
const ROLE_ALIASES = Object.freeze({
  procurement: ROLES.FIELD_OFFICER,
  quality: ROLES.QUALITY_OFFICER,
  warehouse: ROLES.WAREHOUSE_OFFICER,
})

/** Roles that may be assigned to an employee account. */
export const EMPLOYEE_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.SALES,
  ROLES.EXPORT_MANAGER,
  ROLES.FIELD_OFFICER,
  ROLES.QUALITY_OFFICER,
  ROLES.WAREHOUSE_OFFICER,
  ROLES.PROCUREMENT,
  ROLES.QUALITY,
  ROLES.WAREHOUSE,
])

export const ADMIN_ROLES = Object.freeze([ROLES.SUPER_ADMIN, ROLES.ADMIN])

/** Normalise a stored role to its canonical permission role. */
export function canonicalRole(role) {
  if (!role) return null
  return ROLE_ALIASES[role] ?? role
}

export function isEmployeeRole(role) {
  return EMPLOYEE_ROLES.includes(role)
}

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(canonicalRole(role))
}

const A = ADMIN_ROLES
const STAFF = [
  ...A,
  ROLES.SALES,
  ROLES.EXPORT_MANAGER,
  ROLES.FIELD_OFFICER,
  ROLES.QUALITY_OFFICER,
  ROLES.WAREHOUSE_OFFICER,
]

/** Module -> canonical roles allowed to access it. Same as the frontend matrix. */
export const MODULE_ACCESS = Object.freeze({
  // Every department gets a dashboard; its content is filtered by role
  // (see dashboard_summary() in the database).
  dashboard: STAFF,
  notifications: STAFF,
  users: [...A],
  settings: [...A],

  quote_requests: [...A, ROLES.SALES],
  sample_requests: [...A, ROLES.SALES],
  contact_messages: [...A, ROLES.SALES],
  customers: [...A, ROLES.SALES, ROLES.EXPORT_MANAGER],
  orders: [...A, ROLES.SALES, ROLES.EXPORT_MANAGER],
  products: [...A, ROLES.SALES, ROLES.EXPORT_MANAGER],

  farmers: [...A, ROLES.FIELD_OFFICER],
  suppliers: [...A, ROLES.FIELD_OFFICER],
  locations: [...A, ROLES.FIELD_OFFICER],
  collection: [...A, ROLES.FIELD_OFFICER],
  lots: [
    ...A,
    ROLES.FIELD_OFFICER,
    ROLES.QUALITY_OFFICER,
    ROLES.WAREHOUSE_OFFICER,
    ROLES.EXPORT_MANAGER,
  ],

  quality: [...A, ROLES.QUALITY_OFFICER],
  warehouses: [...A, ROLES.WAREHOUSE_OFFICER],
  inventory: [...A, ROLES.WAREHOUSE_OFFICER],

  export_batches: [...A, ROLES.EXPORT_MANAGER],
  shipments: [...A, ROLES.EXPORT_MANAGER],
  documents: [...A, ROLES.EXPORT_MANAGER],

  traceability: [...A, ROLES.QUALITY_OFFICER, ROLES.WAREHOUSE_OFFICER, ROLES.EXPORT_MANAGER],
  reports: [...A, ROLES.EXPORT_MANAGER],
})

/**
 * @param {string|null|undefined} role Role as stored in profiles.role
 * @param {keyof typeof MODULE_ACCESS} module
 */
export function canAccessModule(role, module) {
  const allowed = MODULE_ACCESS[module]
  if (!allowed) return false
  return allowed.includes(canonicalRole(role))
}

/**
 * Same rules as the frontend `can()`: view/create/update need module access,
 * delete additionally needs an admin role.
 *
 * @param {string|null|undefined} role
 * @param {keyof typeof MODULE_ACCESS} module
 * @param {'view'|'create'|'update'|'delete'} [action]
 */
export function can(role, module, action = 'view') {
  if (!canAccessModule(role, module)) return false
  if (action === 'delete') return isAdminRole(role)
  return true
}

/** Modules the role can open, used by GET /auth/me so the UI can build menus. */
export function modulesForRole(role) {
  return Object.keys(MODULE_ACCESS).filter((m) => canAccessModule(role, m))
}
