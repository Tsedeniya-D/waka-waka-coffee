/**
 * TanStack Query hooks for the internal management system. Every query and
 * mutation goes through the Express API (src/api). Mutations invalidate the
 * lists/details they affect so the UI updates immediately.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  activityApi,
  authApi,
  batchesApi,
  categoriesApi,
  collectionsApi,
  contactsApi,
  customersApi,
  dashboardApi,
  documentsApi,
  farmersApi,
  farmsApi,
  inventoryApi,
  locationsApi,
  lotsApi,
  newsletterApi,
  notificationsApi,
  ordersApi,
  productsApi,
  qualityApi,
  quotesApi,
  regionsApi,
  reportsApi,
  samplesApi,
  shipmentsApi,
  suppliersApi,
  traceabilityApi,
  usersApi,
  warehousesApi,
} from '../api'
import type { ListParams, UserRole, WorkflowEntity } from '../types'
import { useAuth } from '../contexts/AuthContext'

/** Query keys: [domain, ...args]. Invalidating [domain] refreshes everything in it. */
export const qk = {
  me: ['me'] as const,
  workflows: ['workflows'] as const,
  dashboard: ['dashboard'] as const,
  users: ['users'] as const,
  directory: ['directory'] as const,
  products: ['products'] as const,
  categories: ['categories'] as const,
  regions: ['coffee-regions'] as const,
  customers: ['customers'] as const,
  quotes: ['quote-requests'] as const,
  samples: ['sample-requests'] as const,
  contacts: ['contact-messages'] as const,
  newsletter: ['newsletter'] as const,
  orders: ['sales-orders'] as const,
  suppliers: ['suppliers'] as const,
  farmers: ['farmers'] as const,
  farms: ['farms'] as const,
  locations: ['locations'] as const,
  collections: ['collections'] as const,
  lots: ['lots'] as const,
  quality: ['quality-inspections'] as const,
  warehouses: ['warehouses'] as const,
  inventory: ['inventory'] as const,
  batches: ['export-batches'] as const,
  shipments: ['shipments'] as const,
  documents: ['documents'] as const,
  traceability: ['traceability'] as const,
  notifications: ['notifications'] as const,
  reports: ['reports'] as const,
  activity: ['activity'] as const,
}

/** useMutation that invalidates the given domains on success. */
export function useApiMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>, invalidate: QueryKey[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })))
    },
  })
}

const listOpts = { placeholderData: keepPreviousData, staleTime: 15_000 }
const enabledId = (id?: string | null) => Boolean(id)

// -----------------------------------------------------------------------------
// Auth / workflow rules
// -----------------------------------------------------------------------------
export function useWorkflows() {
  const { isAuthenticated } = useAuth()
  return useQuery({ queryKey: qk.workflows, queryFn: authApi.workflows, enabled: isAuthenticated, staleTime: 5 * 60_000 })
}

/** Status options the current user may choose from `from` (drives status menus). */
export function useNextStatuses(entity: WorkflowEntity, from: string | null | undefined) {
  const { data } = useWorkflows()
  if (!from || !data) return []
  return (data[entity] ?? []).filter((t) => t.from_status === from && t.allowed)
}

// -----------------------------------------------------------------------------
// Dashboard, notifications, reports, activity, traceability
// -----------------------------------------------------------------------------
export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: dashboardApi.get, staleTime: 30_000 })

export const useNotifications = (params: Parameters<typeof notificationsApi.list>[0] = {}) =>
  useQuery({ queryKey: [...qk.notifications, 'list', params], queryFn: () => notificationsApi.list(params), ...listOpts })

export function useUnreadCount() {
  const { isAuthenticated, canAccess } = useAuth()
  return useQuery({
    queryKey: [...qk.notifications, 'unread'],
    queryFn: notificationsApi.unreadCount,
    enabled: isAuthenticated && canAccess('notifications'),
    refetchInterval: 60_000,
  })
}

export const useNotificationActions = () => ({
  setRead: useApiMutation((v: { id: string; is_read: boolean }) => notificationsApi.setRead(v.id, v.is_read), [qk.notifications, qk.dashboard]),
  markAllRead: useApiMutation(() => notificationsApi.markAllRead(), [qk.notifications, qk.dashboard]),
  remove: useApiMutation((id: string) => notificationsApi.remove(id), [qk.notifications, qk.dashboard]),
  broadcast: useApiMutation(
    (v: { title: string; message: string; roles?: UserRole[]; user_ids?: string[] }) => notificationsApi.broadcast(v),
    [qk.notifications]
  ),
})

