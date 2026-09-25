-- =============================================================================
-- Waka Coffee — 2026-09-25 (3/5): business workflows
-- =============================================================================
-- Customer/Buyer -> Quote Request -> Sales Review -> Sales Order (draft)
--   -> Send to Export -> Export Manager accepts -> Export Batch -> Shipment
-- Farmer/Supplier -> Collection -> Coffee Lot -> Quality -> Warehouse/Inventory
--   -> Export Batch
-- Sample requests are a separate workflow and never become sales orders.
--
-- Rules live here so they hold for every client (API, SQL editor, PostgREST):
--   * workflow_transitions is the single list of allowed status changes; the
--     API reads the same table to validate early and to build UI options.
--   * quantities can never go negative or exceed their source.
--   * reference numbers come from public.next_document_code (race-free).
-- =============================================================================

-- Drop every overload of the functions redefined below (the deployed database
-- has signatures that differ from earlier SQL files).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'submit_quote_request', 'submit_sample_request', 'submit_contact_message', 'subscribe_newsletter',
      'upsert_customer_from_request', 'link_request_customer', 'convert_quote_to_order',
      'send_order_to_export', 'accept_export_order', 'admin_create_employee_user',
      'inventory_receive', 'inventory_adjust', 'inventory_issue', 'inventory_transfer',
      'create_export_batch', 'set_export_batch_status', 'refresh_lot_stock_status',
      'refresh_collection_status'
    )
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Allowed status transitions
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_transitions (
  entity text not null,
  from_status text not null,
  to_status text not null,
  roles text[] not null default '{}',   -- canonical roles; admins are always allowed
  is_manual boolean not null default true, -- false: only workflow functions may do it
  label text,
  primary key (entity, from_status, to_status)
);
alter table public.workflow_transitions enable row level security;
drop policy if exists workflow_transitions_read on public.workflow_transitions;
create policy workflow_transitions_read on public.workflow_transitions for select to authenticated
  using (public.is_employee());
revoke insert, update, delete on public.workflow_transitions from anon, authenticated;
revoke all on public.workflow_transitions from anon;

delete from public.workflow_transitions;
insert into public.workflow_transitions (entity, from_status, to_status, roles, is_manual, label) values
  -- Quote requests (Sales)
  ('quote_request', 'new',       'reviewing', '{sales}', true, 'Start review'),
  ('quote_request', 'new',       'contacted', '{sales}', true, 'Mark contacted'),
  ('quote_request', 'new',       'quoted',    '{sales}', true, 'Mark quoted'),
  ('quote_request', 'new',       'rejected',  '{sales}', true, 'Reject'),
  ('quote_request', 'reviewing', 'contacted', '{sales}', true, 'Mark contacted'),
  ('quote_request', 'reviewing', 'quoted',    '{sales}', true, 'Mark quoted'),
  ('quote_request', 'reviewing', 'rejected',  '{sales}', true, 'Reject'),
  ('quote_request', 'contacted', 'reviewing', '{sales}', true, 'Back to review'),
  ('quote_request', 'contacted', 'quoted',    '{sales}', true, 'Mark quoted'),
  ('quote_request', 'contacted', 'rejected',  '{sales}', true, 'Reject'),
  ('quote_request', 'quoted',    'accepted',  '{sales}', true, 'Customer accepted'),
  ('quote_request', 'quoted',    'contacted', '{sales}', true, 'Renegotiate'),
  ('quote_request', 'quoted',    'rejected',  '{sales}', true, 'Reject'),
  ('quote_request', 'accepted',  'quoted',    '{sales}', true, 'Reopen quotation'),
  ('quote_request', 'accepted',  'rejected',  '{sales}', true, 'Reject'),
  ('quote_request', 'accepted',  'converted', '{sales}', false, 'Converted to sales order'),
  ('quote_request', 'rejected',  'reviewing', '{sales}', true, 'Reopen'),
  -- Sample requests (Sales) — never create sales orders
  ('sample_request', 'new',        'reviewing',  '{sales}', true, 'Start review'),
  ('sample_request', 'new',        'approved',   '{sales}', true, 'Approve'),
  ('sample_request', 'new',        'rejected',   '{sales}', true, 'Reject'),
  ('sample_request', 'new',        'cancelled',  '{sales}', true, 'Cancel'),
  ('sample_request', 'reviewing',  'approved',   '{sales}', true, 'Approve'),
  ('sample_request', 'reviewing',  'rejected',   '{sales}', true, 'Reject'),
  ('sample_request', 'reviewing',  'cancelled',  '{sales}', true, 'Cancel'),
  ('sample_request', 'approved',   'preparing',  '{sales}', true, 'Start preparing'),
  ('sample_request', 'approved',   'cancelled',  '{sales}', true, 'Cancel'),
  ('sample_request', 'processing', 'preparing',  '{sales}', true, 'Start preparing'),
  ('sample_request', 'processing', 'dispatched', '{sales}', true, 'Dispatch'),
  ('sample_request', 'processing', 'cancelled',  '{sales}', true, 'Cancel'),
  ('sample_request', 'preparing',  'dispatched', '{sales}', true, 'Dispatch'),
  ('sample_request', 'preparing',  'cancelled',  '{sales}', true, 'Cancel'),
  ('sample_request', 'dispatched', 'delivered',  '{sales}', true, 'Mark delivered'),
  ('sample_request', 'delivered',  'completed',  '{sales}', true, 'Complete'),
  ('sample_request', 'rejected',   'reviewing',  '{sales}', true, 'Reopen'),
  -- Sales orders
  ('sales_order', 'draft',           'confirmed',       '{sales}', true, 'Confirm'),
  ('sales_order', 'confirmed',       'draft',           '{sales}', true, 'Back to draft'),
  ('sales_order', 'draft',           'sent_to_export',  '{sales}', true, 'Send to Export'),
  ('sales_order', 'confirmed',       'sent_to_export',  '{sales}', true, 'Send to Export'),
  ('sales_order', 'sent_to_export',  'export_accepted', '{export_manager}', true, 'Accept order'),
  ('sales_order', 'sent_to_export',  'confirmed',       '{export_manager}', true, 'Return to Sales'),
  ('sales_order', 'export_accepted', 'processing',      '{export_manager}', false, 'Export batch created'),
  ('sales_order', 'processing',      'export_accepted', '{export_manager}', false, 'All batches cancelled'),
  ('sales_order', 'processing',      'shipped',         '{export_manager}', false, 'Shipment departed'),
  ('sales_order', 'shipped',         'completed',       '{export_manager}', false, 'Shipment completed'),
  ('sales_order', 'draft',           'cancelled',       '{sales}', true, 'Cancel'),
  ('sales_order', 'confirmed',       'cancelled',       '{sales}', true, 'Cancel'),
  ('sales_order', 'sent_to_export',  'cancelled',       '{sales,export_manager}', true, 'Cancel'),
  ('sales_order', 'export_accepted', 'cancelled',       '{export_manager}', true, 'Cancel'),
  -- Export batches (cancellation releases stock -> set_export_batch_status)
  ('export_batch', 'preparing', 'ready',     '{export_manager}', true, 'Mark ready'),
  ('export_batch', 'ready',     'preparing', '{export_manager}', true, 'Back to preparing'),
  ('export_batch', 'ready',     'approved',  '{export_manager}', true, 'Approve for shipment'),
  ('export_batch', 'approved',  'ready',     '{export_manager}', true, 'Withdraw approval'),
  ('export_batch', 'preparing', 'cancelled', '{export_manager}', false, 'Cancel batch'),
  ('export_batch', 'ready',     'cancelled', '{export_manager}', false, 'Cancel batch'),
  ('export_batch', 'approved',  'cancelled', '{export_manager}', false, 'Cancel batch'),
  ('export_batch', 'ready',     'shipped',   '{export_manager}', false, 'Shipment departed'),
  ('export_batch', 'approved',  'shipped',   '{export_manager}', false, 'Shipment departed'),
  ('export_batch', 'shipped',   'completed', '{export_manager}', false, 'Shipment completed'),
  -- Shipments
  ('shipment', 'preparing',  'booked',     '{export_manager}', true, 'Booked'),
  ('shipment', 'booked',     'preparing',  '{export_manager}', true, 'Back to preparing'),
  ('shipment', 'preparing',  'in_transit', '{export_manager}', true, 'Departed'),
  ('shipment', 'booked',     'in_transit', '{export_manager}', true, 'Departed'),
  ('shipment', 'in_transit', 'arrived',    '{export_manager}', true, 'Arrived'),
  ('shipment', 'arrived',    'completed',  '{export_manager}', true, 'Complete'),
  ('shipment', 'preparing',  'cancelled',  '{export_manager}', true, 'Cancel'),
  ('shipment', 'booked',     'cancelled',  '{export_manager}', true, 'Cancel'),
  -- Collections (Field)
  ('collection', 'submitted',           'verified',            '{field_officer}', true, 'Verify'),
  ('collection', 'submitted',           'rejected',            '{field_officer}', true, 'Reject'),
  ('collection', 'verified',            'rejected',            '{field_officer}', true, 'Reject'),
  ('collection', 'rejected',            'submitted',           '{field_officer}', true, 'Reopen'),
  ('collection', 'submitted',           'partially_processed', '{field_officer}', false, 'Lot created'),
  ('collection', 'verified',            'partially_processed', '{field_officer}', false, 'Lot created'),
  ('collection', 'submitted',           'processed',           '{field_officer}', false, 'Fully lotted'),
  ('collection', 'verified',            'processed',           '{field_officer}', false, 'Fully lotted'),
  ('collection', 'partially_processed', 'processed',           '{field_officer}', false, 'Fully lotted'),
  ('collection', 'processed',           'partially_processed', '{field_officer}', false, 'Lot removed'),
  ('collection', 'partially_processed', 'verified',            '{field_officer}', false, 'Lots removed'),
  ('collection', 'processed',           'verified',            '{field_officer}', false, 'Lots removed'),
  -- Coffee lots: always system-driven (quality approval, receipt, allocation, shipping)
  ('coffee_lot', 'pending_quality', 'approved',        '{quality_officer}', false, 'Quality approved'),
  ('coffee_lot', 'pending_quality', 'rejected',        '{quality_officer}', false, 'Quality rejected'),
  ('coffee_lot', 'rejected',        'approved',        '{quality_officer}', false, 'Re-inspected: approved'),
  ('coffee_lot', 'approved',        'rejected',        '{quality_officer}', false, 'Re-inspected: rejected'),
  ('coffee_lot', 'approved',        'pending_quality', '{quality_officer}', false, 'Approval withdrawn'),
  ('coffee_lot', 'rejected',        'pending_quality', '{quality_officer}', false, 'Rejection withdrawn'),
  ('coffee_lot', 'approved',        'in_warehouse',    '{warehouse_officer}', false, 'Received into warehouse'),
  ('coffee_lot', 'in_warehouse',    'reserved',        '{export_manager}', false, 'Allocated to export'),
  ('coffee_lot', 'reserved',        'in_warehouse',    '{export_manager}', false, 'Allocation released'),
  ('coffee_lot', 'reserved',        'shipped',         '{export_manager}', false, 'Shipped'),
  ('coffee_lot', 'in_warehouse',    'shipped',         '{export_manager}', false, 'Shipped'),
  ('coffee_lot', 'shipped',         'in_warehouse',    '{export_manager}', false, 'Stock returned'),
  ('coffee_lot', 'shipped',         'reserved',        '{export_manager}', false, 'Stock returned');

