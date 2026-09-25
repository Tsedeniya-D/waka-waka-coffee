-- =============================================================================
-- Waka Coffee — 2026-09-25 (5/5): dashboard, reports, traceability
-- =============================================================================
-- dashboard_summary / report_summary run with the CALLER's rights (security
-- invoker), so every number respects RLS and the caller's role.
-- Traceability must follow a lot across departments, so those functions run
-- with definer rights behind an explicit role check and return only the
-- fields needed to trace (customers: company name and country).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Dashboard
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_summary()
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_role text := public.current_app_role();
  v jsonb;
begin
  if v_role is null or v_role = 'user' then
    perform public.app_error('P0403', 'An active employee account is required.');
  end if;

  v := jsonb_build_object('role', v_role, 'generated_at', now());

  v := v || jsonb_build_object('notifications', jsonb_build_object(
    'unread', (select count(*) from public.notifications where user_id = auth.uid() and not is_read)));

  if v_role in ('super_admin', 'admin', 'sales', 'export_manager') then
    v := v || jsonb_build_object('customers', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where status = 'active'),
        'new_30d', count(*) filter (where created_at > now() - interval '30 days'))
      from public.customers));

    v := v || jsonb_build_object('orders', jsonb_build_object(
      'total', (select count(*) from public.sales_orders),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
                      select status, count(*) n from public.sales_orders group by status) s),
      'pending_export', (select count(*) from public.sales_orders where status = 'sent_to_export'),
      'open_kg', (select coalesce(sum(quantity_kg), 0) from public.sales_orders
                   where status not in ('completed', 'cancelled')),
      'value_by_currency', (select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'value', value)), '[]')
                              from (select coalesce(currency, 'USD') currency, sum(quantity_kg * unit_price) value
                                      from public.sales_orders
                                     where status <> 'cancelled' and unit_price is not null
                                     group by 1 order by 1) x),
      'trend', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'orders', n, 'kg', kg) order by m), '[]')
                  from (select to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*) n,
                               coalesce(sum(quantity_kg), 0) kg
                          from public.sales_orders
                         where created_at >= date_trunc('month', now()) - interval '5 months'
                           and status <> 'cancelled'
                         group by 1) t)));
  end if;

  if v_role in ('super_admin', 'admin', 'sales') then
    v := v || jsonb_build_object('quotes', jsonb_build_object(
      'total', (select count(*) from public.quote_requests),
      'new', (select count(*) from public.quote_requests where status = 'new'),
      'open', (select count(*) from public.quote_requests where status in ('new', 'reviewing', 'contacted', 'quoted', 'accepted')),
      'new_7d', (select count(*) from public.quote_requests where created_at > now() - interval '7 days'),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
                      select status, count(*) n from public.quote_requests group by status) s)));
    v := v || jsonb_build_object('samples', jsonb_build_object(
      'total', (select count(*) from public.sample_requests),
      'new', (select count(*) from public.sample_requests where status = 'new'),
      'open', (select count(*) from public.sample_requests
                where status in ('new', 'reviewing', 'approved', 'preparing', 'processing', 'dispatched')),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
                      select status, count(*) n from public.sample_requests group by status) s)));
    v := v || jsonb_build_object('contacts', jsonb_build_object(
      'unread', (select count(*) from public.contact_messages where status in ('new', 'unread'))));
  end if;

  if v_role in ('super_admin', 'admin', 'export_manager', 'sales') then
    v := v || jsonb_build_object('export', jsonb_build_object(
      'batches_active', (select count(*) from public.export_batches where status in ('preparing', 'ready', 'approved')),
      'batches_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
                              select status, count(*) n from public.export_batches group by status) s),
      'shipments_in_transit', (select count(*) from public.shipments where status = 'in_transit'),
      'shipments_active', (select count(*) from public.shipments where status in ('preparing', 'booked', 'in_transit', 'arrived')),
      'arriving_7d', (select count(*) from public.shipments
                       where status = 'in_transit' and estimated_arrival between current_date and current_date + 7),
      'shipments_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
                                select status, count(*) n from public.shipments group by status) s)));
  end if;

  if v_role in ('super_admin', 'admin', 'field_officer', 'quality_officer', 'warehouse_officer', 'export_manager') then
    v := v || jsonb_build_object('lots', jsonb_build_object(
      'total', (select count(*) from public.coffee_lots),
      'total_kg', (select coalesce(sum(quantity_kg), 0) from public.coffee_lots),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
                      select status, count(*) n from public.coffee_lots group by status) s)));
  end if;

  if v_role in ('super_admin', 'admin', 'quality_officer') then
    v := v || jsonb_build_object('quality', jsonb_build_object(
      'awaiting_inspection', (select count(*) from public.coffee_lots where status = 'pending_quality'),
      'pending_approval', (select count(*) from public.quality_inspections where approval_status = 'pending'),
      'approved_30d', (select count(*) from public.quality_inspections
                        where approval_status = 'approved' and approved_at > now() - interval '30 days'),
      'rejected_30d', (select count(*) from public.quality_inspections
                        where approval_status = 'rejected' and approved_at > now() - interval '30 days'),
      'avg_cup_score_30d', (select round(avg(cup_score), 2) from public.quality_inspections
                             where cup_score is not null and inspection_date > current_date - 30)));
  end if;

  if v_role in ('super_admin', 'admin', 'warehouse_officer', 'export_manager', 'quality_officer', 'sales') then
    v := v || jsonb_build_object('inventory', jsonb_build_object(
      'total_kg', (select coalesce(sum(quantity_kg), 0) from public.inventory),
      'low_stock', (select count(*) from public.inventory
                     where par_level_bags is not null and bag_count is not null and bag_count <= par_level_bags
                       and quantity_kg > 0),
      'awaiting_receipt', (select count(*) from public.coffee_lots where status = 'approved'),
      'by_warehouse', (select coalesce(jsonb_agg(jsonb_build_object(
                          'warehouse_id', w.id, 'name', w.name, 'code', w.code, 'capacity_kg', w.capacity_kg,
                          'stock_kg', coalesce(s.kg, 0)) order by w.name), '[]')
                         from public.warehouses w
                         left join (select warehouse_id, sum(quantity_kg) kg from public.inventory group by 1) s
                           on s.warehouse_id = w.id
                        where w.is_active)));
  end if;

  if v_role in ('super_admin', 'admin', 'field_officer') then
    v := v || jsonb_build_object('field', jsonb_build_object(
      'collections_30d', (select count(*) from public.collection_records where collection_date > current_date - 30),
      'collected_kg_30d', (select coalesce(sum(quantity_kg), 0) from public.collection_records where collection_date > current_date - 30),
      'awaiting_lots', (select count(*) from public.collection_records where status in ('submitted', 'verified', 'partially_processed')),
      'farmers', (select count(*) from public.farmers where is_active),
      'suppliers', (select count(*) from public.suppliers where is_active)));
  end if;

  return v;
