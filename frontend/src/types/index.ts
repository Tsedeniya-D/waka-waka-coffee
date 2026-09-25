/**
 * Types for the Waka Coffee database (after the 20260925* migrations) and
 * the Express API responses. Identity rule: profiles.id = auth.users.id.
 */

// -----------------------------------------------------------------------------
// Roles & statuses (mirror backend/src/config/statuses.js and DB checks)
// -----------------------------------------------------------------------------
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'sales'
  | 'export_manager'
  | 'procurement'
  | 'field_officer'
  | 'quality'
  | 'quality_officer'
  | 'warehouse'
  | 'warehouse_officer'
  | 'user'

export type QuoteStatus = 'new' | 'reviewing' | 'contacted' | 'quoted' | 'accepted' | 'rejected' | 'converted'
export type SampleStatus =
  | 'new'
  | 'reviewing'
  | 'approved'
  | 'preparing'
  | 'processing'
  | 'dispatched'
  | 'delivered'
  | 'completed'
  | 'rejected'
  | 'cancelled'
export type ContactStatus = 'new' | 'read' | 'replied' | 'closed'
export type CustomerStatus = 'active' | 'inactive'
export type CustomerSource = 'Manual' | 'Quote Request' | 'Sample Request' | 'Contact Message'
export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'sent_to_export'
  | 'export_accepted'
  | 'processing'
  | 'shipped'
  | 'completed'
  | 'cancelled'
export type BatchStatus = 'preparing' | 'ready' | 'approved' | 'shipped' | 'completed' | 'cancelled'
export type ShipmentStatus = 'preparing' | 'booked' | 'in_transit' | 'arrived' | 'completed' | 'cancelled'
export type CollectionStatus = 'submitted' | 'verified' | 'rejected' | 'partially_processed' | 'processed'
export type LotStatus = 'pending_quality' | 'approved' | 'rejected' | 'in_warehouse' | 'reserved' | 'shipped' | 'sold'
export type QualityResult = 'pending' | 'passed' | 'failed'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type SampleType = 'offer' | 'pre_shipment' | 'arrival' | 'type_sample' | 'other'
export type InventoryStatus = 'available' | 'reserved' | 'shipped' | 'depleted'
export type TransactionType =
  | 'receipt'
  | 'issue'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'export_allocation'
  | 'export_release'
  | 'in'
  | 'out'
  | 'adjustment'
export type SupplierType = 'farmer' | 'cooperative' | 'union' | 'trader' | 'washing_station' | 'supplier' | 'other'
export type LocationType =
  | 'region'
  | 'zone'
  | 'woreda'
  | 'kebele'
  | 'collection_point'
  | 'washing_station'
  | 'port'
  | 'other'
export type DocumentType =
  | 'quotation'
  | 'invoice'
  | 'commercial_invoice'
  | 'packing_list'
  | 'certificate'
  | 'certificate_of_origin'
  | 'phytosanitary_certificate'
  | 'quality_certificate'
  | 'bill_of_lading'
  | 'product_specification'
  | 'quality_document'
  | 'export_permit'
  | 'contract'
  | 'other'
export type DocumentRelatedType =
  | 'general'
  | 'quote_request'
  | 'sample_request'
  | 'customer'
  | 'sales_order'
  | 'export_batch'
  | 'shipment'
  | 'coffee_lot'
  | 'quality_inspection'
  | 'warehouse'
  | 'product'
  | 'supplier'
  | 'farmer'
  | 'collection'
export type ProductAvailability = 'available' | 'limited' | 'sold_out' | 'available_on_request'
export type WorkflowEntity =
  | 'quote_request'
  | 'sample_request'
  | 'sales_order'
  | 'export_batch'
  | 'shipment'
  | 'collection'
  | 'coffee_lot'

/** Legacy public-site request status names (kept for older components). */
export type RequestStatus = QuoteStatus

export type ProcessingMethod = 'washed' | 'natural' | 'honey' | 'anaerobic' | 'pulped_natural' | 'semi_washed'
export type Grade = 'G1' | 'G2' | 'G3' | 'G4' | 'G5'

// -----------------------------------------------------------------------------
// API envelope
// -----------------------------------------------------------------------------
export interface ListMeta {
  total: number
  page: number
  limit: number
}
export interface ListResult<T> {
  data: T[]
  meta: ListMeta
}
export interface ListParams {
  page?: number
  limit?: number
  search?: string
  sort?: string
  from?: string
  to?: string
  [key: string]: string | number | boolean | undefined | null | string[]
}

