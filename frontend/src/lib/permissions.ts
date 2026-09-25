/**
 * Role-Based Access Control (RBAC) definitions & permission helpers
 * for Waka Coffee.
 *
 * Supported Internal Employee Roles:
 * - super_admin
 * - admin
 * - sales
 * - field_officer (synonym: procurement)
 * - quality_officer (synonym: quality)
 * - warehouse_officer (synonym: warehouse)
 * - export_manager
 *
 * This matrix mirrors backend/src/config/permissions.js. It only decides what
 * the UI shows; the API and database RLS enforce the same rules.
 *
 * Public / non-IMS role:
 * - user
 *
 * Department responsibilities:
 *
 * SALES
 * - Customers
 * - Quote Requests
 * - Sample Requests
 * - Contact Messages
 * - Orders
 * - Products
 *
 * FIELD OFFICER / SOURCING
 * - Farmers
 * - Farms
 * - Locations
 * - Suppliers
 * - Collection
 * - Coffee Lots
 *
 * QUALITY OFFICER
 * - Quality
 * - Coffee Lots
 * - Traceability
 *
 * WAREHOUSE OFFICER
 * - Warehouses
 * - Inventory
 * - Inventory Transactions
 * - Coffee Lots
 * - Traceability
 *
 * EXPORT MANAGER
 * - Export Batches
 * - Shipments
 * - Documents
 * - Orders
 * - Customers
 * - Products
 * - Coffee Lots
 * - Traceability
 * - Reports
 *
 * ADMIN / SUPER ADMIN
 * - Full access to the IMS
 */

/**
 * All recognized application roles.
 *
 * "user" is kept for normal/public users,
 * but it is NOT included in ADMIN_ROLES and therefore
 * cannot access the internal IMS.
 */
export const ACTIVE_ROLES = [
  'super_admin',
  'admin',
  'sales',
  'export_manager',
  'field_officer',
  'quality_officer',
  'warehouse_officer',
  'procurement',
  'quality',
  'warehouse',
  'user',
] as const

export type AppRole = (typeof ACTIVE_ROLES)[number]

/**
 * Department synonyms stored in profiles.role. They carry exactly the same
 * permissions as the canonical role (same rule as the API and the database).
 */
const ROLE_ALIASES: Partial<Record<AppRole, AppRole>> = {
  procurement: 'field_officer',
  quality: 'quality_officer',
  warehouse: 'warehouse_officer',
}

export function canonicalRole(role: string | null | undefined): AppRole | null {
  if (!role) return null
  return (ROLE_ALIASES[role as AppRole] ?? role) as AppRole
}

/** Roles an administrator can assign to an employee account. */
export const EMPLOYEE_ROLES: AppRole[] = [
  'super_admin',
  'admin',
  'sales',
  'export_manager',
  'field_officer',
  'quality_officer',
  'warehouse_officer',
  'procurement',
  'quality',
  'warehouse',
]

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  sales: 'Sales',
  export_manager: 'Export Manager',
  field_officer: 'Field Officer',
  quality_officer: 'Quality Officer',
  warehouse_officer: 'Warehouse Officer',
  procurement: 'Procurement',
  quality: 'Quality',
  warehouse: 'Warehouse',
  user: 'Public user',
}

export function roleLabel(role: string | null | undefined): string {
  return role ? ROLE_LABELS[role as AppRole] ?? role.replace(/_/g, ' ') : 'No role'
}

/**
 * All modules available in the internal management system.
 */
export type AdminModule =
  | 'dashboard'
  | 'notifications'
  | 'products'
  | 'contact_messages'
  | 'users'
  | 'suppliers'
  | 'farmers'
  | 'locations'
  | 'collection'
  | 'lots'
  | 'quality'
  | 'warehouses'
  | 'inventory'
  | 'customers'
  | 'quote_requests'
  | 'sample_requests'
  | 'orders'
  | 'export_batches'
  | 'shipments'
  | 'documents'
  | 'reports'
  | 'traceability'
  | 'settings'

/**
 * Actions that can be performed on an IMS module.
 */
export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'

/**
 * All internal staff roles allowed to enter the /admin shell.
 *
 * IMPORTANT:
 * "user" is intentionally NOT included here.
 */
export const ADMIN_ROLES: AppRole[] = [
  'super_admin',
  'admin',
  'sales',
  'export_manager',
  'field_officer',
  'quality_officer',
  'warehouse_officer',
]

/**
 * Specific Module Access Matrix per Role.
 *
 * This controls FRONTEND module visibility/access.
 *
 * Database security is separately enforced by Supabase
 * Row Level Security (RLS).
 */