export const useReportSummary = (range: { from?: string; to?: string }) =>
  useQuery({ queryKey: [...qk.reports, range], queryFn: () => reportsApi.summary(range), ...listOpts })

export const useActivity = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.activity, params], queryFn: () => activityApi.list(params), ...listOpts })

export const useTraceOverview = (params: { search?: string; page?: number; limit?: number }) =>
  useQuery({ queryKey: [...qk.traceability, 'overview', params], queryFn: () => traceabilityApi.overview(params), ...listOpts })
export const useTraceSearch = (q: string) =>
  useQuery({ queryKey: [...qk.traceability, 'search', q], queryFn: () => traceabilityApi.search(q), enabled: q.trim().length >= 2 })
export const useTraceLot = (id?: string | null) =>
  useQuery({ queryKey: [...qk.traceability, 'lot', id], queryFn: () => traceabilityApi.lot(id!), enabled: enabledId(id) })
export const useTraceShipment = (id?: string | null) =>
  useQuery({ queryKey: [...qk.traceability, 'shipment', id], queryFn: () => traceabilityApi.shipment(id!), enabled: enabledId(id) })

// -----------------------------------------------------------------------------
// Users
// -----------------------------------------------------------------------------
export const useUsers = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.users, params], queryFn: () => usersApi.list(params), ...listOpts })
export const useDirectory = (roles?: UserRole[]) =>
  useQuery({ queryKey: [...qk.directory, roles ?? []], queryFn: () => usersApi.directory(roles), staleTime: 5 * 60_000 })
export const useUserActions = () => ({
  create: useApiMutation((body: Record<string, unknown>) => usersApi.create(body), [qk.users, qk.directory]),
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => usersApi.update(v.id, v.body), [qk.users, qk.directory]),
  setRole: useApiMutation((v: { id: string; role: UserRole }) => usersApi.setRole(v.id, v.role), [qk.users, qk.directory]),
  setActive: useApiMutation((v: { id: string; is_active: boolean }) => usersApi.setActive(v.id, v.is_active), [qk.users, qk.directory]),
  sendPasswordReset: useApiMutation((id: string) => usersApi.sendPasswordReset(id), []),
})

// -----------------------------------------------------------------------------
// Catalog
// -----------------------------------------------------------------------------
export const useProductsAdmin = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.products, params], queryFn: () => productsApi.list(params), ...listOpts })
export const useProductAdmin = (id?: string | null) =>
  useQuery({ queryKey: [...qk.products, 'detail', id], queryFn: () => productsApi.get(id!), enabled: enabledId(id) })
export const useProductActions = () => ({
  create: useApiMutation((body: Record<string, unknown>) => productsApi.create(body), [qk.products]),
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => productsApi.update(v.id, v.body), [qk.products]),
  publish: useApiMutation((v: { id: string; is_active: boolean }) => productsApi.publish(v.id, v.is_active), [qk.products]),
  feature: useApiMutation((v: { id: string; is_featured: boolean }) => productsApi.feature(v.id, v.is_featured), [qk.products]),
  archive: useApiMutation((v: { id: string; is_archived: boolean }) => productsApi.archive(v.id, v.is_archived), [qk.products]),
  remove: useApiMutation((id: string) => productsApi.remove(id), [qk.products]),
  addImage: useApiMutation(
    (v: { id: string; file: File; alt_text?: string; is_primary?: boolean }) =>
      productsApi.addImage(v.id, v.file, { alt_text: v.alt_text, is_primary: v.is_primary }),
    [qk.products]
  ),
  updateImage: useApiMutation(
    (v: { id: string; imageId: string; body: Record<string, unknown> }) => productsApi.updateImage(v.id, v.imageId, v.body),
    [qk.products]
  ),
  removeImage: useApiMutation((v: { id: string; imageId: string }) => productsApi.removeImage(v.id, v.imageId), [qk.products]),
})
export const useCategoriesAdmin = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.categories, params], queryFn: () => categoriesApi.list(params), ...listOpts })
export const useRegionsAdmin = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.regions, params], queryFn: () => regionsApi.list(params), ...listOpts })
export const useTaxonomyActions = () => ({
  createCategory: useApiMutation((body: Record<string, unknown>) => categoriesApi.create(body), [qk.categories]),
  updateCategory: useApiMutation((v: { id: string; body: Record<string, unknown> }) => categoriesApi.update(v.id, v.body), [qk.categories]),
  removeCategory: useApiMutation((id: string) => categoriesApi.remove(id), [qk.categories]),
  createRegion: useApiMutation((body: Record<string, unknown>) => regionsApi.create(body), [qk.regions]),
  updateRegion: useApiMutation((v: { id: string; body: Record<string, unknown> }) => regionsApi.update(v.id, v.body), [qk.regions]),
  removeRegion: useApiMutation((id: string) => regionsApi.remove(id), [qk.regions]),
})

