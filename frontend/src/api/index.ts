/**
 * Typed wrappers for every Express API endpoint (see backend/src/routes).
 * Pages use these through the TanStack Query hooks in src/queries.
 */
import { api } from '../lib/api'
import type {
  ActivityLog,
  AuthPayload,
  AvailableStock,
  BatchStatus,
  Category,
  CoffeeLot,
  CoffeeLotDetail,
  CoffeeRegion,
  CollectionDetail,
  CollectionRecord,
  ContactMessage,
  Customer,
  CustomerDetail,
  DashboardPayload,
  Document,
  EligibleBatch,
  EligibleOrder,
  ExportBatch,
  ExportBatchDetail,
  Farm,
  Farmer,
  FarmerDetail,
  InventoryDetail,
  InventoryItem,
  InventoryTransaction,
  ListParams,
  Location,
  MePayload,
  NewsletterSubscriber,
  Notification,
  OrderStatus,
  PersonRef,
  Product,
  Profile,
  QualityInspection,
  QuoteItem,
  QuoteRequest,
  QuoteRequestDetail,
  QuoteStatus,
  ReceivableLot,
  ReportSummary,
  SalesOrder,
  SalesOrderDetail,
  SampleRequest,
  SampleRequestDetail,
  SampleStatus,
  Shipment,
  ShipmentDetail,
  ShipmentStatus,
  SubmissionResult,
  Supplier,
  SupplierDetail,
  TraceLot,
  TraceOverviewRow,
  TraceSearchHit,
  TraceShipment,
  UserRole,
  Warehouse,
  WarehouseDetail,
  WorkflowRules,
} from '../types'

type Body = Record<string, unknown>
const enc = encodeURIComponent

// --- auth ------------------------------------------------------------------------
export const authApi = {
  login: (email: string, password: string) => api.post<AuthPayload>('/auth/login', { email, password }, { auth: false }),
  me: () => api.get<MePayload>('/auth/me'),
  logout: () => api.post<void>('/auth/logout'),
  updateMe: (body: { full_name: string; phone?: string | null; job_title?: string | null }) => api.patch<Profile>('/auth/me', body),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ message: string }>('/auth/change-password', { current_password, new_password }),
  completeReset: (new_password: string) => api.post<{ message: string }>('/auth/reset-password', { new_password }),
  requestReset: (email: string, redirect_to?: string) =>
    api.post<{ message: string }>('/auth/password-reset', { email, redirect_to }, { auth: false }),
  workflows: () => api.get<WorkflowRules>('/auth/workflows'),
}

// --- public website -----------------------------------------------------------------
export const publicApi = {
  submitQuote: (body: Body) => api.post<SubmissionResult>('/public/quote-requests', body, { auth: false }),
  submitSample: (body: Body) => api.post<SubmissionResult>('/public/sample-requests', body, { auth: false }),
  submitContact: (body: Body) => api.post<{ received: boolean }>('/public/contact-messages', body, { auth: false }),
  subscribe: (email: string, source = 'website') =>
    api.post<{ status: 'subscribed' | 'already_subscribed' | 'resubscribed' }>('/public/newsletter', { email, source }, { auth: false }),
  products: (featured?: boolean) => api.get<Product[]>('/public/products', featured ? { featured: 'true' } : undefined, { auth: false }),
  product: (slug: string) => api.get<Product>(`/public/products/${enc(slug)}`, undefined, { auth: false }),
}

// --- users --------------------------------------------------------------------------
export const usersApi = {
  list: (q?: ListParams) => api.list<Profile>('/users', q),
  get: (id: string) => api.get<Profile>(`/users/${id}`),
  directory: (roles?: UserRole[]) => api.get<PersonRef[]>('/users/directory', roles?.length ? { role: roles.join(',') } : undefined),
  create: (body: Body) => api.post<Profile>('/users', body),
  update: (id: string, body: Body) => api.patch<Profile>(`/users/${id}`, body),
  setRole: (id: string, role: UserRole) => api.patch<Profile>(`/users/${id}/role`, { role }),
  setActive: (id: string, is_active: boolean) => api.patch<Profile>(`/users/${id}/status`, { is_active }),
  sendPasswordReset: (id: string) => api.post<{ message: string }>(`/users/${id}/password-reset`),
}