end $$;
revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Reports (period filter applies to records created in the period;
--    inventory is a current snapshot)
-- -----------------------------------------------------------------------------
create or replace function public.report_summary(p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_from timestamptz := coalesce(p_from, date '1900-01-01')::timestamptz;
  v_to timestamptz := (coalesce(p_to, date '2999-12-31') + 1)::timestamptz;
  v jsonb;
begin
  if public.current_app_role() is null then
    perform public.app_error('P0403', 'An active employee account is required.');
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    perform public.app_error('P0400', 'The start date must be before the end date.');
  end if;

  with o as (select * from public.sales_orders where created_at >= v_from and created_at < v_to)
  select jsonb_build_object(
    'count', (select count(*) from o),
    'total_kg', (select coalesce(sum(quantity_kg), 0) from o where status <> 'cancelled'),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from o group by 1) s),
    'value_by_currency', (select coalesce(jsonb_agg(jsonb_build_object('currency', c, 'value', val) order by c), '[]')
                            from (select coalesce(currency, 'USD') c, sum(quantity_kg * unit_price) val
                                    from o where status <> 'cancelled' and unit_price is not null group by 1) x),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'orders', n, 'kg', kg) order by m), '[]')
                   from (select to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*) n, sum(quantity_kg) kg
                           from o where status <> 'cancelled' group by 1) t),
    'by_destination', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'orders', n, 'kg', kg) order by kg desc), '[]')
                         from (select coalesce(destination_country, 'Unspecified') country, count(*) n, sum(quantity_kg) kg
                                 from o where status <> 'cancelled' group by 1 order by 3 desc limit 10) d),
    'top_customers', (select coalesce(jsonb_agg(jsonb_build_object('customer_id', id, 'company_name', company_name,
                                                                   'country', country, 'orders', n, 'kg', kg) order by kg desc), '[]')
                        from (select c.id, c.company_name, c.country, count(*) n, sum(o.quantity_kg) kg
                                from o join public.customers c on c.id = o.customer_id
                               where o.status <> 'cancelled' group by 1, 2, 3 order by 5 desc limit 10) tc)
  ) into v;
  v := jsonb_build_object('period', jsonb_build_object('from', p_from, 'to', p_to), 'orders', v);

  v := v || jsonb_build_object('quotes', (
    with q as (select * from public.quote_requests where created_at >= v_from and created_at < v_to)
    select jsonb_build_object(
      'count', (select count(*) from q),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from q group by 1) s),
      'converted', (select count(*) from q where status = 'converted'),
      'conversion_rate', (select case when count(*) = 0 then 0
                                      else round(100.0 * count(*) filter (where status = 'converted') / count(*), 1) end from q),
      'requested_kg', (select coalesce(sum(quantity_kg), 0) from q))));

  v := v || jsonb_build_object('samples', (
    with s as (select * from public.sample_requests where created_at >= v_from and created_at < v_to)
    select jsonb_build_object(
      'count', (select count(*) from s),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from s group by 1) x),
      'dispatched', (select count(*) from s where shipped_at is not null))));

  v := v || jsonb_build_object('export_batches', (
    with b as (select * from public.export_batches where created_at >= v_from and created_at < v_to)
    select jsonb_build_object(
      'count', (select count(*) from b),
      'total_kg', (select coalesce(sum(total_quantity_kg), 0) from b where status <> 'cancelled'),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from b group by 1) x))));

  v := v || jsonb_build_object('shipments', (
    with s as (select * from public.shipments where created_at >= v_from and created_at < v_to)
    select jsonb_build_object(
      'count', (select count(*) from s),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from s group by 1) x),
      'arrived_on_time', (select count(*) from s where actual_arrival is not null and estimated_arrival is not null
                                                   and actual_arrival <= estimated_arrival),
      'arrived_late', (select count(*) from s where actual_arrival is not null and estimated_arrival is not null
                                                and actual_arrival > estimated_arrival),
      'avg_transit_days', (select round(avg(actual_arrival - shipping_date), 1) from s
                            where actual_arrival is not null and shipping_date is not null))));

  v := v || jsonb_build_object('inventory', jsonb_build_object(
    'total_kg', (select coalesce(sum(quantity_kg), 0) from public.inventory),
    'by_warehouse', (select coalesce(jsonb_agg(jsonb_build_object(
                        'warehouse_id', w.id, 'name', w.name, 'code', w.code, 'capacity_kg', w.capacity_kg,
                        'stock_kg', coalesce(s.kg, 0), 'lots', coalesce(s.lots, 0),
                        'utilisation_pct', case when w.capacity_kg > 0 then round(100 * coalesce(s.kg, 0) / w.capacity_kg, 1) end)
                        order by w.name), '[]')
                       from public.warehouses w
                       left join (select warehouse_id, sum(quantity_kg) kg, count(*) filter (where quantity_kg > 0) lots
                                    from public.inventory group by 1) s on s.warehouse_id = w.id),
    'movements', (select coalesce(jsonb_object_agg(transaction_type, kg), '{}') from (
                    select transaction_type, sum(quantity_kg) kg from public.inventory_transactions
                     where created_at >= v_from and created_at < v_to group by 1) m)));

  v := v || jsonb_build_object('lots', (
    with l as (select * from public.coffee_lots where created_at >= v_from and created_at < v_to)
    select jsonb_build_object(
      'count', (select count(*) from l),
      'total_kg', (select coalesce(sum(quantity_kg), 0) from l),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from l group by 1) x),
      'by_origin', (select coalesce(jsonb_agg(jsonb_build_object('origin', origin, 'lots', n, 'kg', kg) order by kg desc), '[]')
                      from (select origin, count(*) n, sum(quantity_kg) kg from l group by 1 order by 3 desc limit 10) x))));

  v := v || jsonb_build_object('quality', (
    with q as (select * from public.quality_inspections where inspection_date >= v_from::date and inspection_date < v_to::date)
    select jsonb_build_object(
      'inspections', (select count(*) from q),
      'passed', (select count(*) from q where result = 'passed'),
      'failed', (select count(*) from q where result = 'failed'),
      'approved', (select count(*) from q where approval_status = 'approved'),
      'rejected', (select count(*) from q where approval_status = 'rejected'),
      'pass_rate', (select case when count(*) filter (where result in ('passed', 'failed')) = 0 then 0
                                else round(100.0 * count(*) filter (where result = 'passed')
                                           / count(*) filter (where result in ('passed', 'failed')), 1) end from q),
      'avg_cup_score', (select round(avg(cup_score), 2) from q where cup_score is not null),
      'by_grade', (select coalesce(jsonb_object_agg(g, n), '{}') from (
                     select coalesce(final_grade, 'Ungraded') g, count(*) n from q group by 1) x))));

  v := v || jsonb_build_object('collections', (
    with c as (select * from public.collection_records where collection_date >= v_from::date and collection_date < v_to::date)
    select jsonb_build_object(
      'count', (select count(*) from c),
      'total_kg', (select coalesce(sum(quantity_kg), 0) from c),
      'by_region', (select coalesce(jsonb_agg(jsonb_build_object('region', r, 'collections', n, 'kg', kg) order by kg desc), '[]')
                      from (select coalesce(region, 'Unspecified') r, count(*) n, sum(quantity_kg) kg from c group by 1) x),
      'top_suppliers', (select coalesce(jsonb_agg(jsonb_build_object('supplier', name, 'kg', kg) order by kg desc), '[]')
                          from (select s.name, sum(c.quantity_kg) kg from c join public.suppliers s on s.id = c.supplier_id
                                 group by 1 order by 2 desc limit 10) x))));

  v := v || jsonb_build_object('customers', jsonb_build_object(
    'total', (select count(*) from public.customers),
    'new_in_period', (select count(*) from public.customers where created_at >= v_from and created_at < v_to),
    'by_country', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'customers', n) order by n desc), '[]')
                     from (select coalesce(country, 'Unspecified') country, count(*) n from public.customers
                            group by 1 order by 2 desc limit 10) x)));
  return v;