// -----------------------------------------------------------------------------
// Sales: customers, quotes, samples, contacts, newsletter, orders
// -----------------------------------------------------------------------------
export const useCustomers = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.customers, params], queryFn: () => customersApi.list(params), ...listOpts })
export const useCustomer = (id?: string | null) =>
  useQuery({ queryKey: [...qk.customers, 'detail', id], queryFn: () => customersApi.get(id!), enabled: enabledId(id) })
export const useCustomerActions = () => ({
  create: useApiMutation((body: Record<string, unknown>) => customersApi.create(body), [qk.customers, qk.dashboard]),
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => customersApi.update(v.id, v.body), [qk.customers]),
  remove: useApiMutation((id: string) => customersApi.remove(id), [qk.customers, qk.dashboard]),
  bulkRemove: useApiMutation((ids: string[]) => customersApi.bulkRemove(ids), [qk.customers, qk.dashboard]),
})

const quoteKeys = [qk.quotes, qk.dashboard, qk.customers]
export const useQuoteRequests = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.quotes, params], queryFn: () => quotesApi.list(params), ...listOpts })
export const useQuoteRequest = (id?: string | null) =>
  useQuery({ queryKey: [...qk.quotes, 'detail', id], queryFn: () => quotesApi.get(id!), enabled: enabledId(id) })
export const useQuoteActions = () => ({
  create: useApiMutation((body: Record<string, unknown>) => quotesApi.create(body), quoteKeys),
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => quotesApi.update(v.id, v.body), quoteKeys),
  setStatus: useApiMutation(
    (v: { id: string; status: Parameters<typeof quotesApi.setStatus>[1]; reason?: string }) => quotesApi.setStatus(v.id, v.status, v.reason),
    quoteKeys
  ),
  assign: useApiMutation((v: { id: string; assigned_to: string | null }) => quotesApi.assign(v.id, v.assigned_to), quoteKeys),
  linkCustomer: useApiMutation((id: string) => quotesApi.linkCustomer(id), quoteKeys),
  convert: useApiMutation((id: string) => quotesApi.convert(id), [...quoteKeys, qk.orders, qk.notifications]),
  addItem: useApiMutation((v: { id: string; body: Record<string, unknown> }) => quotesApi.addItem(v.id, v.body), [qk.quotes]),
  updateItem: useApiMutation(
    (v: { id: string; itemId: string; body: Record<string, unknown> }) => quotesApi.updateItem(v.id, v.itemId, v.body),
    [qk.quotes]
  ),
  removeItem: useApiMutation((v: { id: string; itemId: string }) => quotesApi.removeItem(v.id, v.itemId), [qk.quotes]),
  remove: useApiMutation((id: string) => quotesApi.remove(id), quoteKeys),
  bulkRemove: useApiMutation((ids: string[]) => quotesApi.bulkRemove(ids), quoteKeys),
})

const sampleKeys = [qk.samples, qk.dashboard, qk.customers]
export const useSampleRequests = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.samples, params], queryFn: () => samplesApi.list(params), ...listOpts })
export const useSampleRequest = (id?: string | null) =>
  useQuery({ queryKey: [...qk.samples, 'detail', id], queryFn: () => samplesApi.get(id!), enabled: enabledId(id) })