/** Minimal person reference attached by the API (profiles). */
export interface PersonRef {
  id: string
  full_name: string | null
  email?: string | null
  role?: UserRole
}

// -----------------------------------------------------------------------------
// People
// -----------------------------------------------------------------------------
export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  avatar_url: string | null
  phone: string | null
  job_title: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface ModulePermissions {
  view: boolean
  create: boolean
  update: boolean
  delete: boolean
}
export interface Permissions {
  role: UserRole
  is_admin: boolean
  modules: string[]
  actions: Record<string, ModulePermissions>
}
export interface Session {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  expires_at: number
  /** Supabase Auth user record of the signed-in employee */
  user?: Record<string, unknown> | null
}
export interface AuthPayload {
  session: Session
  user: { id: string; email: string | null }
  profile: Profile
  permissions: Permissions
}
export interface MePayload {
  user: { id: string; email: string | null }
  profile: Profile
  permissions: Permissions
}

export interface WorkflowTransition {
  from_status: string
  to_status: string
  label: string | null
  allowed: boolean
}
export type WorkflowRules = Partial<Record<WorkflowEntity, WorkflowTransition[]>>

// -----------------------------------------------------------------------------
// Catalog
// -----------------------------------------------------------------------------
export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CoffeeRegion {
  id: string
  name: string
  slug: string
  description: string | null
  altitude: string | null
  flavor_notes: string[] | null
  processing_methods: string[] | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductImage {
  id: string
  product_id?: string
  image_url: string
  alt_text: string | null
  is_primary: boolean
  display_order: number | null
  storage_path?: string | null
}

export interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  short_description: string | null
  category_id: string | null
  region_id: string | null
  origin: string | null
  grade: string | null
  variety: string | null
  processing: string | null
  altitude: string | null
  flavor_notes: string[] | null
  certifications: string[] | null
  harvest_season: string | null
  screen_size: string | null
  moisture: number | null
  cup_score: number | null
  packaging: string | null
  availability: ProductAvailability | null
  min_order_kg: number | null
  image_url: string | null
  is_active: boolean
  is_featured: boolean
  is_archived: boolean
  sort_order: number
  created_at: string
  updated_at: string
  category?: Pick<Category, 'id' | 'name' | 'slug'> | null
  region?: Pick<CoffeeRegion, 'id' | 'name' | 'slug'> | null
  images?: ProductImage[]
}

