import { createResourceService } from '../lib/resource.js'
import { attachProfiles } from '../lib/profiles.js'
import { getById } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'

const activeFilter = (q) => (q.status ? q.status === 'active' : undefined)

// -----------------------------------------------------------------------------
// Suppliers
// -----------------------------------------------------------------------------
export const suppliers = createResourceService({
  table: 'suppliers',
  label: 'Supplier',
  searchColumns: ['name', 'supplier_code', 'contact_person', 'phone', 'woreda', 'kebele'],
  filters: (q) => ({ is_active: activeFilter(q), supplier_type: q.supplier_type, region: q.region }),
  beforeCreate: (_db, body, auth) => ({ ...body, created_by: auth.userId }),
})

/** Supplier with the farmers linked to it and what it supplied. */
suppliers.getDetail = async (db, id) => {
  const supplier = await suppliers.get(db, id)
  const [farmers, collections, lots] = await Promise.all([
    db.from('farmers').select('id, farmer_code, name, phone, woreda, kebele, is_active').eq('supplier_id', id).order('name'),
    db
      .from('collection_records')
      .select('id, collection_code, collection_date, origin, quantity_kg, status')
      .eq('supplier_id', id)
      .order('collection_date', { ascending: false })
      .limit(100),
    db
      .from('coffee_lots')
      .select('id, lot_code, origin, quantity_kg, grade, status, created_at')
      .eq('supplier_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  const collectionRows = unwrap(collections, 'Loading supplier collections')
  return {
    ...supplier,
    farmers: unwrap(farmers, 'Loading supplier farmers'),
    collections: collectionRows,
    lots: unwrap(lots, 'Loading supplier lots'),
    totals: {
      collections: collectionRows.length,
      collected_kg: collectionRows.reduce((s, c) => s + Number(c.quantity_kg || 0), 0),
    },
  }
}

// -----------------------------------------------------------------------------
// Farmers
// -----------------------------------------------------------------------------
export const farmers = createResourceService({
  table: 'farmers',
  label: 'Farmer',
  select: '*, supplier:suppliers(id, supplier_code, name)',
  searchColumns: ['name', 'farmer_code', 'phone', 'woreda', 'kebele'],
  filters: (q) => ({ is_active: activeFilter(q), region: q.region, supplier_id: q.supplier_id }),
  beforeCreate: (_db, body, auth) => ({ ...body, created_by: auth.userId }),
})

/** Farmer with farms and collection history. */
farmers.getDetail = async (db, id) => {
  const farmer = await farmers.get(db, id)
  const [farms, collections] = await Promise.all([
    db.from('farms').select('*').eq('farmer_id', id).order('farm_name'),
    db
      .from('collection_records')
      .select('id, collection_code, collection_date, origin, quantity_kg, status, supplier:suppliers(id, name), farm_id')
      .eq('farmer_id', id)
      .order('collection_date', { ascending: false })
      .limit(200),
  ])
  const history = unwrap(collections, 'Loading collection history')
  return {
    ...farmer,
    farms: unwrap(farms, 'Loading farms'),
    collections: history,
    totals: {
      collections: history.length,
      collected_kg: history.reduce((s, c) => s + Number(c.quantity_kg || 0), 0),
    },
  }
}

// -----------------------------------------------------------------------------
// Farms
// -----------------------------------------------------------------------------
export const farms = createResourceService({
  table: 'farms',
  label: 'Farm',
  select: '*, farmer:farmers(id, farmer_code, name), location:locations(id, location_code, name)',
  searchColumns: ['farm_name', 'farm_code', 'woreda', 'kebele', 'coffee_variety'],
  filters: (q) => ({ is_active: activeFilter(q), farmer_id: q.farmer_id, region: q.region }),
  beforeCreate: (_db, body, auth) => ({ ...body, created_by: auth.userId }),
})

// -----------------------------------------------------------------------------
// Locations (regions, collection points, washing stations, ports)
// -----------------------------------------------------------------------------
export const locations = createResourceService({
  table: 'locations',
  label: 'Location',
  select: '*, parent:locations!parent_id(id, name, location_type)',
  searchColumns: ['name', 'location_code', 'region', 'zone', 'woreda', 'kebele'],
  filters: (q) => ({
    is_active: activeFilter(q),
    location_type: q.location_type,
    parent_id: q.parent_id,
    region: q.region,
  }),
  beforeCreate: (_db, body, auth) => ({ ...body, created_by: auth.userId }),
})

locations.getDetail = async (db, id) => {
  const location = await getById(db, 'locations', id, '*, parent:locations!parent_id(id, name, location_type)', 'Location')
  const [children, collections, warehouses] = await Promise.all([
    db.from('locations').select('id, location_code, name, location_type, is_active').eq('parent_id', id).order('name'),
    db
      .from('collection_records')
      .select('id, collection_code, collection_date, quantity_kg, status')
      .eq('location_id', id)
      .order('collection_date', { ascending: false })
      .limit(100),
    db.from('warehouses').select('id, code, name, is_active').eq('location_id', id),
  ])
  return {
    ...location,
    children: unwrap(children, 'Loading sub-locations'),
    collections: unwrap(collections, 'Loading collections'),
    warehouses: unwrap(warehouses, 'Loading warehouses'),
  }
}

export { attachProfiles }