export const useSampleActions = () => ({
  create: useApiMutation((body: Record<string, unknown>) => samplesApi.create(body), sampleKeys),
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => samplesApi.update(v.id, v.body), sampleKeys),
  setStatus: useApiMutation(
    (v: { id: string } & Parameters<typeof samplesApi.setStatus>[1]) => {
      const { id, ...body } = v
      return samplesApi.setStatus(id, body)
    },
    sampleKeys
  ),
  assign: useApiMutation((v: { id: string; assigned_to: string | null }) => samplesApi.assign(v.id, v.assigned_to), sampleKeys),
  linkCustomer: useApiMutation((id: string) => samplesApi.linkCustomer(id), sampleKeys),
  remove: useApiMutation((id: string) => samplesApi.remove(id), sampleKeys),
  bulkRemove: useApiMutation((ids: string[]) => samplesApi.bulkRemove(ids), sampleKeys),
})

export const useContactMessages = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.contacts, params], queryFn: () => contactsApi.list(params), ...listOpts })
export const useContactActions = () => ({
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => contactsApi.update(v.id, v.body), [qk.contacts, qk.dashboard]),
  remove: useApiMutation((id: string) => contactsApi.remove(id), [qk.contacts, qk.dashboard]),
})
export const useNewsletterSubscribers = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.newsletter, params], queryFn: () => newsletterApi.list(params), ...listOpts })
export const useNewsletterActions = () => ({
  setActive: useApiMutation((v: { id: string; is_active: boolean }) => newsletterApi.setActive(v.id, v.is_active), [qk.newsletter]),
  remove: useApiMutation((id: string) => newsletterApi.remove(id), [qk.newsletter]),
})

const orderKeys = [qk.orders, qk.dashboard, qk.customers, qk.notifications]
export const useSalesOrders = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.orders, params], queryFn: () => ordersApi.list(params), ...listOpts })
export const useSalesOrder = (id?: string | null) =>
  useQuery({ queryKey: [...qk.orders, 'detail', id], queryFn: () => ordersApi.get(id!), enabled: enabledId(id) })
export const useOrderActions = () => ({
  create: useApiMutation((body: Record<string, unknown>) => ordersApi.create(body), orderKeys),
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => ordersApi.update(v.id, v.body), orderKeys),
  setStatus: useApiMutation(
    (v: { id: string; status: Parameters<typeof ordersApi.setStatus>[1]; reason?: string }) => ordersApi.setStatus(v.id, v.status, v.reason),
    orderKeys
  ),
  sendToExport: useApiMutation((id: string) => ordersApi.sendToExport(id), orderKeys),
  accept: useApiMutation((id: string) => ordersApi.accept(id), [...orderKeys, qk.batches]),
  addItem: useApiMutation((v: { id: string; body: Record<string, unknown> }) => ordersApi.addItem(v.id, v.body), [qk.orders]),
  updateItem: useApiMutation(
    (v: { id: string; itemId: string; body: Record<string, unknown> }) => ordersApi.updateItem(v.id, v.itemId, v.body),
    [qk.orders]
  ),
  removeItem: useApiMutation((v: { id: string; itemId: string }) => ordersApi.removeItem(v.id, v.itemId), [qk.orders]),
  remove: useApiMutation((id: string) => ordersApi.remove(id), orderKeys),
})

// -----------------------------------------------------------------------------
// Sourcing
// -----------------------------------------------------------------------------
type Crud = {
  list: (q?: ListParams) => Promise<unknown>
  get: (id: string) => Promise<unknown>
  create: (body: Record<string, unknown>) => Promise<unknown>
  update: (id: string, body: Record<string, unknown>) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
}
function useCrudActions(api: Crud, keys: QueryKey[]) {
  return {
    create: useApiMutation((body: Record<string, unknown>) => api.create(body), keys),
    update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => api.update(v.id, v.body), keys),
    remove: useApiMutation((id: string) => api.remove(id), keys),
  }
}

export const useSuppliers = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.suppliers, params], queryFn: () => suppliersApi.list(params), ...listOpts })
export const useSupplier = (id?: string | null) =>
  useQuery({ queryKey: [...qk.suppliers, 'detail', id], queryFn: () => suppliersApi.get(id!), enabled: enabledId(id) })
export const useSupplierActions = () => useCrudActions(suppliersApi, [qk.suppliers, qk.dashboard])

export const useFarmers = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.farmers, params], queryFn: () => farmersApi.list(params), ...listOpts })
export const useFarmer = (id?: string | null) =>
  useQuery({ queryKey: [...qk.farmers, 'detail', id], queryFn: () => farmersApi.get(id!), enabled: enabledId(id) })