// --- catalog ------------------------------------------------------------------------
export const productsApi = {
  list: (q?: ListParams) => api.list<Product>('/products', q),
  get: (id: string) => api.get<Product>(`/products/${id}`),
  create: (body: Body) => api.post<Product>('/products', body),
  update: (id: string, body: Body) => api.patch<Product>(`/products/${id}`, body),
  publish: (id: string, is_active: boolean) => api.patch<Product>(`/products/${id}/publish`, { is_active }),
  feature: (id: string, is_featured: boolean) => api.patch<Product>(`/products/${id}/feature`, { is_featured }),
  archive: (id: string, is_archived: boolean) => api.patch<Product>(`/products/${id}/archive`, { is_archived }),
  remove: (id: string) => api.delete(`/products/${id}`),
  addImage: (id: string, file: File, opts: { alt_text?: string; is_primary?: boolean } = {}) => {
    const form = new FormData()
    form.append('file', file)
    if (opts.alt_text) form.append('alt_text', opts.alt_text)
    if (opts.is_primary) form.append('is_primary', 'true')
    return api.upload<Product>(`/products/${id}/images`, form)
  },
  updateImage: (id: string, imageId: string, body: Body) => api.patch<Product>(`/products/${id}/images/${imageId}`, body),
  removeImage: (id: string, imageId: string) => api.delete<Product>(`/products/${id}/images/${imageId}`),
}
export const categoriesApi = {
  list: (q?: ListParams) => api.list<Category>('/categories', q),
  create: (body: Body) => api.post<Category>('/categories', body),
  update: (id: string, body: Body) => api.patch<Category>(`/categories/${id}`, body),
  remove: (id: string) => api.delete(`/categories/${id}`),
}
export const regionsApi = {
  list: (q?: ListParams) => api.list<CoffeeRegion>('/coffee-regions', q),
  create: (body: Body) => api.post<CoffeeRegion>('/coffee-regions', body),
  update: (id: string, body: Body) => api.patch<CoffeeRegion>(`/coffee-regions/${id}`, body),
  remove: (id: string) => api.delete(`/coffee-regions/${id}`),
}

// --- sales --------------------------------------------------------------------------
export const customersApi = {
  list: (q?: ListParams) => api.list<Customer>('/customers', q),
  get: (id: string) => api.get<CustomerDetail>(`/customers/${id}`),
  create: (body: Body) => api.post<CustomerDetail>('/customers', body),
  update: (id: string, body: Body) => api.patch<CustomerDetail>(`/customers/${id}`, body),
  remove: (id: string) => api.delete(`/customers/${id}`),
  bulkRemove: (ids: string[]) => api.post<{ deleted: string[] }>('/customers/bulk-delete', { ids }),
}

export const quotesApi = {
  list: (q?: ListParams) => api.list<QuoteRequest>('/quote-requests', q),
  get: (id: string) => api.get<QuoteRequestDetail>(`/quote-requests/${id}`),
  create: (body: Body) => api.post<QuoteRequestDetail>('/quote-requests', body),
  update: (id: string, body: Body) => api.patch<QuoteRequestDetail>(`/quote-requests/${id}`, body),
  setStatus: (id: string, status: QuoteStatus, reason?: string) =>
    api.patch<QuoteRequestDetail>(`/quote-requests/${id}/status`, { status, reason }),
  assign: (id: string, assigned_to: string | null) => api.patch<QuoteRequestDetail>(`/quote-requests/${id}/assign`, { assigned_to }),
  linkCustomer: (id: string) => api.post<QuoteRequestDetail>(`/quote-requests/${id}/link-customer`),
  convert: (id: string) => api.post<SalesOrder>(`/quote-requests/${id}/convert`),
  addItem: (id: string, body: Body) => api.post<QuoteRequestDetail>(`/quote-requests/${id}/items`, body),
  updateItem: (id: string, itemId: string, body: Partial<QuoteItem>) =>
    api.patch<QuoteRequestDetail>(`/quote-requests/${id}/items/${itemId}`, body),
  removeItem: (id: string, itemId: string) => api.delete<QuoteRequestDetail>(`/quote-requests/${id}/items/${itemId}`),
  remove: (id: string) => api.delete(`/quote-requests/${id}`),
  bulkRemove: (ids: string[]) => api.post<{ deleted: string[]; skipped: string[] }>('/quote-requests/bulk-delete', { ids }),
}