end $$;
revoke all on function public.report_summary(date, date) from public, anon;
grant execute on function public.report_summary(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Traceability
-- -----------------------------------------------------------------------------
create or replace function public.assert_traceability_access()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_role(array['super_admin', 'admin', 'quality_officer', 'warehouse_officer', 'export_manager']) then
    perform public.app_error('P0403', 'Your role cannot access traceability.');
  end if;
end $$;

-- Source chain of one lot: collection, supplier, farmer, farm, location, quality.
create or replace function public.trace_lot_source(p_lot_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'lot', jsonb_build_object('id', l.id, 'lot_code', l.lot_code, 'origin', l.origin, 'quantity_kg', l.quantity_kg,
                              'processing_method', l.processing_method, 'grade', l.grade, 'status', l.status,
                              'created_at', l.created_at),
    'collection', case when c.id is null then null else jsonb_build_object(
                    'id', c.id, 'collection_code', c.collection_code, 'collection_date', c.collection_date,
                    'quantity_kg', c.quantity_kg, 'origin', c.origin, 'region', c.region, 'zone', c.zone,
                    'woreda', c.woreda, 'kebele', c.kebele, 'coffee_type', c.coffee_type, 'variety', c.variety,
                    'processing_method', c.processing_method, 'status', c.status,
                    'field_officer', (select jsonb_build_object('id', p.id, 'full_name', p.full_name)
                                        from public.profiles p where p.id = c.field_officer_id)) end,
    'supplier', (select jsonb_build_object('id', s.id, 'supplier_code', s.supplier_code, 'name', s.name,
                                           'supplier_type', s.supplier_type, 'region', s.region, 'zone', s.zone,
                                           'woreda', s.woreda, 'kebele', s.kebele)
                   from public.suppliers s where s.id = l.supplier_id),
    'farmer', (select jsonb_build_object('id', f.id, 'farmer_code', f.farmer_code, 'name', f.name, 'region', f.region,
                                         'zone', f.zone, 'woreda', f.woreda, 'kebele', f.kebele)
                 from public.farmers f where f.id = c.farmer_id),
    'farm', (select jsonb_build_object('id', fm.id, 'farm_code', fm.farm_code, 'farm_name', fm.farm_name,
                                       'region', fm.region, 'zone', fm.zone, 'woreda', fm.woreda, 'kebele', fm.kebele,
                                       'altitude_meters', fm.altitude_meters, 'area_hectares', fm.area_hectares,
                                       'coffee_variety', fm.coffee_variety, 'latitude', fm.latitude, 'longitude', fm.longitude)
               from public.farms fm where fm.id = c.farm_id),
    'location', (select jsonb_build_object('id', lo.id, 'location_code', lo.location_code, 'name', lo.name,
                                           'location_type', lo.location_type, 'region', lo.region, 'zone', lo.zone,
                                           'woreda', lo.woreda, 'latitude', lo.latitude, 'longitude', lo.longitude,
                                           'altitude_meters', lo.altitude_meters)
                   from public.locations lo
                  where lo.id = coalesce(c.location_id, (select location_id from public.farms where id = c.farm_id))),
    'quality', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', q.id, 'inspection_date', q.inspection_date, 'sample_type', q.sample_type, 'result', q.result,
                    'approval_status', q.approval_status, 'final_grade', q.final_grade, 'cup_score', q.cup_score,
                    'moisture', q.moisture, 'defect_count', q.defect_count, 'approved_at', q.approved_at,
                    'inspector', (select full_name from public.profiles where id = q.inspector_id))
                    order by q.inspection_date desc, q.created_at desc), '[]')
                  from public.quality_inspections q where q.lot_id = l.id)
  )
  from public.coffee_lots l
  left join public.collection_records c on c.id = l.collection_id
  where l.id = p_lot_id;