export const useFarmerActions = () => useCrudActions(farmersApi, [qk.farmers, qk.suppliers, qk.dashboard])

export const useFarms = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.farms, params], queryFn: () => farmsApi.list(params), ...listOpts })
export const useFarmActions = () => useCrudActions(farmsApi, [qk.farms, qk.farmers])

export const useLocations = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.locations, params], queryFn: () => locationsApi.list(params), ...listOpts })
export const useLocationActions = () => useCrudActions(locationsApi, [qk.locations])

export const useCollections = (params: ListParams = {}, opts: { enabled?: boolean } = {}) =>
  useQuery({ queryKey: [...qk.collections, params], queryFn: () => collectionsApi.list(params), ...listOpts, enabled: opts.enabled ?? true })
export const useCollection = (id?: string | null) =>
  useQuery({ queryKey: [...qk.collections, 'detail', id], queryFn: () => collectionsApi.get(id!), enabled: enabledId(id) })
export const useCollectionActions = () => ({
  ...useCrudActions(collectionsApi, [qk.collections, qk.dashboard]),
  setStatus: useApiMutation(
    (v: { id: string; status: 'submitted' | 'verified' | 'rejected'; reason?: string }) => collectionsApi.setStatus(v.id, v.status, v.reason),
    [qk.collections, qk.dashboard]
  ),
})

export const useLots = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.lots, params], queryFn: () => lotsApi.list(params), ...listOpts })
export const useLot = (id?: string | null) =>
  useQuery({ queryKey: [...qk.lots, 'detail', id], queryFn: () => lotsApi.get(id!), enabled: enabledId(id) })
export const useLotActions = () => useCrudActions(lotsApi, [qk.lots, qk.collections, qk.dashboard])

// -----------------------------------------------------------------------------
// Quality, warehouses, inventory
// -----------------------------------------------------------------------------
const qualityKeys = [qk.quality, qk.lots, qk.inventory, qk.dashboard, qk.notifications]
export const useInspections = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.quality, params], queryFn: () => qualityApi.list(params), ...listOpts })
export const useInspectionActions = () => ({
  ...useCrudActions(qualityApi, qualityKeys),
  decide: useApiMutation(
    (v: { id: string; decision: 'approved' | 'rejected'; notes?: string }) => qualityApi.decide(v.id, v.decision, v.notes),
    qualityKeys
  ),
  reopen: useApiMutation((id: string) => qualityApi.reopen(id), qualityKeys),
  bulkRemove: useApiMutation((ids: string[]) => qualityApi.bulkRemove(ids), qualityKeys),
})

export const useWarehouses = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.warehouses, params], queryFn: () => warehousesApi.list(params), ...listOpts })
export const useWarehouse = (id?: string | null) =>
  useQuery({ queryKey: [...qk.warehouses, 'detail', id], queryFn: () => warehousesApi.get(id!), enabled: enabledId(id) })
export const useWarehouseActions = () => useCrudActions(warehousesApi, [qk.warehouses, qk.inventory])

const stockKeys = [qk.inventory, qk.lots, qk.warehouses, qk.dashboard, qk.batches]
export const useInventory = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.inventory, params], queryFn: () => inventoryApi.list(params), ...listOpts })
export const useInventoryItem = (id?: string | null) =>
  useQuery({ queryKey: [...qk.inventory, 'detail', id], queryFn: () => inventoryApi.get(id!), enabled: enabledId(id) })
export const useStockMovements = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.inventory, 'transactions', params], queryFn: () => inventoryApi.transactions(params), ...listOpts })
export const useReceivableLots = () => useQuery({ queryKey: [...qk.inventory, 'receivable'], queryFn: inventoryApi.receivableLots })
export const useInventoryActions = () => ({
  receive: useApiMutation((body: Record<string, unknown>) => inventoryApi.receive(body), stockKeys),
  updateDetails: useApiMutation((v: { id: string; body: Record<string, unknown> }) => inventoryApi.updateDetails(v.id, v.body), stockKeys),
  adjust: useApiMutation((v: { id: string; delta_kg: number; reason: string }) => inventoryApi.adjust(v.id, v.delta_kg, v.reason), stockKeys),
  issue: useApiMutation(
    (v: { id: string; quantity_kg: number; reason: string; reference_type?: string; reference_id?: string }) => {
      const { id, ...body } = v
      return inventoryApi.issue(id, body)
    },
    stockKeys
  ),
  transfer: useApiMutation(
    (v: { id: string; to_warehouse_id: string; quantity_kg: number; notes?: string }) => {
      const { id, ...body } = v
      return inventoryApi.transfer(id, body)
    },
    stockKeys
  ),
})

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------
const batchKeys = [qk.batches, qk.orders, qk.inventory, qk.lots, qk.shipments, qk.dashboard, qk.notifications]
export const useExportBatches = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.batches, params], queryFn: () => batchesApi.list(params), ...listOpts })
export const useExportBatch = (id?: string | null) =>
  useQuery({ queryKey: [...qk.batches, 'detail', id], queryFn: () => batchesApi.get(id!), enabled: enabledId(id) })