export const samplesApi = {
  list: (q?: ListParams) => api.list<SampleRequest>('/sample-requests', q),
  get: (id: string) => api.get<SampleRequestDetail>(`/sample-requests/${id}`),
  create: (body: Body) => api.post<SampleRequestDetail>('/sample-requests', body),
  update: (id: string, body: Body) => api.patch<SampleRequestDetail>(`/sample-requests/${id}`, body),
  setStatus: (id: string, body: { status: SampleStatus; reason?: string; courier?: string; tracking_number?: string }) =>
    api.patch<SampleRequestDetail>(`/sample-requests/${id}/status`, body),
  assign: (id: string, assigned_to: string | null) => api.patch<SampleRequestDetail>(`/sample-requests/${id}/assign`, { assigned_to }),
  linkCustomer: (id: string) => api.post<SampleRequestDetail>(`/sample-requests/${id}/link-customer`),
  remove: (id: string) => api.delete(`/sample-requests/${id}`),
  bulkRemove: (ids: string[]) => api.post<{ deleted: string[] }>('/sample-requests/bulk-delete', { ids }),
}

export const contactsApi = {
  list: (q?: ListParams) => api.list<ContactMessage>('/contact-messages', q),
  get: (id: string) => api.get<ContactMessage>(`/contact-messages/${id}`),
  update: (id: string, body: Body) => api.patch<ContactMessage>(`/contact-messages/${id}`, body),
  remove: (id: string) => api.delete(`/contact-messages/${id}`),
}

export const newsletterApi = {
  list: (q?: ListParams) => api.list<NewsletterSubscriber>('/newsletter-subscribers', q),
  setActive: (id: string, is_active: boolean) => api.patch<NewsletterSubscriber>(`/newsletter-subscribers/${id}`, { is_active }),
  remove: (id: string) => api.delete(`/newsletter-subscribers/${id}`),
}

export const ordersApi = {
  list: (q?: ListParams) => api.list<SalesOrder>('/sales-orders', q),
  get: (id: string) => api.get<SalesOrderDetail>(`/sales-orders/${id}`),
  create: (body: Body) => api.post<SalesOrderDetail>('/sales-orders', body),
  update: (id: string, body: Body) => api.patch<SalesOrderDetail>(`/sales-orders/${id}`, body),
  setStatus: (id: string, status: OrderStatus, reason?: string) =>
    api.patch<SalesOrderDetail>(`/sales-orders/${id}/status`, { status, reason }),
  sendToExport: (id: string) => api.post<SalesOrderDetail>(`/sales-orders/${id}/send-to-export`),
  accept: (id: string) => api.post<SalesOrderDetail>(`/sales-orders/${id}/accept`),
  addItem: (id: string, body: Body) => api.post<SalesOrderDetail>(`/sales-orders/${id}/items`, body),
  updateItem: (id: string, itemId: string, body: Body) => api.patch<SalesOrderDetail>(`/sales-orders/${id}/items/${itemId}`, body),
  removeItem: (id: string, itemId: string) => api.delete<SalesOrderDetail>(`/sales-orders/${id}/items/${itemId}`),
  remove: (id: string) => api.delete(`/sales-orders/${id}`),
}