create or replace function public.enforce_status_transition()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entity text := tg_argv[0];
  v_from text := to_jsonb(old) ->> 'status';
  v_to text := to_jsonb(new) ->> 'status';
  v_rule public.workflow_transitions;
  v_label text := replace(tg_argv[0], '_', ' ');
begin
  if v_from is not distinct from v_to then
    return new;
  end if;
  if auth.uid() is null or public.in_workflow() then
    return new;
  end if;

  select * into v_rule from public.workflow_transitions
   where entity = v_entity and from_status = v_from and to_status = v_to;

  if not found then
    perform public.app_error('P0409', format('Invalid %s status change: %s -> %s.', v_label, coalesce(v_from, 'none'), v_to));
  end if;
  if not v_rule.is_manual then
    perform public.app_error('P0409', format('The %s status "%s" is set automatically by the workflow and cannot be chosen manually.', v_label, v_to));
  end if;
  if not public.is_role(v_rule.roles || array['admin', 'super_admin']) then
    perform public.app_error('P0403', format('Your role cannot move a %s from %s to %s.', v_label, v_from, v_to));
  end if;
  return new;
end $$;

do $$
declare
  pair text[];
begin
  foreach pair slice 1 in array array[
    array['quote_requests', 'quote_request'],
    array['sample_requests', 'sample_request'],
    array['sales_orders', 'sales_order'],
    array['export_batches', 'export_batch'],
    array['shipments', 'shipment'],
    array['collection_records', 'collection'],
    array['coffee_lots', 'coffee_lot']
  ] loop
    execute format('drop trigger if exists bb_enforce_status on public.%I', pair[1]);
    execute format('create trigger bb_enforce_status before update of status on public.%I for each row execute function public.enforce_status_transition(%L)', pair[1], pair[2]);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Customers from public requests
-- -----------------------------------------------------------------------------
create or replace function public.valid_email(p_email text)
returns boolean language sql immutable as $$
  select p_email ~* '^[A-Z0-9._%+''-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' and length(p_email) <= 254;
$$;

create or replace function public.upsert_customer_from_request(
  p_email text,
  p_company_name text,
  p_contact_person text default null,
  p_phone text default null,
  p_country text default null,
  p_address text default null,
  p_destination_port text default null,
  p_source text default 'Manual'
) returns table (customer_id uuid, customer_code text, is_new boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_found record;
begin
  if not public.valid_email(v_email) then
    perform public.app_error('P0400', 'A valid email address is required.');
  end if;

  -- Serialise concurrent submissions for the same email.
  perform pg_advisory_xact_lock(('x' || substr(md5(v_email), 1, 16))::bit(64)::bigint);

  select c.id, c.customer_code into v_found
    from public.customers c
   where lower(c.email) = v_email
   order by c.created_at
   limit 1;

  if found then
    -- Fill gaps only; never overwrite what the customer record already has.
    update public.customers c
       set contact_person   = coalesce(nullif(c.contact_person, ''), nullif(btrim(p_contact_person), '')),
           phone            = coalesce(nullif(c.phone, ''), nullif(btrim(p_phone), '')),
           country          = coalesce(nullif(c.country, ''), nullif(btrim(p_country), '')),
           address          = coalesce(nullif(c.address, ''), nullif(btrim(p_address), '')),
           destination_port = coalesce(nullif(c.destination_port, ''), nullif(btrim(p_destination_port), ''))
     where c.id = v_found.id;
    customer_id := v_found.id;
    customer_code := v_found.customer_code;
    is_new := false;
    return next;
    return;
  end if;

  insert into public.customers (company_name, contact_person, email, phone, country, address,
                                destination_port, status, source)
  values (
    coalesce(nullif(btrim(p_company_name), ''), split_part(v_email, '@', 1)),
    nullif(btrim(p_contact_person), ''),
    v_email,
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_country), ''),
    nullif(btrim(p_address), ''),
    nullif(btrim(p_destination_port), ''),
    'active',
    coalesce(nullif(btrim(p_source), ''), 'Manual')
  )
  returning customers.id, customers.customer_code into customer_id, customer_code;
  is_new := true;
  return next;
end $$;
revoke all on function public.upsert_customer_from_request(text, text, text, text, text, text, text, text) from public, anon, authenticated;

