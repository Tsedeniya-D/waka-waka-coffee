/**
 * Allowed values, mirroring the CHECK constraints added by
 * frontend/supabase/migrations/20260925000100_schema_reconciliation.sql.
 * Which transitions between statuses are allowed lives in the database table
 * public.workflow_transitions (see services/workflow.service.js).
 */
export const QUOTE_STATUSES = ['new', 'reviewing', 'contacted', 'quoted', 'accepted', 'rejected', 'converted']
export const SAMPLE_STATUSES = [
  'new', 'reviewing', 'approved', 'preparing', 'processing', 'dispatched', 'delivered', 'completed', 'rejected', 'cancelled',
]
export const CONTACT_STATUSES = ['new', 'read', 'replied', 'closed']
export const CUSTOMER_STATUSES = ['active', 'inactive']
export const CUSTOMER_SOURCES = ['Manual', 'Quote Request', 'Sample Request', 'Contact Message']
export const ORDER_STATUSES = [
  'draft', 'confirmed', 'sent_to_export', 'export_accepted', 'processing', 'shipped', 'completed', 'cancelled',
]
export const BATCH_STATUSES = ['preparing', 'ready', 'approved', 'shipped', 'completed', 'cancelled']
export const SHIPMENT_STATUSES = ['preparing', 'booked', 'in_transit', 'arrived', 'completed', 'cancelled']
export const COLLECTION_STATUSES = ['submitted', 'verified', 'rejected', 'partially_processed', 'processed']
export const LOT_STATUSES = ['pending_quality', 'approved', 'rejected', 'in_warehouse', 'reserved', 'shipped', 'sold']
export const QUALITY_RESULTS = ['pending', 'passed', 'failed']
export const QUALITY_APPROVALS = ['pending', 'approved', 'rejected']
export const SAMPLE_TYPES = ['offer', 'pre_shipment', 'arrival', 'type_sample', 'other']
export const INVENTORY_STATUSES = ['available', 'reserved', 'shipped', 'depleted']
export const TRANSACTION_TYPES = [
  'receipt', 'issue', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out', 'export_allocation', 'export_release',
]
export const SUPPLIER_TYPES = ['farmer', 'cooperative', 'union', 'trader', 'washing_station', 'supplier', 'other']
export const LOCATION_TYPES = ['region', 'zone', 'woreda', 'kebele', 'collection_point', 'washing_station', 'port', 'other']
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'ETB', 'JPY', 'CNY', 'AED', 'SAR']
export const PRODUCT_AVAILABILITY = ['available', 'limited', 'sold_out', 'available_on_request']
export const DOCUMENT_TYPES = [
  'quotation', 'invoice', 'commercial_invoice', 'packing_list', 'certificate', 'certificate_of_origin',
  'phytosanitary_certificate', 'quality_certificate', 'bill_of_lading', 'product_specification',
  'quality_document', 'export_permit', 'contract', 'other',
]
export const DOCUMENT_RELATED_TYPES = [
  'general', 'quote_request', 'sample_request', 'customer', 'sales_order', 'export_batch', 'shipment',
  'coffee_lot', 'quality_inspection', 'warehouse', 'product', 'supplier', 'farmer', 'collection',
]