export const useEligibleOrders = () => useQuery({ queryKey: [...qk.batches, 'eligible-orders'], queryFn: batchesApi.eligibleOrders })
export const useAvailableStock = (params: { origin?: string; grade?: string; search?: string } = {}) =>
  useQuery({ queryKey: [...qk.batches, 'stock', params], queryFn: () => batchesApi.availableStock(params) })
export const useBatchActions = () => ({
  create: useApiMutation((body: Parameters<typeof batchesApi.create>[0]) => batchesApi.create(body), batchKeys),
  update: useApiMutation((v: { id: string; notes: string | null }) => batchesApi.update(v.id, { notes: v.notes }), [qk.batches]),
  setStatus: useApiMutation(
    (v: { id: string; status: Parameters<typeof batchesApi.setStatus>[1]; reason?: string }) => batchesApi.setStatus(v.id, v.status, v.reason),
    batchKeys
  ),
})

const shipmentKeys = [qk.shipments, qk.batches, qk.orders, qk.lots, qk.dashboard, qk.notifications, qk.traceability]
export const useShipments = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.shipments, params], queryFn: () => shipmentsApi.list(params), ...listOpts })
export const useShipment = (id?: string | null) =>
  useQuery({ queryKey: [...qk.shipments, 'detail', id], queryFn: () => shipmentsApi.get(id!), enabled: enabledId(id) })
export const useEligibleBatches = () => useQuery({ queryKey: [...qk.shipments, 'eligible-batches'], queryFn: shipmentsApi.eligibleBatches })
export const useShipmentActions = () => ({
  create: useApiMutation((body: Record<string, unknown>) => shipmentsApi.create(body), shipmentKeys),
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => shipmentsApi.update(v.id, v.body), shipmentKeys),
  setStatus: useApiMutation(
    (v: { id: string; status: Parameters<typeof shipmentsApi.setStatus>[1]; location?: string; note?: string }) =>
      shipmentsApi.setStatus(v.id, v.status, { location: v.location, note: v.note }),
    shipmentKeys
  ),
  addUpdate: useApiMutation(
    (v: { id: string; description: string; location?: string; event_time?: string }) => {
      const { id, ...body } = v
      return shipmentsApi.addUpdate(id, body)
    },
    [qk.shipments, qk.notifications]
  ),
  remove: useApiMutation((id: string) => shipmentsApi.remove(id), shipmentKeys),
})

// -----------------------------------------------------------------------------
// Documents
// -----------------------------------------------------------------------------
const documentKeys = [qk.documents, qk.shipments, qk.orders, qk.quotes, qk.samples, qk.batches, qk.notifications]
export const useDocuments = (params: ListParams = {}) =>
  useQuery({ queryKey: [...qk.documents, params], queryFn: () => documentsApi.list(params), ...listOpts })
export const useDocumentActions = () => ({
  create: useApiMutation((input: Parameters<typeof documentsApi.create>[0]) => documentsApi.create(input), documentKeys),
  update: useApiMutation((v: { id: string; body: Record<string, unknown> }) => documentsApi.update(v.id, v.body), documentKeys),
  remove: useApiMutation((id: string) => documentsApi.remove(id), documentKeys),
})

/**
 * Open a document in a new tab via a short-lived signed link. The tab is
 * opened synchronously (inside the click) so popup blockers allow it.
 */
export async function openDocument(id: string) {
  const tab = window.open('', '_blank')
  try {
    const { url } = await documentsApi.download(id)
    if (tab) {
      tab.opener = null
      tab.location.href = url
    } else {
      window.location.href = url
    }
  } catch (err) {
    tab?.close()
    throw err
  }
}