$$;
revoke all on function public.trace_lot_source(uuid) from public, anon, authenticated;

create or replace function public.trace_lot(p_lot_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.assert_traceability_access();
  v := public.trace_lot_source(p_lot_id);
  if v is null then
    perform public.app_error('P0404', 'Coffee lot not found.');
  end if;

  v := v || jsonb_build_object(
    'inventory', (select coalesce(jsonb_agg(jsonb_build_object(
                    'warehouse', jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name, 'location', w.location),
                    'quantity_kg', i.quantity_kg, 'status', i.status, 'received_date', i.received_date)
                    order by w.name), '[]')
                  from public.inventory i join public.warehouses w on w.id = i.warehouse_id
                  where i.lot_id = p_lot_id),
    'movements', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', t.id, 'transaction_type', t.transaction_type, 'quantity_kg', t.quantity_kg,
                    'balance_after', t.balance_after, 'warehouse', w.name, 'reference_type', t.reference_type,
                    'reference_id', t.reference_id, 'notes', t.notes, 'created_at', t.created_at,
                    'performed_by', (select full_name from public.profiles where id = t.performed_by))
                    order by t.created_at), '[]')
                  from public.inventory_transactions t join public.warehouses w on w.id = t.warehouse_id
                  where t.lot_id = p_lot_id),
    'exports', (select coalesce(jsonb_agg(jsonb_build_object(
                  'batch', jsonb_build_object('id', b.id, 'batch_number', b.batch_number, 'status', b.status),
                  'warehouse', (select name from public.warehouses where id = bl.warehouse_id),
                  'quantity_kg', bl.quantity_kg, 'released', bl.released_at is not null,
                  'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status,
                                              'destination_country', o.destination_country,
                                              'destination_port', o.destination_port),
                  'customer', (select jsonb_build_object('company_name', cu.company_name, 'country', cu.country)
                                 from public.customers cu where cu.id = o.customer_id),
                  'shipments', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'id', s.id, 'shipment_number', s.shipment_number, 'status', s.status,
                                   'vessel_name', s.vessel_name, 'container_number', s.container_number,
                                   'shipping_date', s.shipping_date, 'estimated_arrival', s.estimated_arrival,
                                   'actual_arrival', s.actual_arrival) order by s.created_at), '[]')
                                  from public.shipments s where s.export_batch_id = b.id))
                  order by bl.created_at), '[]')
                from public.export_batch_lots bl
                join public.export_batches b on b.id = bl.export_batch_id
                join public.sales_orders o on o.id = b.sales_order_id
                where bl.lot_id = p_lot_id),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title,
                                                               'document_type', d.document_type) order by d.created_at), '[]')
                    from public.documents d where d.related_type = 'coffee_lot' and d.related_id = p_lot_id));
  return v;