// Public content (read by the website)
export interface Service {
  id: string
  title: string
  slug: string
  description: string
  icon?: string
  image_url?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface ExportCountry {
  id: string
  name: string
  slug: string
  flag_url?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface GalleryItem {
  id: string
  title: string
  description?: string
  category: string
  image_url: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface Certificate {
  id: string
  name: string
  description?: string | null
  document_url?: string | null
  image_url?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface BlogCategory {
  id: string
  name: string
  slug: string
  description?: string
  created_at: string
}
export interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  category_id?: string
  is_published: boolean
  published_at?: string
  created_at: string
  category?: BlogCategory
}
export interface Testimonial {
  id: string
  quote: string
  author_name: string
  author_title?: string
  company?: string
  country?: string
  avatar_url?: string
  rating?: number
  is_active: boolean
  created_at: string
}
export interface FAQ {
  id: string
  question: string
  answer: string
  category?: string
  is_active: boolean
  created_at: string
}

// -----------------------------------------------------------------------------
// Leads & customers
// -----------------------------------------------------------------------------
export interface ContactMessage {
  id: string
  name: string | null
  email: string
  phone: string | null
  company: string | null
  country: string | null
  subject: string | null
  message: string
  status: ContactStatus
  admin_notes: string | null
  assigned_to: string | null
  assigned?: PersonRef | null
  created_at: string
  updated_at: string
}

export interface NewsletterSubscriber {
  id: string
  email: string
  is_active: boolean
  subscribed_at: string
  unsubscribed_at: string | null
  source: string | null
}

export interface CustomerRef {
  id: string
  customer_code: string
  company_name: string
  country?: string | null
  destination_port?: string | null
}

export interface Customer {
  id: string
  customer_code: string
  company_name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  country: string | null
  city: string | null
  destination_port: string | null
  address: string | null
  notes: string | null
  status: CustomerStatus
  source: CustomerSource | null
  assigned_to: string | null
  assigned?: PersonRef | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CustomerDetail extends Customer {
  creator?: PersonRef | null
  quote_history: Pick<QuoteRequest, 'id' | 'reference_number' | 'product_name' | 'quantity_kg' | 'status' | 'created_at'>[]
  sample_history: Pick<SampleRequest, 'id' | 'reference_number' | 'product_name' | 'sample_quantity' | 'status' | 'created_at' | 'tracking_number'>[]
  order_history: Pick<SalesOrder, 'id' | 'order_number' | 'product_name' | 'quantity_kg' | 'unit_price' | 'currency' | 'status' | 'created_at'>[]
  totals: { orders: number; ordered_kg: number }
}

export interface QuoteItem {
  id: string
  quote_request_id: string
  product_id: string | null
  description: string
  grade: string | null
  processing_method: string | null
  quantity_kg: number
  unit_price: number | null
  currency: string
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DocumentSummary {
  id: string
  title: string
  document_type: DocumentType
  file_name: string | null
  file_url: string | null
  mime_type?: string | null
  file_size?: number | null
  is_public?: boolean
  uploaded_by?: string | null
  uploader?: PersonRef | null
  created_at: string
}

export interface QuoteRequest {
  id: string
  reference_number: string
  full_name: string
  company: string
  email: string
  phone: string | null
  country: string | null
  destination_port: string | null
  product_id: string | null
  product_name: string | null
  region_name: string | null
  grade: string | null
  processing: string | null
  quantity_kg: number | null
  packaging: string | null
  certifications: string[] | null
  target_shipment: string | null
  message: string | null
  status: QuoteStatus
  admin_notes: string | null
  currency: string | null
  incoterm: string | null
  payment_terms: string | null
  valid_until: string | null
  quotation_notes: string | null
  quoted_at: string | null
  customer_id: string | null
  assigned_to: string | null
  customer?: CustomerRef | null
  assigned?: PersonRef | null
  orders?: Pick<SalesOrder, 'id' | 'order_number' | 'status'>[]
  created_at: string
  updated_at: string
}

export interface QuoteRequestDetail extends QuoteRequest {
  items: QuoteItem[]
  documents: DocumentSummary[]
  quotation_total: number | null
  next_statuses?: QuoteStatus[]
}

export interface SampleRequest {
  id: string
  reference_number: string
  product_id: string | null
  product_name: string | null
  sample_quantity: number | null
  sample_quantity_unit: string | null
  full_name: string
  company: string | null
  email: string
  phone: string | null
  country: string | null
  shipping_address: string
  message: string | null
  status: SampleStatus
  courier: string | null
  tracking_number: string | null
  shipped_at: string | null
  delivered_at: string | null
  admin_notes: string | null
  customer_id: string | null
  assigned_to: string | null
  customer?: CustomerRef | null
  assigned?: PersonRef | null
  created_at: string
  updated_at: string
}
export interface SampleRequestDetail extends SampleRequest {
  documents: DocumentSummary[]
  next_statuses?: SampleStatus[]
}

// -----------------------------------------------------------------------------
// Sales orders
// -----------------------------------------------------------------------------
export interface SalesOrderItem {
  id: string
  sales_order_id: string
  product_id: string | null
  description: string
  quantity_kg: number
  grade: string | null
  processing_method: string | null
  unit_price: number | null
  created_at: string
}

export interface SalesOrder {
  id: string
  order_number: string
  customer_id: string | null
  quote_request_id: string | null
  sales_person_id: string | null
  product_name: string
  origin: string | null
  grade: string | null
  processing_method: string | null
  quantity_kg: number
  unit_price: number | null
  currency: string | null
  incoterm: string | null
  payment_terms: string | null
  destination_country: string | null
  destination_port: string | null
  requested_ship_date: string | null
  customer_notes: string | null
  status: OrderStatus
  sent_to_export_at: string | null
  export_accepted_at: string | null
  export_accepted_by: string | null
  shipped_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  customer?: CustomerRef | null
  quote?: { id: string; reference_number: string } | null
  sales_person?: PersonRef | null
  accepted_by?: PersonRef | null
}

export interface SalesOrderDetail extends SalesOrder {
  items: SalesOrderItem[]
  export_batches: (Pick<ExportBatch, 'id' | 'batch_number' | 'status' | 'total_quantity_kg' | 'created_at'> & {
    shipments: Pick<Shipment, 'id' | 'shipment_number' | 'status' | 'estimated_arrival'>[]
  })[]
  documents: DocumentSummary[]
  allocated_kg: number
  next_statuses?: OrderStatus[]
}

// -----------------------------------------------------------------------------
// Sourcing
// -----------------------------------------------------------------------------
export interface Supplier {
  id: string
  supplier_code: string
  name: string
  supplier_type: SupplierType
  contact_person: string | null
  phone: string | null
  email: string | null
  region: string | null
  zone: string | null
  woreda: string | null
  kebele: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface SupplierDetail extends Supplier {
  farmers: Pick<Farmer, 'id' | 'farmer_code' | 'name' | 'phone' | 'woreda' | 'kebele' | 'is_active'>[]
  collections: Pick<CollectionRecord, 'id' | 'collection_code' | 'collection_date' | 'origin' | 'quantity_kg' | 'status'>[]
  lots: Pick<CoffeeLot, 'id' | 'lot_code' | 'origin' | 'quantity_kg' | 'grade' | 'status' | 'created_at'>[]
  totals: { collections: number; collected_kg: number }
}

export interface Farmer {
  id: string
  farmer_code: string
  name: string
  phone: string | null
  email: string | null
  gender: 'male' | 'female' | 'other' | null
  national_id: string | null
  region: string | null
  zone: string | null
  woreda: string | null
  kebele: string | null
  address: string | null
  supplier_id: string | null
  supplier?: Pick<Supplier, 'id' | 'supplier_code' | 'name'> | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface FarmerDetail extends Farmer {
  farms: Farm[]
  collections: (Pick<CollectionRecord, 'id' | 'collection_code' | 'collection_date' | 'origin' | 'quantity_kg' | 'status' | 'farm_id'> & {
    supplier: Pick<Supplier, 'id' | 'name'> | null
  })[]
  totals: { collections: number; collected_kg: number }
}

export interface Farm {
  id: string
  farm_code: string
  farmer_id: string
  farm_name: string
  region: string | null
  zone: string | null
  woreda: string | null
  kebele: string | null
  specific_location: string | null
  area_hectares: number | null
  coffee_variety: string | null
  altitude_meters: number | null
  latitude: number | null
  longitude: number | null
  location_id: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  farmer?: Pick<Farmer, 'id' | 'farmer_code' | 'name'> | null
  location?: Pick<Location, 'id' | 'location_code' | 'name'> | null
}

export interface Location {
  id: string
  location_code: string
  name: string
  location_type: LocationType
  parent_id: string | null
  parent?: Pick<Location, 'id' | 'name' | 'location_type'> | null
  region: string | null
  zone: string | null
  woreda: string | null
  kebele: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  altitude_meters: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CollectionRecord {
  id: string
  collection_code: string
  collection_date: string
  field_officer_id: string | null
  field_officer?: PersonRef | null
  supplier_id: string
  farmer_id: string | null
  farm_id: string | null
  location_id: string | null
  origin: string
  region: string | null
  zone: string | null
  woreda: string | null
  kebele: string | null
  coffee_type: string | null
  variety: string | null
  processing_method: string | null
  grade: string | null
  quantity_kg: number
  purchase_price: number | null
  currency: string | null
  notes: string | null
  status: CollectionStatus
  created_at: string
  updated_at: string
  supplier?: Pick<Supplier, 'id' | 'supplier_code' | 'name'> | null
  farmer?: Pick<Farmer, 'id' | 'farmer_code' | 'name'> | null
  farm?: Pick<Farm, 'id' | 'farm_code' | 'farm_name'> | null
  location?: Pick<Location, 'id' | 'location_code' | 'name'> | null
}
export interface CollectionDetail extends CollectionRecord {
  lots: Pick<CoffeeLot, 'id' | 'lot_code' | 'quantity_kg' | 'status' | 'grade' | 'processing_method' | 'created_at'>[]
  lotted_kg: number
  remaining_kg: number
}

export interface CoffeeLot {
  id: string
  lot_code: string
  collection_id: string
  supplier_id: string
  origin: string
  quantity_kg: number
  processing_method: string | null
  grade: string | null
  status: LotStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  collection?: Pick<CollectionRecord, 'id' | 'collection_code' | 'collection_date' | 'quantity_kg' | 'farmer_id' | 'farm_id'> | null
  supplier?: Pick<Supplier, 'id' | 'supplier_code' | 'name'> | null
}
export interface CoffeeLotDetail extends CoffeeLot {
  inspections: (Pick<
    QualityInspection,
    'id' | 'inspection_date' | 'sample_type' | 'result' | 'approval_status' | 'final_grade' | 'cup_score' | 'moisture' | 'approved_at'
  > & { inspector: PersonRef | null })[]
  inventory: { id: string; quantity_kg: number; status: InventoryStatus; bag_count: number | null; received_date: string | null; warehouse: Pick<Warehouse, 'id' | 'code' | 'name'> | null }[]
  allocations: { id: string; quantity_kg: number; released_at: string | null; warehouse_id: string | null; batch: Pick<ExportBatch, 'id' | 'batch_number' | 'status'> | null }[]
  received_kg: number
  unreceived_kg: number
  on_hand_kg: number
}

// -----------------------------------------------------------------------------
// Quality
// -----------------------------------------------------------------------------
export interface QualityInspection {
  id: string
  lot_id: string
  inspector_id: string | null
  inspector?: PersonRef | null
  inspection_date: string
  sample_type: SampleType
  sample_reference: string | null
  moisture: number | null
  defect_count: number | null
  screen_size: string | null
  cup_score: number | null
  aroma: string | null
  flavor: string | null
  acidity: string | null
  body: string | null
  final_grade: string | null
  result: QualityResult
  approval_status: ApprovalStatus
  approved_by: string | null
  approver?: PersonRef | null
  approved_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  lot?: Pick<CoffeeLot, 'id' | 'lot_code' | 'origin' | 'quantity_kg' | 'processing_method' | 'grade' | 'status'> | null
}

// -----------------------------------------------------------------------------
// Warehouses & inventory
// -----------------------------------------------------------------------------
export interface Warehouse {
  id: string
  code: string
  name: string
  location: string | null
  location_id: string | null
  capacity_kg: number | null
  is_active: boolean
  status: 'active' | 'inactive' | null
  manager_id: string | null
  manager?: PersonRef | null
  contact_person: string | null
  phone: string | null
  email: string | null
  notes: string | null
  temperature_min_c: number | null
  temperature_max_c: number | null
  humidity_min_percent: number | null
  humidity_max_percent: number | null
  ventilation: string | null
  lighting: string | null
  pallet_required: boolean | null
  wall_clearance_m: number | null
  ceiling_clearance_m: number | null
  packaging_type: string | null
  quality_check_zone: string | null
  pass_zone: string | null
  fail_zone: string | null
  sampling_frequency: string | null
  moisture_limit_percent: number | null
  pest_control_method: string | null
  sanitation_schedule: string | null
  stock_kg?: number
  utilisation_pct?: number | null
  created_at: string
  updated_at: string
}

export interface InventoryTransaction {
  id: string
  lot_id: string
  warehouse_id: string
  transaction_type: TransactionType
  quantity_kg: number
  balance_after: number | null
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  performed_by: string | null
  performer?: PersonRef | null
  created_at: string
  lot?: Pick<CoffeeLot, 'id' | 'lot_code' | 'origin'> | null
  warehouse?: Pick<Warehouse, 'id' | 'code' | 'name'> | null
}

export interface WarehouseDetail extends Warehouse {
  stock: { id: string; quantity_kg: number; status: InventoryStatus; bag_count: number | null; received_date: string | null; lot: Pick<CoffeeLot, 'id' | 'lot_code' | 'origin' | 'grade' | 'status'> | null }[]
  movements: InventoryTransaction[]
}

export interface InventoryItem {
  id: string
  lot_id: string
  warehouse_id: string
  quantity_kg: number
  status: InventoryStatus
  bag_count: number | null
  weight_per_bag_kg: number | null
  unit_cost_per_kg: number | null
  shipping_cost: number | null
  par_level_bags: number | null
  roast_loss_percent: number | null
  coffee_type: string | null
  inventory_type: 'green' | 'roasted' | null
  received_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  is_low_stock?: boolean
  total_cost?: number | null
  lot?: Pick<CoffeeLot, 'id' | 'lot_code' | 'origin' | 'quantity_kg' | 'processing_method' | 'grade' | 'status'> | null
  warehouse?: Pick<Warehouse, 'id' | 'code' | 'name' | 'location'> | null
}
export interface InventoryDetail extends InventoryItem {
  movements: InventoryTransaction[]
}
export interface ReceivableLot extends Pick<CoffeeLot, 'id' | 'lot_code' | 'origin' | 'quantity_kg' | 'grade' | 'processing_method' | 'status'> {
  received_kg: number
  remaining_kg: number
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------
export interface ExportBatchLot {
  id: string
  lot_id: string
  warehouse_id: string | null
  quantity_kg: number
  released_at: string | null
  lot: Pick<CoffeeLot, 'id' | 'lot_code' | 'origin' | 'grade' | 'processing_method' | 'status'> | null
  warehouse: Pick<Warehouse, 'id' | 'code' | 'name'> | null
}

export interface ExportBatch {
  id: string
  batch_number: string
  sales_order_id: string
  export_manager_id: string | null
  export_manager?: PersonRef | null
  total_quantity_kg: number
  status: BatchStatus
  notes: string | null
  destination_country: string | null
  destination_port: string | null
  shipped_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  sales_order?: (Pick<SalesOrder, 'id' | 'order_number' | 'product_name' | 'quantity_kg' | 'destination_country' | 'destination_port' | 'status'> & {
    customer: Pick<Customer, 'id' | 'company_name' | 'customer_code'> | null
  }) | null
  lots?: ExportBatchLot[]
  shipments?: Pick<Shipment, 'id' | 'shipment_number' | 'status'>[]
}
export interface ExportBatchDetail extends ExportBatch {
  documents: DocumentSummary[]
  next_statuses?: BatchStatus[]
}

export interface EligibleOrder extends Pick<
  SalesOrder,
  'id' | 'order_number' | 'product_name' | 'origin' | 'grade' | 'processing_method' | 'quantity_kg' | 'destination_country' | 'destination_port' | 'status' | 'requested_ship_date'
> {
  customer: Pick<Customer, 'id' | 'company_name' | 'customer_code'> | null
  allocated_kg: number
  remaining_kg: number
}

export interface AvailableStock {
  id: string
  lot_id: string
  warehouse_id: string
  quantity_kg: number
  bag_count: number | null
  lot: Pick<CoffeeLot, 'id' | 'lot_code' | 'origin' | 'grade' | 'processing_method' | 'status'>
  warehouse: Pick<Warehouse, 'id' | 'code' | 'name' | 'location'> | null
  quality: { approval_status: ApprovalStatus; final_grade: string | null; cup_score: number | null; approved_at: string | null } | null
  exportable: boolean
}

export interface ShipmentUpdate {
  id: string
  shipment_id: string
  status: ShipmentStatus | null
  location: string | null
  description: string
  event_time: string
  created_by: string | null
  author?: PersonRef | null
  created_at: string
}

export interface Shipment {
  id: string
  shipment_number: string
  export_batch_id: string
  export_manager_id: string | null
  export_manager?: PersonRef | null
  destination_country: string | null
  destination_port: string | null
  port_of_loading: string | null
  carrier: string | null
  container_number: string | null
  vessel_name: string | null
  booking_reference: string | null
  bill_of_lading_number: string | null
  tracking_number: string | null
  shipping_date: string | null
  estimated_arrival: string | null
  actual_arrival: string | null
  status: ShipmentStatus
  notes: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  export_batch?: (Pick<ExportBatch, 'id' | 'batch_number' | 'total_quantity_kg' | 'status'> & {
    sales_order: (Pick<SalesOrder, 'id' | 'order_number' | 'product_name' | 'sales_person_id'> & {
      customer: Pick<Customer, 'id' | 'company_name' | 'country'> | null
    }) | null
  }) | null
}
export interface ShipmentDetail extends Shipment {
  updates: ShipmentUpdate[]
  documents: DocumentSummary[]
  next_statuses?: ShipmentStatus[]
}
export interface EligibleBatch extends Pick<ExportBatch, 'id' | 'batch_number' | 'total_quantity_kg' | 'status' | 'destination_country' | 'destination_port'> {
  sales_order: (Pick<SalesOrder, 'id' | 'order_number' | 'product_name'> & { customer: Pick<Customer, 'id' | 'company_name'> | null }) | null
}

// -----------------------------------------------------------------------------
// Documents
// -----------------------------------------------------------------------------
export interface Document {
  id: string
  title: string
  document_type: DocumentType
  related_type: DocumentRelatedType
  related_id: string | null
  related_label?: string | null
  file_path: string | null
  file_url: string | null
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  is_public: boolean
  notes: string | null
  uploaded_by: string | null
  uploader?: PersonRef | null
  created_at: string
  updated_at: string
}

// -----------------------------------------------------------------------------
// Notifications & activity
// -----------------------------------------------------------------------------
export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  related_type: string | null
  related_id: string | null
  is_read: boolean
  created_at: string
}

export interface ActivityLog {
  id: string
  user_id: string | null
  user?: PersonRef | null
  action: string
  entity_type: string
  entity_id: string | null
  details: { label?: string; status?: string; changes?: Record<string, { from: unknown; to: unknown }> } | null
  created_at: string
}

// -----------------------------------------------------------------------------
// Dashboard, reports, traceability
// -----------------------------------------------------------------------------
type Counts = Record<string, number>

export interface DashboardSummary {
  role: UserRole
  generated_at: string
  notifications: { unread: number }
  customers?: { total: number; active: number; new_30d: number }
  orders?: {
    total: number
    by_status: Counts
    pending_export: number
    open_kg: number
    value_by_currency: { currency: string; value: number }[]
    trend: { month: string; orders: number; kg: number }[]
  }
  quotes?: { total: number; new: number; open: number; new_7d: number; by_status: Counts }
  samples?: { total: number; new: number; open: number; by_status: Counts }
  contacts?: { unread: number }
  export?: {
    batches_active: number
    batches_by_status: Counts
    shipments_in_transit: number
    shipments_active: number
    arriving_7d: number
    shipments_by_status: Counts
  }
  lots?: { total: number; total_kg: number; by_status: Counts }
  quality?: {
    awaiting_inspection: number
    pending_approval: number
    approved_30d: number
    rejected_30d: number
    avg_cup_score_30d: number | null
  }
  inventory?: {
    total_kg: number
    low_stock: number
    awaiting_receipt: number
    by_warehouse: { warehouse_id: string; name: string; code: string; capacity_kg: number | null; stock_kg: number }[]
  }
  field?: { collections_30d: number; collected_kg_30d: number; awaiting_lots: number; farmers: number; suppliers: number }
}

export interface DashboardPayload {
  summary: DashboardSummary
  recent_notifications: Notification[]
  recent_activity: ActivityLog[]
}

export interface ReportSummary {
  period: { from: string | null; to: string | null }
  orders: {
    count: number
    total_kg: number
    by_status: Counts
    value_by_currency: { currency: string; value: number }[]
    by_month: { month: string; orders: number; kg: number }[]
    by_destination: { country: string; orders: number; kg: number }[]
    top_customers: { customer_id: string; company_name: string; country: string | null; orders: number; kg: number }[]
  }
  quotes: { count: number; by_status: Counts; converted: number; conversion_rate: number; requested_kg: number }
  samples: { count: number; by_status: Counts; dispatched: number }
  export_batches: { count: number; total_kg: number; by_status: Counts }
  shipments: { count: number; by_status: Counts; arrived_on_time: number; arrived_late: number; avg_transit_days: number | null }
  inventory: {
    total_kg: number
    by_warehouse: { warehouse_id: string; name: string; code: string; capacity_kg: number | null; stock_kg: number; lots: number; utilisation_pct: number | null }[]
    movements: Counts
  }
  lots: { count: number; total_kg: number; by_status: Counts; by_origin: { origin: string; lots: number; kg: number }[] }
  quality: {
    inspections: number
    passed: number
    failed: number
    approved: number
    rejected: number
    pass_rate: number
    avg_cup_score: number | null
    by_grade: Counts
  }
  collections: {
    count: number
    total_kg: number
    by_region: { region: string; collections: number; kg: number }[]
    top_suppliers: { supplier: string; kg: number }[]
  }
  customers: { total: number; new_in_period: number; by_country: { country: string; customers: number }[] }
}

export interface TraceOverviewRow {
  lot_id: string
  lot_code: string
  origin: string
  grade: string | null
  processing_method: string | null
  quantity_kg: number
  status: LotStatus
  collection_code: string | null
  collection_date: string | null
  region: string | null
  supplier_name: string | null
  farmer_name: string | null
  farm_name: string | null
  quality: { result: QualityResult; approval_status: ApprovalStatus; final_grade: string | null; cup_score: number | null; inspection_date: string } | null
  inventory_kg: number
  warehouses: string[]
  batches: {
    batch_number: string
    status: BatchStatus
    quantity_kg: number
    order_number: string
    customer: string | null
    country: string | null
    shipments: { shipment_number: string; status: ShipmentStatus }[]
  }[]
}

export interface TraceSearchHit {
  type: 'lot' | 'shipment' | 'export_batch' | 'sales_order' | 'collection'
  id: string
  code: string
  label: string | null
  status: string
}

export interface TraceLotSource {
  lot: Pick<CoffeeLot, 'id' | 'lot_code' | 'origin' | 'quantity_kg' | 'processing_method' | 'grade' | 'status' | 'created_at'>
  collection:
    | (Pick<
        CollectionRecord,
        'id' | 'collection_code' | 'collection_date' | 'quantity_kg' | 'origin' | 'region' | 'zone' | 'woreda' | 'kebele' | 'coffee_type' | 'variety' | 'processing_method' | 'status'
      > & { field_officer: PersonRef | null })
    | null
  supplier: Pick<Supplier, 'id' | 'supplier_code' | 'name' | 'supplier_type' | 'region' | 'zone' | 'woreda' | 'kebele'> | null
  farmer: Pick<Farmer, 'id' | 'farmer_code' | 'name' | 'region' | 'zone' | 'woreda' | 'kebele'> | null
  farm: Pick<Farm, 'id' | 'farm_code' | 'farm_name' | 'region' | 'zone' | 'woreda' | 'kebele' | 'altitude_meters' | 'area_hectares' | 'coffee_variety' | 'latitude' | 'longitude'> | null
  location: Pick<Location, 'id' | 'location_code' | 'name' | 'location_type' | 'region' | 'zone' | 'woreda' | 'latitude' | 'longitude' | 'altitude_meters'> | null
  quality: {
    id: string
    inspection_date: string
    sample_type: SampleType
    result: QualityResult
    approval_status: ApprovalStatus
    final_grade: string | null
    cup_score: number | null
    moisture: number | null
    defect_count: number | null
    approved_at: string | null
    inspector: string | null
  }[]
}

export interface TraceLot extends TraceLotSource {
  inventory: { warehouse: Pick<Warehouse, 'id' | 'code' | 'name' | 'location'>; quantity_kg: number; status: InventoryStatus; received_date: string | null }[]
  movements: {
    id: string
    transaction_type: TransactionType
    quantity_kg: number
    balance_after: number | null
    warehouse: string
    reference_type: string | null
    reference_id: string | null
    notes: string | null
    created_at: string
    performed_by: string | null
  }[]
  exports: {
    batch: Pick<ExportBatch, 'id' | 'batch_number' | 'status'>
    warehouse: string | null
    quantity_kg: number
    released: boolean
    order: Pick<SalesOrder, 'id' | 'order_number' | 'status' | 'destination_country' | 'destination_port'>
    customer: { company_name: string; country: string | null } | null
    shipments: Pick<Shipment, 'id' | 'shipment_number' | 'status' | 'vessel_name' | 'container_number' | 'shipping_date' | 'estimated_arrival' | 'actual_arrival'>[]
  }[]
  documents: Pick<Document, 'id' | 'title' | 'document_type'>[]
}

export interface TraceShipment {
  shipment: Pick<
    Shipment,
    'id' | 'shipment_number' | 'status' | 'vessel_name' | 'container_number' | 'carrier' | 'destination_country' | 'destination_port' | 'shipping_date' | 'estimated_arrival' | 'actual_arrival'
  >
  batch: Pick<ExportBatch, 'id' | 'batch_number' | 'status' | 'total_quantity_kg'>
  order: Pick<SalesOrder, 'id' | 'order_number' | 'status' | 'product_name' | 'quantity_kg'>
  customer: { company_name: string; country: string | null } | null
  lots: (TraceLotSource & { allocated_kg: number; warehouse: Pick<Warehouse, 'id' | 'code' | 'name' | 'location'> | null })[]
  documents: Pick<Document, 'id' | 'title' | 'document_type' | 'related_type'>[]
  updates: Pick<ShipmentUpdate, 'status' | 'description' | 'location' | 'event_time'>[]
}

// -----------------------------------------------------------------------------
// Public website submissions
// -----------------------------------------------------------------------------
export interface SubmissionResult {
  reference_number: string
  customer_code: string
  is_new_customer: boolean
}