-- Simple abuse throttle for anonymous forms (the API also rate-limits per IP).
create or replace function public.assert_submission_rate(p_table text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_recent int;
begin
  execute format('select count(*) from public.%I where lower(email) = $1 and created_at > now() - interval ''10 minutes''', p_table)
    into v_recent using lower(btrim(p_email));
  if v_recent >= 5 then
    perform public.app_error('P0429', 'Too many submissions from this email address. Please try again later.');
  end if;
end $$;
revoke all on function public.assert_submission_rate(text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Public website submissions (called by the API with the anon key)
-- -----------------------------------------------------------------------------
create or replace function public.submit_quote_request(
  p_full_name text,
  p_company text,
  p_email text,
  p_phone text default null,
  p_country text default null,
  p_destination_port text default null,
  p_product_name text default null,
  p_region_name text default null,
  p_grade text default null,
  p_processing text default null,
  p_quantity_kg numeric default null,
  p_packaging text default null,
  p_certifications text[] default null,
  p_target_shipment text default null,
  p_message text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_customer record;
  v_quote public.quote_requests;
begin
  if coalesce(length(btrim(p_full_name)), 0) < 2 then
    perform public.app_error('P0400', 'Full name is required.');
  end if;
  if coalesce(length(btrim(p_company)), 0) < 2 then
    perform public.app_error('P0400', 'Company is required.');
  end if;
  if not public.valid_email(v_email) then
    perform public.app_error('P0400', 'A valid email address is required.');
  end if;
  if p_quantity_kg is not null and p_quantity_kg <= 0 then
    perform public.app_error('P0400', 'Quantity must be greater than 0.');
  end if;
  perform public.assert_submission_rate('quote_requests', v_email);

  select * into v_customer from public.upsert_customer_from_request(
    v_email, p_company, p_full_name, p_phone, p_country, null, p_destination_port, 'Quote Request');

  insert into public.quote_requests (
    full_name, company, email, phone, country, destination_port, product_name, region_name,
    grade, processing, quantity_kg, packaging, certifications, target_shipment, message, status, customer_id
  ) values (
    btrim(p_full_name), btrim(p_company), v_email,
    nullif(btrim(p_phone), ''), nullif(btrim(p_country), ''), nullif(btrim(p_destination_port), ''),
    nullif(btrim(p_product_name), ''), nullif(btrim(p_region_name), ''), nullif(btrim(p_grade), ''),
    nullif(btrim(p_processing), ''), p_quantity_kg, nullif(btrim(p_packaging), ''),
    nullif(p_certifications, '{}'), nullif(btrim(p_target_shipment), ''), nullif(btrim(p_message), ''),
    'new', v_customer.customer_id
  ) returning * into v_quote;

  -- Seed the quotation with the requested line so Sales can price it.
  if v_quote.product_name is not null and v_quote.quantity_kg is not null then
    insert into public.quote_items (quote_request_id, description, grade, processing_method, quantity_kg)
    values (v_quote.id,
            concat_ws(' — ', v_quote.product_name, v_quote.region_name),
            v_quote.grade, v_quote.processing, v_quote.quantity_kg);
  end if;

  return jsonb_build_object(
    'reference_number', v_quote.reference_number,
    'customer_code', v_customer.customer_code,
    'is_new_customer', v_customer.is_new
  );
end $$;

create or replace function public.submit_sample_request(
  p_full_name text,
  p_company text default null,
  p_email text default null,
  p_country text default null,
  p_product_name text default null,
  p_sample_quantity numeric default null,
  p_sample_quantity_unit text default null,
  p_shipping_address text default null,
  p_message text default null,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_customer record;
  v_sample public.sample_requests;
begin
  if coalesce(length(btrim(p_full_name)), 0) < 2 then
    perform public.app_error('P0400', 'Full name is required.');
  end if;
  if not public.valid_email(v_email) then
    perform public.app_error('P0400', 'A valid email address is required.');
  end if;
  if coalesce(length(btrim(p_shipping_address)), 0) < 10 then
    perform public.app_error('P0400', 'A complete shipping address is required.');
  end if;
  if p_sample_quantity is not null and (p_sample_quantity <= 0 or p_sample_quantity > 10) then
    perform public.app_error('P0400', 'Sample quantity must be between 0 and 10 kg.');
  end if;
  perform public.assert_submission_rate('sample_requests', v_email);

  select * into v_customer from public.upsert_customer_from_request(
    v_email, coalesce(nullif(btrim(p_company), ''), btrim(p_full_name)), p_full_name, p_phone,
    p_country, p_shipping_address, null, 'Sample Request');

  insert into public.sample_requests (
    full_name, company, email, phone, country, product_name, sample_quantity, sample_quantity_unit,
    shipping_address, message, status, customer_id
  ) values (
    btrim(p_full_name), nullif(btrim(p_company), ''), v_email, nullif(btrim(p_phone), ''),
    nullif(btrim(p_country), ''), nullif(btrim(p_product_name), ''), p_sample_quantity,
    coalesce(nullif(btrim(p_sample_quantity_unit), ''), 'kg'), btrim(p_shipping_address),
    nullif(btrim(p_message), ''), 'new', v_customer.customer_id
  ) returning * into v_sample;

  return jsonb_build_object(
    'reference_number', v_sample.reference_number,
    'customer_code', v_customer.customer_code,
    'is_new_customer', v_customer.is_new
  );
end $$;

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_message text,
  p_phone text default null,
  p_company text default null,
  p_country text default null,
  p_subject text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if coalesce(length(btrim(p_name)), 0) < 2 then
    perform public.app_error('P0400', 'Name is required.');
  end if;
  if not public.valid_email(v_email) then
    perform public.app_error('P0400', 'A valid email address is required.');
  end if;
  if coalesce(length(btrim(p_message)), 0) < 10 then
    perform public.app_error('P0400', 'Message must be at least 10 characters.');
  end if;
  perform public.assert_submission_rate('contact_messages', v_email);

  insert into public.contact_messages (name, email, phone, company, country, subject, message, status)
  values (btrim(p_name), v_email, nullif(btrim(p_phone), ''), nullif(btrim(p_company), ''),
          nullif(btrim(p_country), ''), nullif(btrim(p_subject), ''), btrim(p_message), 'new')
  returning id into v_id;

  return jsonb_build_object('received', true);
end $$;

create or replace function public.subscribe_newsletter(p_email text, p_source text default 'website')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_row public.newsletter_subscribers;
begin
  if not public.valid_email(v_email) then
    perform public.app_error('P0400', 'A valid email address is required.');
  end if;

  select * into v_row from public.newsletter_subscribers where lower(email) = v_email limit 1;
  if found then
    if not coalesce(v_row.is_active, true) then
      update public.newsletter_subscribers
         set is_active = true, unsubscribed_at = null, subscribed_at = now()
       where id = v_row.id;
      return jsonb_build_object('status', 'resubscribed');
    end if;
    return jsonb_build_object('status', 'already_subscribed');
  end if;

  insert into public.newsletter_subscribers (email, is_active, subscribed_at, source)
  values (v_email, true, now(), coalesce(nullif(btrim(p_source), ''), 'website'));
  return jsonb_build_object('status', 'subscribed');
end $$;

revoke all on function public.submit_quote_request(text, text, text, text, text, text, text, text, text, text, numeric, text, text[], text, text) from public;
revoke all on function public.submit_sample_request(text, text, text, text, text, numeric, text, text, text, text) from public;
revoke all on function public.submit_contact_message(text, text, text, text, text, text, text) from public;
revoke all on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.submit_quote_request(text, text, text, text, text, text, text, text, text, text, numeric, text, text[], text, text) to anon, authenticated;
grant execute on function public.submit_sample_request(text, text, text, text, text, numeric, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;

-- Staff: create/link the customer record for an existing quote or sample request.
create or replace function public.link_request_customer(p_request_type text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_req record;
  v_customer record;
begin
  if not public.is_role(array['sales', 'admin', 'super_admin']) then
    perform public.app_error('P0403', 'Only Sales can link customers to requests.');
  end if;

  if p_request_type = 'quote_request' then
    select id, email, company, full_name, phone, country, destination_port, null::text as address, customer_id
      into v_req from public.quote_requests where id = p_request_id for update;
  elsif p_request_type = 'sample_request' then
    select id, email, company, full_name, phone, country, null::text as destination_port, shipping_address as address, customer_id
      into v_req from public.sample_requests where id = p_request_id for update;
  else
    perform public.app_error('P0400', 'Unknown request type.');
  end if;
  if not found then
    perform public.app_error('P0404', 'Request not found.');
  end if;
  if v_req.customer_id is not null then
    return jsonb_build_object('customer_id', v_req.customer_id, 'is_new_customer', false);
  end if;

  select * into v_customer from public.upsert_customer_from_request(
    v_req.email, coalesce(v_req.company, v_req.full_name), v_req.full_name, v_req.phone, v_req.country,
    v_req.address, v_req.destination_port,
    case when p_request_type = 'quote_request' then 'Quote Request' else 'Sample Request' end);

  if p_request_type = 'quote_request' then
    update public.quote_requests set customer_id = v_customer.customer_id where id = p_request_id;
  else
    update public.sample_requests set customer_id = v_customer.customer_id where id = p_request_id;
  end if;

  return jsonb_build_object('customer_id', v_customer.customer_id, 'customer_code', v_customer.customer_code,
                            'is_new_customer', v_customer.is_new);
end $$;
revoke all on function public.link_request_customer(text, uuid) from public, anon;
grant execute on function public.link_request_customer(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Quote requests: quotation timestamps
-- -----------------------------------------------------------------------------
create or replace function public.quote_requests_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status = 'quoted' and old.status is distinct from 'quoted' then
    new.quoted_at := coalesce(new.quoted_at, now());
  end if;
  if tg_op = 'UPDATE' and old.status = 'converted' and auth.uid() is not null and not public.in_workflow()
     and (new.customer_id is distinct from old.customer_id or new.quantity_kg is distinct from old.quantity_kg
          or new.product_name is distinct from old.product_name) then
    perform public.app_error('P0409', 'This quote has been converted to a sales order and can no longer be changed.');
  end if;
  return new;
end $$;
drop trigger if exists cc_quote_requests_guard on public.quote_requests;
create trigger cc_quote_requests_guard before update on public.quote_requests
  for each row execute function public.quote_requests_guard();

create or replace function public.quote_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.quote_requests
   where id = coalesce(new.quote_request_id, old.quote_request_id);
  if v_status in ('converted', 'rejected') and auth.uid() is not null and not public.in_workflow() then
    perform public.app_error('P0409', format('Quote items cannot be changed once the quote is %s.', v_status));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists cc_quote_items_guard on public.quote_items;
create trigger cc_quote_items_guard before insert or update or delete on public.quote_items
  for each row execute function public.quote_items_guard();

-- Sample request timestamps
create or replace function public.sample_requests_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'dispatched' then
      if coalesce(btrim(new.tracking_number), '') = '' or coalesce(btrim(new.courier), '') = '' then
        perform public.app_error('P0400', 'Enter the courier and tracking number before dispatching the sample.');
      end if;
      new.shipped_at := coalesce(new.shipped_at, now());
    elsif new.status = 'delivered' then
      new.delivered_at := coalesce(new.delivered_at, now());
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cc_sample_requests_guard on public.sample_requests;
create trigger cc_sample_requests_guard before update on public.sample_requests
  for each row execute function public.sample_requests_guard();

-- -----------------------------------------------------------------------------
-- 5. Sales orders: edit window, timestamps, conversion, send/accept
-- -----------------------------------------------------------------------------
create or replace function public.sales_orders_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_uid is not null and not public.in_workflow() then
      new.status := 'draft';
      new.sales_person_id := coalesce(new.sales_person_id, v_uid);
      new.sent_to_export_at := null;
      new.export_accepted_at := null;
      new.shipped_at := null;
    end if;
    new.currency := coalesce(nullif(btrim(new.currency), ''), 'USD');
    return new;
  end if;

  if v_uid is not null and not public.in_workflow() then
    if new.order_number is distinct from old.order_number or new.quote_request_id is distinct from old.quote_request_id then
      perform public.app_error('P0400', 'Order number and source quote cannot be changed.');
    end if;
    if old.status not in ('draft', 'confirmed') and (
         new.customer_id is distinct from old.customer_id
      or new.product_name is distinct from old.product_name
      or new.origin is distinct from old.origin
      or new.grade is distinct from old.grade
      or new.processing_method is distinct from old.processing_method
      or new.quantity_kg is distinct from old.quantity_kg
      or new.unit_price is distinct from old.unit_price
      or new.currency is distinct from old.currency
      or new.incoterm is distinct from old.incoterm
      or new.payment_terms is distinct from old.payment_terms
      or new.destination_country is distinct from old.destination_country
      or new.destination_port is distinct from old.destination_port
      or new.requested_ship_date is distinct from old.requested_ship_date
      or new.sales_person_id is distinct from old.sales_person_id) then
      perform public.app_error('P0409', format('Order %s can only be edited while it is a draft or confirmed.', old.order_number));
    end if;
  end if;

  if new.status is distinct from old.status then
    case new.status
      when 'sent_to_export' then
        if new.customer_id is null then
          perform public.app_error('P0400', 'Select a customer before sending the order to Export.');
        end if;
        new.sent_to_export_at := now();
        new.sales_person_id := coalesce(new.sales_person_id, v_uid);
      when 'export_accepted' then
        if old.status = 'sent_to_export' then
          new.export_accepted_at := now();
          new.export_accepted_by := v_uid;
        end if;
      when 'shipped' then
        new.shipped_at := coalesce(new.shipped_at, now());
      when 'completed' then
        new.completed_at := coalesce(new.completed_at, now());
      when 'cancelled' then
        new.cancelled_at := now();
      else
        null;
    end case;
  end if;
  return new;
end $$;
drop trigger if exists cc_sales_orders_guard on public.sales_orders;
create trigger cc_sales_orders_guard before insert or update on public.sales_orders
  for each row execute function public.sales_orders_guard();

create or replace function public.convert_quote_to_order(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quote public.quote_requests;
  v_existing text;
  v_customer_id uuid;
  v_items int;
  v_qty numeric;
  v_product text;
  v_unit_price numeric;
  v_order public.sales_orders;
  v_cust record;
begin
  if not public.is_role(array['sales', 'admin', 'super_admin']) then
    perform public.app_error('P0403', 'Only Sales can convert quotes to sales orders.');
  end if;

  select * into v_quote from public.quote_requests where id = p_quote_id for update;
  if not found then
    perform public.app_error('P0404', 'Quote request not found.');
  end if;

  select order_number into v_existing from public.sales_orders
   where quote_request_id = p_quote_id and status <> 'cancelled' limit 1;
  if v_existing is not null then
    perform public.app_error('P0409', format('This quote was already converted to order %s.', v_existing));
  end if;
  if v_quote.status <> 'accepted' then
    perform public.app_error('P0409', 'Only quotes accepted by the customer can be converted to a sales order.');
  end if;

  v_customer_id := v_quote.customer_id;
  if v_customer_id is null then
    select * into v_cust from public.upsert_customer_from_request(
      v_quote.email, coalesce(v_quote.company, v_quote.full_name), v_quote.full_name, v_quote.phone,
      v_quote.country, null, v_quote.destination_port, 'Quote Request');
    v_customer_id := v_cust.customer_id;
    update public.quote_requests set customer_id = v_customer_id where id = p_quote_id;
  end if;

  select count(*), sum(quantity_kg) into v_items, v_qty from public.quote_items where quote_request_id = p_quote_id;
  if v_items = 1 then
    select description, unit_price into v_product, v_unit_price from public.quote_items where quote_request_id = p_quote_id;
  elsif v_items > 1 then
    select coalesce(v_quote.product_name, min(description)) || format(' (+%s more lines)', v_items - 1)
      into v_product from public.quote_items where quote_request_id = p_quote_id;
  end if;
  v_product := coalesce(v_product, v_quote.product_name);
  v_qty := coalesce(v_qty, v_quote.quantity_kg);

  if v_product is null or btrim(v_product) = '' then
    perform public.app_error('P0400', 'Add a product (quote item) to the quote before converting it.');
  end if;
  if v_qty is null or v_qty <= 0 then
    perform public.app_error('P0400', 'Set a quantity on the quote (or its items) before converting it.');
  end if;

  perform public.begin_workflow();

  insert into public.sales_orders (
    customer_id, quote_request_id, sales_person_id, product_name, origin, grade, processing_method,
    quantity_kg, unit_price, currency, incoterm, payment_terms, destination_country, destination_port,
    customer_notes, status
  ) values (
    v_customer_id, p_quote_id, coalesce(v_quote.assigned_to, auth.uid()), v_product, v_quote.region_name,
    v_quote.grade, v_quote.processing, v_qty, v_unit_price, coalesce(v_quote.currency, 'USD'),
    v_quote.incoterm, v_quote.payment_terms, v_quote.country, v_quote.destination_port,
    nullif(concat_ws(E'\n\n',
      case when v_quote.message is not null then 'Customer message: ' || v_quote.message end,
      case when v_quote.quotation_notes is not null then 'Quotation notes: ' || v_quote.quotation_notes end), ''),
    'draft'
  ) returning * into v_order;

  insert into public.sales_order_items (sales_order_id, product_id, description, quantity_kg, grade, processing_method, unit_price)
  select v_order.id, product_id, description, quantity_kg, grade, processing_method, unit_price
    from public.quote_items where quote_request_id = p_quote_id order by sort_order, created_at;

  update public.quote_requests set status = 'converted' where id = p_quote_id;

  return to_jsonb(v_order);
end $$;
revoke all on function public.convert_quote_to_order(uuid) from public, anon;
grant execute on function public.convert_quote_to_order(uuid) to authenticated;

-- Existing workflow RPC names, now validated and role-checked.
create or replace function public.send_order_to_export(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.sales_orders;
begin
  if auth.uid() is null then
    perform public.app_error('P0403', 'Authentication required.');
  end if;
  if not public.is_role(array['sales', 'admin', 'super_admin']) then
    perform public.app_error('P0403', 'Access denied. Only Sales, Admin, or Super Admin can send orders to Export.');
  end if;

  select * into v_order from public.sales_orders where id = p_order_id for update;
  if not found then
    perform public.app_error('P0404', 'Sales order not found.');
  end if;
  if v_order.status not in ('draft', 'confirmed') then
    perform public.app_error('P0409', format('Order %s is %s and cannot be sent to Export.', v_order.order_number, replace(v_order.status, '_', ' ')));
  end if;

  update public.sales_orders
     set status = 'sent_to_export',
         sales_person_id = coalesce(sales_person_id, auth.uid())
   where id = p_order_id
   returning * into v_order;
  return to_jsonb(v_order);
end $$;

create or replace function public.accept_export_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.sales_orders;
begin
  if auth.uid() is null then
    perform public.app_error('P0403', 'Authentication required.');
  end if;
  if not public.is_role(array['export_manager', 'admin', 'super_admin']) then
    perform public.app_error('P0403', 'Only an Export Manager can accept export orders.');
  end if;

  select * into v_order from public.sales_orders where id = p_order_id for update;
  if not found then
    perform public.app_error('P0404', 'Sales order not found.');
  end if;
  if v_order.status <> 'sent_to_export' then
    perform public.app_error('P0409', format('Order %s is %s; only orders sent to Export can be accepted.', v_order.order_number, replace(v_order.status, '_', ' ')));
  end if;

  update public.sales_orders set status = 'export_accepted' where id = p_order_id returning * into v_order;
  return to_jsonb(v_order);
end $$;

revoke all on function public.send_order_to_export(uuid) from public, anon;
revoke all on function public.accept_export_order(uuid) from public, anon;
grant execute on function public.send_order_to_export(uuid) to authenticated;
grant execute on function public.accept_export_order(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Collections and lots
-- -----------------------------------------------------------------------------
create or replace function public.collection_records_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_farm_farmer uuid;
  v_allocated numeric;
begin
  if tg_op = 'INSERT' then
    if v_uid is not null and not public.in_workflow() then
      new.status := 'submitted';
      if not public.is_admin() or new.field_officer_id is null then
        new.field_officer_id := v_uid;
      end if;
    end if;
    if not exists (select 1 from public.suppliers where id = new.supplier_id and is_active) then
      perform public.app_error('P0400', 'Select an active supplier for the collection.');
    end if;
  else
    if new.field_officer_id is distinct from old.field_officer_id and v_uid is not null and not public.is_admin() then
      perform public.app_error('P0403', 'Only an administrator can reassign a collection to another field officer.');
    end if;
    if new.quantity_kg is distinct from old.quantity_kg then
      select coalesce(sum(quantity_kg), 0) into v_allocated from public.coffee_lots where collection_id = new.id;
      if new.quantity_kg < v_allocated then
        perform public.app_error('P0409', format('%s kg of this collection is already in lots; the quantity cannot be lower.', v_allocated));
      end if;
    end if;
  end if;

  if new.farm_id is not null then
    select farmer_id into v_farm_farmer from public.farms where id = new.farm_id;
    if not found then
      perform public.app_error('P0400', 'Selected farm does not exist.');
    end if;
    if new.farmer_id is null then
      new.farmer_id := v_farm_farmer;
    elsif v_farm_farmer is distinct from new.farmer_id then
      perform public.app_error('P0400', 'The selected farm does not belong to the selected farmer.');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cc_collection_records_guard on public.collection_records;
create trigger cc_collection_records_guard before insert or update on public.collection_records
  for each row execute function public.collection_records_guard();

create or replace function public.refresh_collection_status(p_collection_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_col public.collection_records;
  v_allocated numeric;
  v_target text;
begin
  select * into v_col from public.collection_records where id = p_collection_id;
  if not found or v_col.status = 'rejected' then
    return;
  end if;
  select coalesce(sum(quantity_kg), 0) into v_allocated from public.coffee_lots where collection_id = p_collection_id;
  v_target := case
    when v_allocated >= v_col.quantity_kg then 'processed'
    when v_allocated > 0 then 'partially_processed'
    when v_col.status in ('processed', 'partially_processed') then 'verified'
    else v_col.status
  end;
  if v_target is distinct from v_col.status then
    perform public.begin_workflow();
    update public.collection_records set status = v_target where id = p_collection_id;
  end if;
end $$;
revoke all on function public.refresh_collection_status(uuid) from public, anon, authenticated;

create or replace function public.coffee_lots_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_col public.collection_records;
  v_allocated numeric;
begin
  if tg_op = 'INSERT' then
    select * into v_col from public.collection_records where id = new.collection_id for update;
    if not found then
      perform public.app_error('P0400', 'Select the collection this lot comes from.');
    end if;
    if v_col.status = 'rejected' then
      perform public.app_error('P0409', format('Collection %s was rejected; lots cannot be created from it.', v_col.collection_code));
    end if;
    select coalesce(sum(quantity_kg), 0) into v_allocated from public.coffee_lots where collection_id = new.collection_id;
    if v_allocated + new.quantity_kg > v_col.quantity_kg then
      perform public.app_error('P0409', format('Only %s kg of collection %s is not yet in a lot.', v_col.quantity_kg - v_allocated, v_col.collection_code));
    end if;
    -- A lot always inherits its source from the collection (traceability).
    new.supplier_id := v_col.supplier_id;
    new.origin := coalesce(nullif(btrim(new.origin), ''), v_col.origin);
    new.processing_method := coalesce(nullif(btrim(new.processing_method), ''), v_col.processing_method);
    new.grade := coalesce(nullif(btrim(new.grade), ''), v_col.grade);
    if auth.uid() is not null and not public.in_workflow() then
      new.status := 'pending_quality';
      new.created_by := auth.uid();
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.in_workflow() then
    if new.collection_id is distinct from old.collection_id or new.supplier_id is distinct from old.supplier_id then
      perform public.app_error('P0400', 'A lot cannot be moved to another collection or supplier.');
    end if;
    if new.quantity_kg is distinct from old.quantity_kg then
      if old.status <> 'pending_quality' then
        perform public.app_error('P0409', 'Lot quantity can only be corrected before quality approval.');
      end if;
      select coalesce(sum(quantity_kg), 0) into v_allocated from public.coffee_lots
       where collection_id = new.collection_id and id <> new.id;
      select * into v_col from public.collection_records where id = new.collection_id;
      if v_allocated + new.quantity_kg > v_col.quantity_kg then
        perform public.app_error('P0409', format('Only %s kg of collection %s is available for this lot.', v_col.quantity_kg - v_allocated, v_col.collection_code));
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cc_coffee_lots_guard on public.coffee_lots;
create trigger cc_coffee_lots_guard before insert or update on public.coffee_lots
  for each row execute function public.coffee_lots_guard();

create or replace function public.coffee_lots_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_collection_status(new.collection_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.collection_id is distinct from new.collection_id) then
    perform public.refresh_collection_status(old.collection_id);
  end if;
  return null;
end $$;
drop trigger if exists dd_coffee_lots_after_change on public.coffee_lots;
create trigger dd_coffee_lots_after_change after insert or delete or update of quantity_kg, collection_id on public.coffee_lots
  for each row execute function public.coffee_lots_after_change();

-- -----------------------------------------------------------------------------
-- 7. Quality: approval drives the lot status
-- -----------------------------------------------------------------------------
create or replace function public.quality_inspections_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lot_status text;
begin
  select status into v_lot_status from public.coffee_lots where id = new.lot_id;
  if not found then
    perform public.app_error('P0400', 'Select the coffee lot being inspected.');
  end if;

  if tg_op = 'INSERT' then
    if v_lot_status in ('shipped', 'sold') then
      perform public.app_error('P0409', 'Shipped lots cannot receive new inspections.');
    end if;
    if v_uid is not null then
      new.inspector_id := v_uid;
    end if;
  else
    if old.approval_status <> 'pending' and v_uid is not null and not public.is_admin()
       and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      perform public.app_error('P0409', format('This inspection is already %s; only an administrator can change it.', old.approval_status));
    end if;
    if new.lot_id is distinct from old.lot_id then
      perform public.app_error('P0400', 'An inspection cannot be moved to another lot.');
    end if;
    new.inspector_id := old.inspector_id;
  end if;

  if new.approval_status in ('approved', 'rejected')
     and (tg_op = 'INSERT' or new.approval_status is distinct from old.approval_status) then
    if new.approval_status = 'approved' and new.result <> 'passed' then
      perform public.app_error('P0400', 'Only an inspection with result "passed" can be approved.');
    end if;
    new.approved_by := v_uid;
    new.approved_at := now();
  elsif new.approval_status = 'pending' then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists cc_quality_inspections_guard on public.quality_inspections;
create trigger cc_quality_inspections_guard before insert or update on public.quality_inspections
  for each row execute function public.quality_inspections_guard();

create or replace function public.quality_inspections_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_lot public.coffee_lots;
  v_has_stock boolean;
begin
  if tg_op = 'UPDATE' and new.approval_status is not distinct from old.approval_status then
    return null;
  end if;
  select * into v_lot from public.coffee_lots where id = new.lot_id for update;
  perform public.begin_workflow();

  if new.approval_status = 'approved' then
    update public.coffee_lots
       set status = case when status in ('pending_quality', 'rejected') then 'approved' else status end,
           grade = coalesce(nullif(btrim(new.final_grade), ''), grade)
     where id = new.lot_id;
  elsif new.approval_status = 'rejected' then
    if v_lot.status in ('pending_quality', 'approved') then
      update public.coffee_lots set status = 'rejected' where id = new.lot_id;
    end if;
  elsif new.approval_status = 'pending' and tg_op = 'UPDATE' then
    -- Approval withdrawn: go back to pending unless the lot already moved on.
    select exists (select 1 from public.inventory_transactions where lot_id = new.lot_id) into v_has_stock;
    if v_lot.status in ('approved', 'rejected') and not v_has_stock
       and not exists (select 1 from public.quality_inspections q
                       where q.lot_id = new.lot_id and q.id <> new.id and q.approval_status <> 'pending') then
      update public.coffee_lots set status = 'pending_quality' where id = new.lot_id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists dd_quality_inspections_apply on public.quality_inspections;
create trigger dd_quality_inspections_apply after insert or update of approval_status on public.quality_inspections
  for each row execute function public.quality_inspections_apply();

-- -----------------------------------------------------------------------------
-- 8. Inventory: every quantity change goes through these functions and is
--    written to inventory_transactions (traceable ledger, never negative).
-- -----------------------------------------------------------------------------
create or replace function public.refresh_lot_stock_status(p_lot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_on_hand numeric;
  v_reserved numeric;
  v_shipped numeric;
  v_target text;
begin
  select status into v_status from public.coffee_lots where id = p_lot_id for update;
  if v_status not in ('in_warehouse', 'reserved', 'shipped', 'approved') then
    return;
  end if;
  select coalesce(sum(quantity_kg), 0) into v_on_hand from public.inventory where lot_id = p_lot_id;
  select coalesce(sum(bl.quantity_kg) filter (where b.status in ('preparing', 'ready', 'approved')), 0),
         coalesce(sum(bl.quantity_kg) filter (where b.status in ('shipped', 'completed')), 0)
    into v_reserved, v_shipped
    from public.export_batch_lots bl
    join public.export_batches b on b.id = bl.export_batch_id
   where bl.lot_id = p_lot_id and bl.released_at is null;

  if v_status = 'approved' and v_on_hand = 0 and v_reserved = 0 and v_shipped = 0
     and not exists (select 1 from public.inventory_transactions where lot_id = p_lot_id) then
    return; -- approved but never received
  end if;

  v_target := case
    when v_on_hand > 0 then 'in_warehouse'
    when v_reserved > 0 then 'reserved'
    when v_shipped > 0 then 'shipped'
    else 'in_warehouse'
  end;
  if v_target is distinct from v_status then
    perform public.begin_workflow();
    update public.coffee_lots set status = v_target where id = p_lot_id;
  end if;
end $$;
revoke all on function public.refresh_lot_stock_status(uuid) from public, anon, authenticated;

create or replace function public.assert_warehouse_role()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_role(array['warehouse_officer', 'admin', 'super_admin']) then
    perform public.app_error('P0403', 'Only warehouse staff can change stock.');
  end if;
end $$;

create or replace function public.assert_warehouse_capacity(p_warehouse_id uuid, p_incoming numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_wh public.warehouses;
  v_stock numeric;
begin
  select * into v_wh from public.warehouses where id = p_warehouse_id for update;
  if not found then
    perform public.app_error('P0404', 'Warehouse not found.');
  end if;
  if not v_wh.is_active then
    perform public.app_error('P0409', format('Warehouse %s is inactive.', v_wh.name));
  end if;
  if v_wh.capacity_kg is not null then
    select coalesce(sum(quantity_kg), 0) into v_stock from public.inventory where warehouse_id = p_warehouse_id;
    if v_stock + p_incoming > v_wh.capacity_kg then
      perform public.app_error('P0409', format('Warehouse %s has only %s kg of free capacity.', v_wh.name, greatest(v_wh.capacity_kg - v_stock, 0)));
    end if;
  end if;
end $$;

create or replace function public.inventory_apply(
  p_lot_id uuid, p_warehouse_id uuid, p_delta numeric, p_type text,
  p_reference_type text, p_reference_id uuid, p_notes text
) returns public.inventory
language plpgsql security definer set search_path = public as $$
declare v_row public.inventory;
begin
  select * into v_row from public.inventory where lot_id = p_lot_id and warehouse_id = p_warehouse_id for update;
  if not found then
    if p_delta < 0 then
      perform public.app_error('P0409', 'There is no stock of this lot in the selected warehouse.');
    end if;
    insert into public.inventory (lot_id, warehouse_id, quantity_kg, status, received_date)
    values (p_lot_id, p_warehouse_id, 0, 'available', current_date)
    returning * into v_row;
  end if;
  if v_row.quantity_kg + p_delta < 0 then
    perform public.app_error('P0409', format('Only %s kg is in stock; the movement would make stock negative.', v_row.quantity_kg));
  end if;

  update public.inventory
     set quantity_kg = v_row.quantity_kg + p_delta,
         status = case when v_row.quantity_kg + p_delta = 0 then 'depleted' else 'available' end
   where id = v_row.id
   returning * into v_row;

  insert into public.inventory_transactions (lot_id, warehouse_id, transaction_type, quantity_kg, reference_type,
                                             reference_id, notes, performed_by, balance_after)
  values (p_lot_id, p_warehouse_id, p_type, abs(p_delta), p_reference_type, p_reference_id,
          nullif(btrim(p_notes), ''), auth.uid(), v_row.quantity_kg);
  return v_row;
end $$;
revoke all on function public.inventory_apply(uuid, uuid, numeric, text, text, uuid, text) from public, anon, authenticated;

create or replace function public.inventory_receive(
  p_lot_id uuid,
  p_warehouse_id uuid,
  p_quantity_kg numeric,
  p_bag_count integer default null,
  p_weight_per_bag_kg numeric default null,
  p_unit_cost_per_kg numeric default null,
  p_shipping_cost numeric default null,
  p_par_level_bags integer default null,
  p_received_date date default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lot public.coffee_lots;
  v_received numeric;
  v_row public.inventory;
begin
  perform public.assert_warehouse_role();
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    perform public.app_error('P0400', 'Quantity must be greater than 0.');
  end if;

  select * into v_lot from public.coffee_lots where id = p_lot_id for update;
  if not found then
    perform public.app_error('P0404', 'Coffee lot not found.');
  end if;
  if v_lot.status not in ('approved', 'in_warehouse', 'reserved', 'shipped') then
    perform public.app_error('P0409', format('Lot %s has not passed quality approval (status: %s).', v_lot.lot_code, replace(v_lot.status, '_', ' ')));
  end if;

  select coalesce(sum(quantity_kg), 0) into v_received from public.inventory_transactions
   where lot_id = p_lot_id and transaction_type in ('receipt', 'in');
  if v_received + p_quantity_kg > v_lot.quantity_kg then
    perform public.app_error('P0409', format('Only %s kg of lot %s remains to be received.', greatest(v_lot.quantity_kg - v_received, 0), v_lot.lot_code));
  end if;
  perform public.assert_warehouse_capacity(p_warehouse_id, p_quantity_kg);

  v_row := public.inventory_apply(p_lot_id, p_warehouse_id, p_quantity_kg, 'receipt', 'coffee_lot', p_lot_id, p_notes);
  update public.inventory
     set bag_count = coalesce(p_bag_count, bag_count),
         weight_per_bag_kg = coalesce(p_weight_per_bag_kg, weight_per_bag_kg),
         unit_cost_per_kg = coalesce(p_unit_cost_per_kg, unit_cost_per_kg),
         shipping_cost = coalesce(p_shipping_cost, shipping_cost),
         par_level_bags = coalesce(p_par_level_bags, par_level_bags),
         received_date = coalesce(p_received_date, received_date, current_date),
         notes = coalesce(nullif(btrim(p_notes), ''), notes),
         coffee_type = coalesce(coffee_type, 'Green Coffee'),
         inventory_type = coalesce(inventory_type, 'green')
   where id = v_row.id
   returning * into v_row;

  if v_lot.status = 'approved' then
    perform public.begin_workflow();
    update public.coffee_lots set status = 'in_warehouse' where id = p_lot_id;
  else
    perform public.refresh_lot_stock_status(p_lot_id);
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function public.inventory_adjust(p_inventory_id uuid, p_delta_kg numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.inventory;
begin
  perform public.assert_warehouse_role();
  if p_delta_kg is null or p_delta_kg = 0 then
    perform public.app_error('P0400', 'Adjustment must be a non-zero quantity.');
  end if;
  if coalesce(length(btrim(p_reason)), 0) < 3 then
    perform public.app_error('P0400', 'A reason is required for stock adjustments.');
  end if;
  select * into v_row from public.inventory where id = p_inventory_id;
  if not found then
    perform public.app_error('P0404', 'Inventory record not found.');
  end if;
  if p_delta_kg > 0 then
    perform public.assert_warehouse_capacity(v_row.warehouse_id, p_delta_kg);
  end if;
  v_row := public.inventory_apply(v_row.lot_id, v_row.warehouse_id, p_delta_kg,
                                  case when p_delta_kg > 0 then 'adjustment_in' else 'adjustment_out' end,
                                  'adjustment', null, p_reason);
  perform public.refresh_lot_stock_status(v_row.lot_id);
  return to_jsonb(v_row);
end $$;

create or replace function public.inventory_issue(
  p_inventory_id uuid, p_quantity_kg numeric, p_reason text,
  p_reference_type text default null, p_reference_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.inventory;
begin
  perform public.assert_warehouse_role();
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    perform public.app_error('P0400', 'Quantity must be greater than 0.');
  end if;
  if coalesce(length(btrim(p_reason)), 0) < 3 then
    perform public.app_error('P0400', 'A reason is required when issuing stock.');
  end if;
  select * into v_row from public.inventory where id = p_inventory_id;
  if not found then
    perform public.app_error('P0404', 'Inventory record not found.');
  end if;
  v_row := public.inventory_apply(v_row.lot_id, v_row.warehouse_id, -p_quantity_kg, 'issue',
                                  coalesce(p_reference_type, 'issue'), p_reference_id, p_reason);
  perform public.refresh_lot_stock_status(v_row.lot_id);
  return to_jsonb(v_row);
end $$;

create or replace function public.inventory_transfer(
  p_inventory_id uuid, p_to_warehouse_id uuid, p_quantity_kg numeric, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_src public.inventory;
  v_dst public.inventory;
begin
  perform public.assert_warehouse_role();
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    perform public.app_error('P0400', 'Quantity must be greater than 0.');
  end if;
  select * into v_src from public.inventory where id = p_inventory_id;
  if not found then
    perform public.app_error('P0404', 'Inventory record not found.');
  end if;
  if v_src.warehouse_id = p_to_warehouse_id then
    perform public.app_error('P0400', 'Choose a different destination warehouse.');
  end if;
  perform public.assert_warehouse_capacity(p_to_warehouse_id, p_quantity_kg);
  v_src := public.inventory_apply(v_src.lot_id, v_src.warehouse_id, -p_quantity_kg, 'transfer_out', 'warehouse', p_to_warehouse_id, p_notes);
  v_dst := public.inventory_apply(v_src.lot_id, p_to_warehouse_id, p_quantity_kg, 'transfer_in', 'warehouse', v_src.warehouse_id, p_notes);
  update public.inventory d
     set weight_per_bag_kg = coalesce(d.weight_per_bag_kg, v_src.weight_per_bag_kg),
         unit_cost_per_kg = coalesce(d.unit_cost_per_kg, v_src.unit_cost_per_kg),
         coffee_type = coalesce(d.coffee_type, v_src.coffee_type),
         inventory_type = coalesce(d.inventory_type, v_src.inventory_type)
   where d.id = v_dst.id;
  return jsonb_build_object('from', to_jsonb(v_src), 'to', to_jsonb(v_dst));
end $$;

revoke all on function public.inventory_receive(uuid, uuid, numeric, integer, numeric, numeric, numeric, integer, date, text) from public, anon;
revoke all on function public.inventory_adjust(uuid, numeric, text) from public, anon;
revoke all on function public.inventory_issue(uuid, numeric, text, text, uuid) from public, anon;
revoke all on function public.inventory_transfer(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.inventory_receive(uuid, uuid, numeric, integer, numeric, numeric, numeric, integer, date, text) to authenticated;
grant execute on function public.inventory_adjust(uuid, numeric, text) to authenticated;
grant execute on function public.inventory_issue(uuid, numeric, text, text, uuid) to authenticated;
grant execute on function public.inventory_transfer(uuid, uuid, numeric, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Export batches: allocate stock atomically, release on cancellation
-- -----------------------------------------------------------------------------
create or replace function public.export_batches_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.in_workflow() then
    if new.sales_order_id is distinct from old.sales_order_id
       or new.total_quantity_kg is distinct from old.total_quantity_kg
       or new.batch_number is distinct from old.batch_number then
      perform public.app_error('P0400', 'Batch order, number and quantity are managed by the allocation workflow.');
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'shipped' then new.shipped_at := coalesce(new.shipped_at, now()); end if;
    if new.status = 'completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
    if new.status = 'cancelled' then new.cancelled_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists cc_export_batches_guard on public.export_batches;
create trigger cc_export_batches_guard before update on public.export_batches
  for each row execute function public.export_batches_guard();

create or replace function public.create_export_batch(
  p_sales_order_id uuid,
  p_allocations jsonb,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.sales_orders;
  v_batch public.export_batches;
  v_alloc jsonb;
  v_lot public.coffee_lots;
  v_inv public.inventory;
  v_total numeric := 0;
  v_already numeric;
  v_qty numeric;
  v_lot_id uuid;
  v_wh_id uuid;
begin
  if not public.is_role(array['export_manager', 'admin', 'super_admin']) then
    perform public.app_error('P0403', 'Only an Export Manager can create export batches.');
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    perform public.app_error('P0400', 'Allocate at least one coffee lot to the batch.');
  end if;

  select * into v_order from public.sales_orders where id = p_sales_order_id for update;
  if not found then
    perform public.app_error('P0404', 'Sales order not found.');
  end if;
  if v_order.status not in ('export_accepted', 'processing') then
    perform public.app_error('P0409', format('Order %s must be accepted by Export before batching (status: %s).', v_order.order_number, replace(v_order.status, '_', ' ')));
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_allocations) a
    group by a ->> 'lot_id', a ->> 'warehouse_id' having count(*) > 1
  ) then
    perform public.app_error('P0400', 'Each lot/warehouse combination can only be allocated once per batch.');
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_qty := (v_alloc ->> 'quantity_kg')::numeric;
    if v_qty is null or v_qty <= 0 then
      perform public.app_error('P0400', 'Every allocation needs a quantity greater than 0.');
    end if;
    v_total := v_total + v_qty;
  end loop;

  select coalesce(sum(total_quantity_kg), 0) into v_already
    from public.export_batches where sales_order_id = p_sales_order_id and status <> 'cancelled';
  if v_already + v_total > v_order.quantity_kg then
    perform public.app_error('P0409', format('Order %s has %s kg left to allocate; this batch has %s kg.', v_order.order_number, v_order.quantity_kg - v_already, v_total));
  end if;

  perform public.begin_workflow();

  insert into public.export_batches (sales_order_id, export_manager_id, total_quantity_kg, status, notes,
                                     destination_country, destination_port)
  values (p_sales_order_id, auth.uid(), v_total, 'preparing', nullif(btrim(p_notes), ''),
          v_order.destination_country, v_order.destination_port)
  returning * into v_batch;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_lot_id := (v_alloc ->> 'lot_id')::uuid;
    v_wh_id := (v_alloc ->> 'warehouse_id')::uuid;
    v_qty := (v_alloc ->> 'quantity_kg')::numeric;

    select * into v_lot from public.coffee_lots where id = v_lot_id for update;
    if not found then
      perform public.app_error('P0404', 'Coffee lot not found.');
    end if;
    if v_lot.status not in ('in_warehouse', 'reserved') then
      perform public.app_error('P0409', format('Lot %s is not available for export (status: %s).', v_lot.lot_code, replace(v_lot.status, '_', ' ')));
    end if;
    if (select q.approval_status from public.quality_inspections q
         where q.lot_id = v_lot_id and q.approval_status <> 'pending'
         order by q.approved_at desc nulls last, q.created_at desc limit 1) is distinct from 'approved' then
      perform public.app_error('P0409', format('Lot %s has no approved quality inspection (or its latest inspection was rejected).', v_lot.lot_code));
    end if;
    select * into v_inv from public.inventory where lot_id = v_lot_id and warehouse_id = v_wh_id for update;
    if not found or v_inv.quantity_kg < v_qty then
      perform public.app_error('P0409', format('Only %s kg of lot %s is in stock in the selected warehouse.', coalesce(v_inv.quantity_kg, 0), v_lot.lot_code));
    end if;

    perform public.inventory_apply(v_lot_id, v_wh_id, -v_qty, 'export_allocation', 'export_batch', v_batch.id,
                                   'Allocated to ' || v_batch.batch_number);
    insert into public.export_batch_lots (export_batch_id, lot_id, warehouse_id, quantity_kg)
    values (v_batch.id, v_lot_id, v_wh_id, v_qty);
    perform public.refresh_lot_stock_status(v_lot_id);
  end loop;

  if v_order.status = 'export_accepted' then
    update public.sales_orders set status = 'processing' where id = p_sales_order_id;
  end if;

  return to_jsonb(v_batch);
end $$;

create or replace function public.set_export_batch_status(p_batch_id uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch public.export_batches;
  v_line record;
begin
  if not public.is_role(array['export_manager', 'admin', 'super_admin']) then
    perform public.app_error('P0403', 'Only an Export Manager can change export batches.');
  end if;
  select * into v_batch from public.export_batches where id = p_batch_id for update;
  if not found then
    perform public.app_error('P0404', 'Export batch not found.');
  end if;

  if p_status <> 'cancelled' then
    -- Manual transitions are validated by the transition trigger.
    update public.export_batches set status = p_status where id = p_batch_id returning * into v_batch;
    return to_jsonb(v_batch);
  end if;

  if v_batch.status not in ('preparing', 'ready', 'approved') then
    perform public.app_error('P0409', format('A %s batch cannot be cancelled.', v_batch.status));
  end if;
  if exists (select 1 from public.shipments where export_batch_id = p_batch_id and status <> 'cancelled') then
    perform public.app_error('P0409', 'Cancel the shipment for this batch first.');
  end if;

  perform public.begin_workflow();

  for v_line in
    select * from public.export_batch_lots where export_batch_id = p_batch_id and released_at is null
  loop
    if v_line.warehouse_id is not null then
      perform public.inventory_apply(v_line.lot_id, v_line.warehouse_id, v_line.quantity_kg, 'export_release',
                                     'export_batch', p_batch_id, 'Released from cancelled ' || v_batch.batch_number);
    end if;
    update public.export_batch_lots set released_at = now() where id = v_line.id;
  end loop;

  update public.export_batches
     set status = 'cancelled',
         notes = coalesce(notes || E'\n', '') || coalesce('Cancelled: ' || nullif(btrim(p_reason), ''), 'Cancelled')
   where id = p_batch_id
   returning * into v_batch;

  for v_line in select distinct lot_id from public.export_batch_lots where export_batch_id = p_batch_id loop
    perform public.refresh_lot_stock_status(v_line.lot_id);
  end loop;

  if not exists (select 1 from public.export_batches
                 where sales_order_id = v_batch.sales_order_id and status <> 'cancelled') then
    update public.sales_orders set status = 'export_accepted'
     where id = v_batch.sales_order_id and status = 'processing';
  end if;
  return to_jsonb(v_batch);
end $$;

revoke all on function public.create_export_batch(uuid, jsonb, text) from public, anon;
revoke all on function public.set_export_batch_status(uuid, text, text) from public, anon;
grant execute on function public.create_export_batch(uuid, jsonb, text) to authenticated;
grant execute on function public.set_export_batch_status(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Shipments: creation rules and status propagation
-- -----------------------------------------------------------------------------
create or replace function public.shipments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_batch public.export_batches;
begin
  if tg_op = 'INSERT' then
    select * into v_batch from public.export_batches where id = new.export_batch_id for update;
    if not found then
      perform public.app_error('P0400', 'Select the export batch being shipped.');
    end if;
    if v_batch.status not in ('ready', 'approved') then
      perform public.app_error('P0409', format('Batch %s is %s; shipments can only be created for ready or approved batches.', v_batch.batch_number, v_batch.status));
    end if;
    if exists (select 1 from public.shipments where export_batch_id = new.export_batch_id and status <> 'cancelled') then
      perform public.app_error('P0409', format('Batch %s already has an active shipment.', v_batch.batch_number));
    end if;
    if auth.uid() is not null and new.status not in ('preparing', 'booked') then
      new.status := 'preparing';
    end if;
    new.export_manager_id := coalesce(new.export_manager_id, auth.uid());
    new.destination_country := coalesce(nullif(btrim(new.destination_country), ''), v_batch.destination_country);
    new.destination_port := coalesce(nullif(btrim(new.destination_port), ''), v_batch.destination_port);
    return new;
  end if;

  if new.export_batch_id is distinct from old.export_batch_id and auth.uid() is not null then
    perform public.app_error('P0400', 'A shipment cannot be moved to another batch.');
  end if;
  if new.status is distinct from old.status then
    if new.status = 'in_transit' then
      new.shipping_date := coalesce(new.shipping_date, current_date);
    elsif new.status = 'arrived' then
      new.actual_arrival := coalesce(new.actual_arrival, current_date);
    elsif new.status = 'cancelled' then
      new.cancelled_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cc_shipments_guard on public.shipments;
create trigger cc_shipments_guard before insert or update on public.shipments
  for each row execute function public.shipments_guard();

create or replace function public.shipments_propagate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_batch public.export_batches;
  v_line record;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  perform public.begin_workflow();
  insert into public.shipment_updates (shipment_id, status, description, created_by)
  values (new.id, new.status,
          case when tg_op = 'INSERT' then 'Shipment created'
               else 'Status changed to ' || replace(new.status, '_', ' ') end,
          auth.uid());

  if tg_op = 'INSERT' then
    return null;
  end if;

  select * into v_batch from public.export_batches where id = new.export_batch_id for update;

  if new.status = 'in_transit' and v_batch.status in ('ready', 'approved') then
    update public.export_batches set status = 'shipped' where id = v_batch.id;
    update public.sales_orders set status = 'shipped' where id = v_batch.sales_order_id and status = 'processing';
    for v_line in select distinct lot_id from public.export_batch_lots where export_batch_id = v_batch.id loop
      perform public.refresh_lot_stock_status(v_line.lot_id);
    end loop;
  elsif new.status = 'completed' and v_batch.status = 'shipped' then
    update public.export_batches set status = 'completed' where id = v_batch.id;
    if not exists (select 1 from public.export_batches
                   where sales_order_id = v_batch.sales_order_id and status not in ('completed', 'cancelled')) then
      update public.sales_orders set status = 'completed' where id = v_batch.sales_order_id and status = 'shipped';
    end if;
  end if;
  return null;
end $$;
drop trigger if exists dd_shipments_propagate on public.shipments;
create trigger dd_shipments_propagate after insert or update of status on public.shipments
  for each row execute function public.shipments_propagate();

create or replace function public.shipment_updates_defaults()
returns trigger language plpgsql as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  new.event_time := coalesce(new.event_time, now());
  return new;
end $$;
drop trigger if exists cc_shipment_updates_defaults on public.shipment_updates;
create trigger cc_shipment_updates_defaults before insert on public.shipment_updates
  for each row execute function public.shipment_updates_defaults();

-- -----------------------------------------------------------------------------
-- 11. Documents: uploader is always the caller
-- -----------------------------------------------------------------------------
create or replace function public.documents_defaults()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.uploaded_by := auth.uid();
    end if;
  else
    new.uploaded_by := old.uploaded_by;
    new.file_path := old.file_path;
  end if;
  return new;
end $$;
drop trigger if exists cc_documents_defaults on public.documents;
create trigger cc_documents_defaults before insert or update on public.documents
  for each row execute function public.documents_defaults();

-- -----------------------------------------------------------------------------
-- 12. Employee accounts (used when the API has no service-role key)
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_employee_user(
  p_email text, p_password text, p_full_name text, p_role text
) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid := gen_random_uuid();
  v_caller text;
  v_cols text := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at';
  v_vals text := '$1, $2, ''authenticated'', ''authenticated'', $3, $4, now(), $5, $6, now(), now()';
  c text;
begin
  if not public.is_admin() then
    perform public.app_error('P0403', 'Only administrators can create employee accounts.');
  end if;
  select role into v_caller from public.profiles where id = auth.uid();

  if not public.valid_email(v_email) then
    perform public.app_error('P0400', 'A valid email address is required.');
  end if;
  if p_password is null or length(p_password) < 8 then
    perform public.app_error('P0400', 'Password must be at least 8 characters.');
  end if;
  if coalesce(length(btrim(p_full_name)), 0) < 2 then
    perform public.app_error('P0400', 'Full name is required.');
  end if;
  if p_role is null or p_role not in ('super_admin', 'admin', 'sales', 'export_manager', 'procurement', 'field_officer',
                                      'quality', 'quality_officer', 'warehouse', 'warehouse_officer') then
    perform public.app_error('P0400', 'Invalid employee role.');
  end if;
  if p_role = 'super_admin' and v_caller <> 'super_admin' then
    perform public.app_error('P0403', 'Only a super admin can create another super admin.');
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform public.app_error('P0409', 'A user with this email already exists.');
  end if;

  -- GoTrue expects these token columns to be empty strings, not NULL.
  foreach c in array array['confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                           'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token'] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'auth' and table_name = 'users' and column_name = c) then
      v_cols := v_cols || ', ' || c;
      v_vals := v_vals || ', ''''';
    end if;
  end loop;

  execute format('insert into auth.users (%s) values (%s)', v_cols, v_vals)
    using '00000000-0000-0000-0000-000000000000'::uuid, v_id, v_email,
          extensions.crypt(p_password, extensions.gen_salt('bf')),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('full_name', btrim(p_full_name));

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', v_id::text, now(), now(), now());

  insert into public.profiles (id, email, full_name, role, is_active)
  values (v_id, v_email, btrim(p_full_name), p_role, true)
  on conflict (id) do update
    set email = excluded.email, full_name = excluded.full_name, role = excluded.role, is_active = true;

  return jsonb_build_object('user_id', v_id, 'email', v_email, 'role', p_role);
end $$;
revoke all on function public.admin_create_employee_user(text, text, text, text) from public, anon;
grant execute on function public.admin_create_employee_user(text, text, text, text) to authenticated;