end $$;

-- Backward trace from a shipment to every source lot.
create or replace function public.trace_shipment(p_shipment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ship public.shipments;
  v_batch public.export_batches;
  v_order public.sales_orders;
begin
  perform public.assert_traceability_access();
  select * into v_ship from public.shipments where id = p_shipment_id;
  if not found then
    perform public.app_error('P0404', 'Shipment not found.');
  end if;
  select * into v_batch from public.export_batches where id = v_ship.export_batch_id;
  select * into v_order from public.sales_orders where id = v_batch.sales_order_id;

  return jsonb_build_object(
    'shipment', jsonb_build_object('id', v_ship.id, 'shipment_number', v_ship.shipment_number, 'status', v_ship.status,
                                   'vessel_name', v_ship.vessel_name, 'container_number', v_ship.container_number,
                                   'carrier', v_ship.carrier, 'destination_country', v_ship.destination_country,
                                   'destination_port', v_ship.destination_port, 'shipping_date', v_ship.shipping_date,
                                   'estimated_arrival', v_ship.estimated_arrival, 'actual_arrival', v_ship.actual_arrival),
    'batch', jsonb_build_object('id', v_batch.id, 'batch_number', v_batch.batch_number, 'status', v_batch.status,
                                'total_quantity_kg', v_batch.total_quantity_kg),
    'order', jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status,
                                'product_name', v_order.product_name, 'quantity_kg', v_order.quantity_kg),
    'customer', (select jsonb_build_object('company_name', company_name, 'country', country)
                   from public.customers where id = v_order.customer_id),
    'lots', (select coalesce(jsonb_agg(public.trace_lot_source(bl.lot_id) || jsonb_build_object(
                'allocated_kg', bl.quantity_kg,
                'warehouse', (select jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name, 'location', w.location)
                                from public.warehouses w where w.id = bl.warehouse_id))
                order by bl.created_at), '[]')
             from public.export_batch_lots bl where bl.export_batch_id = v_batch.id and bl.released_at is null),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title,
                                                               'document_type', d.document_type, 'related_type', d.related_type)
                                            order by d.created_at), '[]')
                    from public.documents d
                   where (d.related_type = 'shipment' and d.related_id = v_ship.id)
                      or (d.related_type = 'export_batch' and d.related_id = v_batch.id)
                      or (d.related_type = 'sales_order' and d.related_id = v_order.id)),
    'updates', (select coalesce(jsonb_agg(jsonb_build_object('status', u.status, 'description', u.description,
                                                             'location', u.location, 'event_time', u.event_time)
                                          order by u.event_time), '[]')
                  from public.shipment_updates u where u.shipment_id = v_ship.id)
  );