const MODULE_ACCESS: Record<AdminModule, AppRole[]> = {
  /**
   * ADMIN
   */
  // Every department has a dashboard; its content is filtered by role.
  dashboard: [
    'super_admin',
    'admin',
    'sales',
    'export_manager',
    'field_officer',
    'quality_officer',
    'warehouse_officer',
  ],

  notifications: ADMIN_ROLES,

  users: [
    'super_admin',
    'admin',
  ],

  settings: [
    'super_admin',
    'admin',
  ],

  /**
   * SALES
   */
  quote_requests: [
    'super_admin',
    'admin',
    'sales',
  ],

  sample_requests: [
    'super_admin',
    'admin',
    'sales',
  ],

  customers: [
    'super_admin',
    'admin',
    'sales',
    'export_manager',
  ],

  orders: [
    'super_admin',
    'admin',
    'sales',
    'export_manager',
  ],

  contact_messages: [
    'super_admin',
    'admin',
    'sales',
  ],

  /**
   * SHARED PRODUCT CATALOG
   */
  products: [
    'super_admin',
    'admin',
    'sales',
    'export_manager',
  ],

  /**
   * FIELD OFFICER / SOURCING
   */
  farmers: [
    'super_admin',
    'admin',
    'field_officer',
  ],

  suppliers: [
    'super_admin',
    'admin',
    'field_officer',
  ],

  locations: [
    'super_admin',
    'admin',
    'field_officer',
  ],

  collection: [
    'super_admin',
    'admin',
    'field_officer',
  ],

  /**
   * COFFEE LOTS
   *
   * Lots are shared operational data.
   * Different departments need access to the same lot records.
   */
  lots: [
    'super_admin',
    'admin',
    'field_officer',
    'quality_officer',
    'warehouse_officer',
    'export_manager',
  ],

  /**
   * QUALITY
   */
  quality: [
    'super_admin',
    'admin',
    'quality_officer',
  ],

  /**
   * WAREHOUSE
   */
  warehouses: [
    'super_admin',
    'admin',
    'warehouse_officer',
  ],

  inventory: [
    'super_admin',
    'admin',
    'warehouse_officer',
  ],

  /**
   * EXPORT + SHIPMENT
   */
  export_batches: [
    'super_admin',
    'admin',
    'export_manager',
  ],

  shipments: [
    'super_admin',
    'admin',
    'export_manager',
  ],

  documents: [
    'super_admin',
    'admin',
    'export_manager',
  ],

  /**
   * TRACEABILITY
   *
   * Multiple departments need to see the same
   * traceability information.
   */
  traceability: [
    'super_admin',
    'admin',
    'quality_officer',
    'warehouse_officer',
    'export_manager',
  ],

  /**
   * REPORTS
   */
  reports: [
    'super_admin',
    'admin',
    'export_manager',
  ],
}

/**
 * Default Landing Page per Role
 *
 * After authentication, each department is sent
 * to the first module relevant to its work.
 */
export function getRoleDefaultDashboard(
  role: string | null | undefined
): string {
  // Every employee lands on their role-specific dashboard.
  return canAccessModule(role, 'dashboard') ? '/admin' : '/admin/login'
}

/**
 * Check whether a value is a valid application role.
 */
export function isAppRole(
  value: string | null | undefined
): value is AppRole {
  if (!value) return false

  return (ACTIVE_ROLES as readonly string[]).includes(value)
}

/**
 * Check whether a role is an Admin-level role.
 *
 * Admin and Super Admin have full management permissions.
 */
export function isAdminRole(
  role: string | null | undefined
): boolean {
  return role === 'admin' || role === 'super_admin'
}

/** Employee (not the public "user" role). */
export function isEmployeeRole(role: string | null | undefined): boolean {
  return EMPLOYEE_ROLES.includes(role as AppRole)
}

/**
 * Check whether a role is included in an allowed role list.
 */
export function hasRole(
  role: string | null | undefined,
  allowed: AppRole | AppRole[]
): boolean {
  if (!role) return false

  const list = Array.isArray(allowed)
    ? allowed
    : [allowed]

  return list.includes(role as AppRole) || list.includes(canonicalRole(role) as AppRole)
}

/**
 * Check whether a role can access a specific IMS module.
 *
 * This is the FRONTEND permission check.
 * Supabase RLS remains responsible for database-level security.
 */
export function canAccessModule(
  role: string | null | undefined,
  module: AdminModule
): boolean {
  const allowed = MODULE_ACCESS[module] ?? ADMIN_ROLES

  return hasRole(role, allowed)
}

/**
 * Check whether a role can perform an action on a module.
 *
 * Current permission model:
 *
 * - view   -> allowed if the role can access the module
 * - create -> allowed if the role can access the module
 * - update -> allowed if the role can access the module
 * - delete -> Admin/Super Admin only
 *
 * This preserves the current working Admin delete behavior.
 *
 * IMPORTANT:
 * Actual database permissions are still controlled by
 * Supabase RLS policies.
 */
export function can(
  role: string | null | undefined,
  module: AdminModule,
  action: PermissionAction = 'view'
): boolean {
  /**
   * User must first have access to the module.
   */
  if (!canAccessModule(role, module)) {
    return false
  }

  /**
   * Only Admin and Super Admin can delete.
   */
  if (action === 'delete') {
    return isAdminRole(role)
  }

  /**
   * For view/create/update, module access is sufficient
   * at the frontend level.
   *
   * Supabase RLS provides the final database-level control.
   */
  return true
}