// --- sourcing -----------------------------------------------------------------------
function crud<T, D = T>(base: string) {
  return {
    list: (q?: ListParams) => api.list<T>(base, q),
    get: (id: string) => api.get<D>(`${base}/${id}`),
    create: (body: Body) => api.post<D>(base, body),
    update: (id: string, body: Body) => api.patch<D>(`${base}/${id}`, body),
    remove: (id: string) => api.delete(`${base}/${id}`),
  }
}

export const suppliersApi = crud<Supplier, SupplierDetail>('/suppliers')
export const farmersApi = crud<Farmer, FarmerDetail>('/farmers')
export const farmsApi = crud<Farm>('/farms')
export const locationsApi = crud<Location>('/locations')
export const collectionsApi = {
  ...crud<CollectionRecord, CollectionDetail>('/collections'),
  setStatus: (id: string, status: 'submitted' | 'verified' | 'rejected', reason?: string) =>
    api.patch<CollectionDetail>(`/collections/${id}/status`, { status, reason }),
}
export const lotsApi = crud<CoffeeLot, CoffeeLotDetail>('/lots')

// --- quality, warehouses, inventory ------------------------------------------------------
export const qualityApi = {
  ...crud<QualityInspection>('/quality-inspections'),
  decide: (id: string, decision: 'approved' | 'rejected', notes?: string) =>
    api.post<QualityInspection>(`/quality-inspections/${id}/decision`, { decision, notes }),
  reopen: (id: string) => api.post<QualityInspection>(`/quality-inspections/${id}/reopen`),
  bulkRemove: (ids: string[]) => api.post<{ deleted: string[] }>('/quality-inspections/bulk-delete', { ids }),
}

export const warehousesApi = crud<Warehouse, WarehouseDetail>('/warehouses')

export const inventoryApi = {
  list: (q?: ListParams) => api.list<InventoryItem>('/inventory', q),
  get: (id: string) => api.get<InventoryDetail>(`/inventory/${id}`),
  transactions: (q?: ListParams) => api.list<InventoryTransaction>('/inventory/transactions', q),
  receivableLots: () => api.get<ReceivableLot[]>('/inventory/receivable-lots'),
  receive: (body: Body) => api.post<InventoryDetail>('/inventory/receive', body),
  updateDetails: (id: string, body: Body) => api.patch<InventoryDetail>(`/inventory/${id}`, body),
  adjust: (id: string, delta_kg: number, reason: string) => api.post<InventoryDetail>(`/inventory/${id}/adjust`, { delta_kg, reason }),
  issue: (id: string, body: { quantity_kg: number; reason: string; reference_type?: string; reference_id?: string }) =>
    api.post<InventoryDetail>(`/inventory/${id}/issue`, body),
  transfer: (id: string, body: { to_warehouse_id: string; quantity_kg: number; notes?: string }) =>
    api.post<{ from: InventoryDetail; to: InventoryDetail }>(`/inventory/${id}/transfer`, body),
}

// --- export ----------------------------------------------------------------------------
export const batchesApi = {
  list: (q?: ListParams) => api.list<ExportBatch>('/export-batches', q),
  get: (id: string) => api.get<ExportBatchDetail>(`/export-batches/${id}`),
  eligibleOrders: () => api.get<EligibleOrder[]>('/export-batches/eligible-orders'),
  availableStock: (q?: { origin?: string; grade?: string; search?: string }) => api.get<AvailableStock[]>('/export-batches/available-stock', q),
  create: (body: { sales_order_id: string; allocations: { lot_id: string; warehouse_id: string; quantity_kg: number }[]; notes?: string }) =>
    api.post<ExportBatchDetail>('/export-batches', body),
  update: (id: string, body: { notes: string | null }) => api.patch<ExportBatchDetail>(`/export-batches/${id}`, body),
  setStatus: (id: string, status: Extract<BatchStatus, 'preparing' | 'ready' | 'approved' | 'cancelled'>, reason?: string) =>
    api.patch<ExportBatchDetail>(`/export-batches/${id}/status`, { status, reason }),
}