end $$;

-- Find traceable records by any code.
create or replace function public.trace_search(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text := '%' || replace(replace(coalesce(btrim(p_query), ''), '%', ''), '_', '\_') || '%';
begin
  perform public.assert_traceability_access();
  if length(btrim(coalesce(p_query, ''))) < 2 then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(x order by x ->> 'type', x ->> 'code'), '[]') from (
      select jsonb_build_object('type', 'lot', 'id', id, 'code', lot_code, 'label', origin, 'status', status) x
        from public.coffee_lots where lot_code ilike v_q or origin ilike v_q
      union all
      select jsonb_build_object('type', 'shipment', 'id', id, 'code', shipment_number,
                                'label', concat_ws(' ', vessel_name, container_number), 'status', status)
        from public.shipments where shipment_number ilike v_q or container_number ilike v_q
                                 or booking_reference ilike v_q or bill_of_lading_number ilike v_q
      union all
      select jsonb_build_object('type', 'export_batch', 'id', id, 'code', batch_number, 'label', null, 'status', status)
        from public.export_batches where batch_number ilike v_q
      union all
      select jsonb_build_object('type', 'sales_order', 'id', id, 'code', order_number, 'label', product_name, 'status', status)
        from public.sales_orders where order_number ilike v_q
      union all
      select jsonb_build_object('type', 'collection', 'id', id, 'code', collection_code, 'label', origin, 'status', status)
        from public.collection_records where collection_code ilike v_q
      limit 50
    ) s
  );
end $$;