export const shipmentsApi = {
  list: (q?: ListParams) => api.list<Shipment>('/shipments', q),
  get: (id: string) => api.get<ShipmentDetail>(`/shipments/${id}`),
  eligibleBatches: () => api.get<EligibleBatch[]>('/shipments/eligible-batches'),
  create: (body: Body) => api.post<ShipmentDetail>('/shipments', body),
  update: (id: string, body: Body) => api.patch<ShipmentDetail>(`/shipments/${id}`, body),
  setStatus: (id: string, status: ShipmentStatus, extra: { location?: string; note?: string } = {}) =>
    api.patch<ShipmentDetail>(`/shipments/${id}/status`, { status, ...extra }),
  addUpdate: (id: string, body: { description: string; location?: string; event_time?: string }) =>
    api.post<ShipmentDetail>(`/shipments/${id}/updates`, body),
  remove: (id: string) => api.delete(`/shipments/${id}`),
}

// --- documents ------------------------------------------------------------------------
export interface DocumentInput {
  title: string
  document_type: string
  related_type: string
  related_id?: string | null
  is_public?: boolean
  notes?: string
  file?: File | null
  file_url?: string
}
export const documentsApi = {
  list: (q?: ListParams) => api.list<Document>('/documents', q),
  get: (id: string) => api.get<Document>(`/documents/${id}`),
  create: (input: DocumentInput) => {
    const form = new FormData()
    form.append('title', input.title)
    form.append('document_type', input.document_type)
    form.append('related_type', input.related_type)
    if (input.related_id) form.append('related_id', input.related_id)
    form.append('is_public', String(Boolean(input.is_public)))
    if (input.notes) form.append('notes', input.notes)
    if (input.file) form.append('file', input.file)
    else if (input.file_url) form.append('file_url', input.file_url)
    return api.upload<Document>('/documents', form)
  },
  update: (id: string, body: Body) => api.patch<Document>(`/documents/${id}`, body),
  remove: (id: string) => api.delete(`/documents/${id}`),
  download: (id: string) => api.get<{ url: string; expires_in?: number; external: boolean }>(`/documents/${id}/download`),
}

// --- insights ---------------------------------------------------------------------------
export const traceabilityApi = {
  overview: (q?: { search?: string; page?: number; limit?: number }) => api.list<TraceOverviewRow>('/traceability', q),
  search: (q: string) => api.get<TraceSearchHit[]>('/traceability/search', { q }),
  lot: (id: string) => api.get<TraceLot>(`/traceability/lots/${id}`),
  shipment: (id: string) => api.get<TraceShipment>(`/traceability/shipments/${id}`),
}

export const notificationsApi = {
  list: (q?: ListParams & { filter?: 'all' | 'unread' | 'read'; type?: string }) => api.list<Notification>('/notifications', q),
  unreadCount: () => api.get<{ unread: number }>('/notifications/unread-count'),
  setRead: (id: string, is_read: boolean) => api.patch<Notification>(`/notifications/${id}`, { is_read }),
  markAllRead: () => api.post<{ updated: number }>('/notifications/read-all'),
  remove: (id: string) => api.delete(`/notifications/${id}`),
  broadcast: (body: { title: string; message: string; roles?: UserRole[]; user_ids?: string[] }) =>
    api.post<{ sent: number }>('/notifications/broadcast', body),
}

export const reportsApi = {
  summary: (q?: { from?: string; to?: string }) => api.get<ReportSummary>('/reports/summary', q),
}

export const dashboardApi = {
  get: () => api.get<DashboardPayload>('/dashboard'),
}

export const activityApi = {
  list: (q?: ListParams) => api.list<ActivityLog>('/activity-logs', q),
}