-- Lots matching a free-text search across the whole chain.
create or replace function public.trace_lot_matches(p_search text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select l.id
    from public.coffee_lots l
    left join public.collection_records c on c.id = l.collection_id
    left join public.suppliers s on s.id = l.supplier_id
    left join public.farmers f on f.id = c.farmer_id
   where nullif(btrim(coalesce(p_search, '')), '') is null
      or l.lot_code ilike '%' || btrim(p_search) || '%'
      or l.origin ilike '%' || btrim(p_search) || '%'
      or s.name ilike '%' || btrim(p_search) || '%'
      or f.name ilike '%' || btrim(p_search) || '%'
      or c.collection_code ilike '%' || btrim(p_search) || '%'
      or exists (
        select 1
          from public.export_batch_lots bl
          join public.export_batches eb on eb.id = bl.export_batch_id
          left join public.shipments sh on sh.export_batch_id = eb.id
          left join public.sales_orders o on o.id = eb.sales_order_id
          left join public.customers cu on cu.id = o.customer_id
         where bl.lot_id = l.id
           and (eb.batch_number ilike '%' || btrim(p_search) || '%'
                or sh.shipment_number ilike '%' || btrim(p_search) || '%'
                or sh.container_number ilike '%' || btrim(p_search) || '%'
                or o.order_number ilike '%' || btrim(p_search) || '%'
                or cu.company_name ilike '%' || btrim(p_search) || '%'));
$$;
revoke all on function public.trace_lot_matches(text) from public, anon, authenticated;

-- One row per lot with its whole chain summarised (overview table).
create or replace function public.trace_overview(p_search text default null, p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_total bigint;
begin
  perform public.assert_traceability_access();

  select count(*) into v_total from public.trace_lot_matches(p_search);

  select coalesce(jsonb_agg(x.row order by x.created_at desc), '[]') into v_rows
  from (
    select l.created_at, jsonb_build_object(
        'lot_id', l.id, 'lot_code', l.lot_code, 'origin', l.origin, 'grade', l.grade,
        'processing_method', l.processing_method, 'quantity_kg', l.quantity_kg, 'status', l.status,
        'collection_code', c.collection_code, 'collection_date', c.collection_date, 'region', c.region,
        'supplier_name', s.name, 'farmer_name', f.name, 'farm_name', fm.farm_name,
        'quality', (select jsonb_build_object('result', q.result, 'approval_status', q.approval_status,
                                              'final_grade', q.final_grade, 'cup_score', q.cup_score,
                                              'inspection_date', q.inspection_date)
                      from public.quality_inspections q where q.lot_id = l.id
                     order by q.inspection_date desc, q.created_at desc limit 1),
        'inventory_kg', (select coalesce(sum(quantity_kg), 0) from public.inventory where lot_id = l.id),
        'warehouses', (select coalesce(jsonb_agg(distinct w.name), '[]') from public.inventory i
                         join public.warehouses w on w.id = i.warehouse_id where i.lot_id = l.id and i.quantity_kg > 0),
        'batches', (select coalesce(jsonb_agg(jsonb_build_object(
                       'batch_number', eb.batch_number, 'status', eb.status, 'quantity_kg', bl.quantity_kg,
                       'order_number', o.order_number, 'customer', cu.company_name, 'country', o.destination_country,
                       'shipments', (select coalesce(jsonb_agg(jsonb_build_object('shipment_number', sh.shipment_number,
                                                                                  'status', sh.status)), '[]')
                                       from public.shipments sh where sh.export_batch_id = eb.id))), '[]')
                      from public.export_batch_lots bl
                      join public.export_batches eb on eb.id = bl.export_batch_id
                      join public.sales_orders o on o.id = eb.sales_order_id
                      left join public.customers cu on cu.id = o.customer_id
                     where bl.lot_id = l.id and bl.released_at is null)
      ) as row
    from public.coffee_lots l
    left join public.collection_records c on c.id = l.collection_id
    left join public.suppliers s on s.id = l.supplier_id
    left join public.farmers f on f.id = c.farmer_id
    left join public.farms fm on fm.id = c.farm_id
    where l.id in (select public.trace_lot_matches(p_search))
    order by l.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
  ) x;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

revoke all on function public.trace_lot(uuid) from public, anon;
revoke all on function public.trace_shipment(uuid) from public, anon;
revoke all on function public.trace_search(text) from public, anon;
revoke all on function public.trace_overview(text, int, int) from public, anon;
grant execute on function public.trace_lot(uuid) to authenticated;
grant execute on function public.trace_shipment(uuid) to authenticated;
grant execute on function public.trace_search(text) to authenticated;
grant execute on function public.trace_overview(text, int, int) to authenticated;
