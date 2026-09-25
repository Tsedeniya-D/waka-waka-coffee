-- Migration: Department visibility — align RLS with frontend MODULE_ACCESS
-- ---------------------------------------------------------------------------
-- Root cause: Sales (and some department synonyms) could open IMS pages but
-- PostgREST returned empty sets because lead/ops policies were admin-only or
-- listed only legacy role names (field_officer / quality_officer / warehouse_officer).
-- ---------------------------------------------------------------------------

-- Keep helpers current (id = auth.uid() OR user_id = auth.uid())
create or replace function public.is_role(allowed text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where (p.user_id = auth.uid() or p.id = auth.uid())
      and p.role = any(allowed)
  );
$$;

create or replace function public.has_role(allowed text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_role(allowed);
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_role(array['super_admin', 'admin']);
$$;

-- ---------------------------------------------------------------------------
-- 1. Sales + Admin manage public-site leads (shared records, one source of truth)
-- ---------------------------------------------------------------------------
drop policy if exists "staff_manage_contact" on public.contact_messages;
create policy "staff_manage_contact"
  on public.contact_messages for all
  to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));

drop policy if exists "staff_manage_quotes" on public.quote_requests;
create policy "staff_manage_quotes"
  on public.quote_requests for all
  to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));

drop policy if exists "staff_manage_samples" on public.sample_requests;
create policy "staff_manage_samples"
  on public.sample_requests for all
  to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 2. Role synonym gaps on shared ops read/create policies
-- ---------------------------------------------------------------------------
drop policy if exists "field_read_suppliers" on public.suppliers;
create policy "field_read_suppliers" on public.suppliers for select
  using (public.is_role(array[
    'procurement', 'field_officer',
    'quality', 'quality_officer',
    'warehouse', 'warehouse_officer',
    'sales', 'export_manager',
    'admin', 'super_admin'
  ]));

drop policy if exists "field_read_collections" on public.collection_records;
create policy "field_read_collections" on public.collection_records for select
  using (
    public.is_admin()
    or field_officer_id = auth.uid()
    or public.is_role(array[
      'procurement', 'field_officer',
      'quality', 'quality_officer',
      'warehouse', 'warehouse_officer',
      'sales', 'export_manager'
    ])
  );

drop policy if exists "field_insert_collections" on public.collection_records;
create policy "field_insert_collections" on public.collection_records for insert
  with check (public.is_role(array[
    'procurement', 'field_officer', 'admin', 'super_admin'
  ]));

drop policy if exists "ops_read_lots" on public.coffee_lots;
create policy "ops_read_lots" on public.coffee_lots for select
  using (public.is_role(array[
    'procurement', 'field_officer',
    'quality', 'quality_officer',
    'warehouse', 'warehouse_officer',
    'sales', 'export_manager',
    'admin', 'super_admin'
  ]));

drop policy if exists "field_create_lots" on public.coffee_lots;
create policy "field_create_lots" on public.coffee_lots for insert
  with check (public.is_role(array[
    'procurement', 'field_officer', 'admin', 'super_admin'
  ]));

drop policy if exists "ops_read_quality" on public.quality_inspections;
create policy "ops_read_quality" on public.quality_inspections for select
  using (public.is_role(array[
    'procurement', 'field_officer',
    'quality', 'quality_officer',
    'warehouse', 'warehouse_officer',
    'sales', 'export_manager',
    'admin', 'super_admin'
  ]));

drop policy if exists "ops_read_warehouses" on public.warehouses;
create policy "ops_read_warehouses" on public.warehouses for select
  using (public.is_role(array[
    'procurement', 'field_officer',
    'quality', 'quality_officer',
    'warehouse', 'warehouse_officer',
    'sales', 'export_manager',
    'admin', 'super_admin'
  ]));

drop policy if exists "ops_read_inventory" on public.inventory_transactions;
create policy "ops_read_inventory" on public.inventory_transactions for select
  using (public.is_role(array[
    'quality', 'quality_officer',
    'warehouse', 'warehouse_officer',
    'sales', 'export_manager',
    'admin', 'super_admin'
  ]));

-- ---------------------------------------------------------------------------
-- 3. Live tables used by IMS UIs but missing from earlier migrations
--    (safe no-ops if already present; RLS only when tables exist)
-- ---------------------------------------------------------------------------

-- inventory (stock balances — distinct from inventory_transactions)
do $$
begin
  if to_regclass('public.inventory') is not null then
    execute 'alter table public.inventory enable row level security';

    execute 'drop policy if exists "warehouse_manage_inventory_stock" on public.inventory';
    execute $pol$
      create policy "warehouse_manage_inventory_stock" on public.inventory for all
        using (public.is_role(array['warehouse', 'warehouse_officer', 'admin', 'super_admin']))
        with check (public.is_role(array['warehouse', 'warehouse_officer', 'admin', 'super_admin']))
    $pol$;

    execute 'drop policy if exists "ops_read_inventory_stock" on public.inventory';
    execute $pol$
      create policy "ops_read_inventory_stock" on public.inventory for select
        using (public.is_role(array[
          'quality', 'quality_officer',
          'warehouse', 'warehouse_officer',
          'sales', 'export_manager',
          'admin', 'super_admin'
        ]))
    $pol$;
  end if;
end $$;

-- farmers / farms (procurement source data)
do $$
begin
  if to_regclass('public.farmers') is not null then
    execute 'alter table public.farmers enable row level security';

    execute 'drop policy if exists "procurement_manage_farmers" on public.farmers';
    execute $pol$
      create policy "procurement_manage_farmers" on public.farmers for all
        using (public.is_role(array['procurement', 'field_officer', 'admin', 'super_admin']))
        with check (public.is_role(array['procurement', 'field_officer', 'admin', 'super_admin']))
    $pol$;

    execute 'drop policy if exists "ops_read_farmers" on public.farmers';
    execute $pol$
      create policy "ops_read_farmers" on public.farmers for select
        using (public.is_role(array[
          'procurement', 'field_officer',
          'quality', 'quality_officer',
          'warehouse', 'warehouse_officer',
          'export_manager',
          'admin', 'super_admin'
        ]))
    $pol$;
  end if;

  if to_regclass('public.farms') is not null then
    execute 'alter table public.farms enable row level security';

    execute 'drop policy if exists "procurement_manage_farms" on public.farms';
    execute $pol$
      create policy "procurement_manage_farms" on public.farms for all
        using (public.is_role(array['procurement', 'field_officer', 'admin', 'super_admin']))
        with check (public.is_role(array['procurement', 'field_officer', 'admin', 'super_admin']))
    $pol$;

    execute 'drop policy if exists "ops_read_farms" on public.farms';
    execute $pol$
      create policy "ops_read_farms" on public.farms for select
        using (public.is_role(array[
          'procurement', 'field_officer',
          'quality', 'quality_officer',
          'warehouse', 'warehouse_officer',
          'export_manager',
          'admin', 'super_admin'
        ]))
    $pol$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Products: Sales + Export Manager can manage catalog (matches MODULE_ACCESS)
--    Public remains read-only for active products only.
-- ---------------------------------------------------------------------------
drop policy if exists "staff_manage_products" on public.products;
create policy "staff_manage_products"
  on public.products for all
  to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));

drop policy if exists "staff_manage_product_images" on public.product_images;
create policy "staff_manage_product_images"
  on public.product_images for all
  to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));

-- Storage uploads for product images (admin OR sales/export)
drop policy if exists "Admin upload product-images" on storage.objects;
drop policy if exists "staff_upload_product_images" on storage.objects;
create policy "staff_upload_product_images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.is_role(array['sales', 'export_manager', 'admin', 'super_admin'])
  );

drop policy if exists "Admin update product-images" on storage.objects;
drop policy if exists "staff_update_product_images" on storage.objects;
create policy "staff_update_product_images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_role(array['sales', 'export_manager', 'admin', 'super_admin'])
  )
  with check (
    bucket_id = 'product-images'
    and public.is_role(array['sales', 'export_manager', 'admin', 'super_admin'])
  );

drop policy if exists "Admin delete product-images" on storage.objects;
drop policy if exists "staff_delete_product_images" on storage.objects;
create policy "staff_delete_product_images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_role(array['sales', 'export_manager', 'admin', 'super_admin'])
  );

-- ---------------------------------------------------------------------------
-- 5. Ensure sample_requests column shape matches live IMS + public RPC
--    (idempotent: only renames/adds when needed)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sample_requests') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'full_name'
  ) then
    execute 'alter table public.sample_requests rename column name to full_name';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'quantity'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'sample_quantity'
  ) then
    execute 'alter table public.sample_requests rename column quantity to sample_quantity';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'notes'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'message'
  ) then
    execute 'alter table public.sample_requests rename column notes to message';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'sample_quantity_unit'
  ) then
    execute 'alter table public.sample_requests add column sample_quantity_unit text';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'tracking_number'
  ) then
    execute 'alter table public.sample_requests add column tracking_number text';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'admin_notes'
  ) then
    execute 'alter table public.sample_requests add column admin_notes text';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests' and column_name = 'phone'
  ) then
    execute 'alter table public.sample_requests add column phone text';
  end if;
end $$;

-- Public secure submit RPC (matches RequestSample.tsx). SECURITY DEFINER inserts only.
create or replace function public.submit_sample_request(
  p_full_name text,
  p_company text default null,
  p_email text default null,
  p_country text default null,
  p_product_name text default null,
  p_sample_quantity numeric default null,
  p_sample_quantity_unit text default null,
  p_shipping_address text default null,
  p_message text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_year text := to_char(now() at time zone 'utc', 'YYYY');
  v_seq int;
begin
  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'full_name is required';
  end if;
  if p_email is null or trim(p_email) = '' then
    raise exception 'email is required';
  end if;

  select coalesce(max(
    nullif(regexp_replace(reference_number, '^WAKA-SAMPLE-' || v_year || '-', ''), '')::int
  ), 0) + 1
  into v_seq
  from public.sample_requests
  where reference_number ~ ('^WAKA-SAMPLE-' || v_year || '-[0-9]+$');

  v_ref := 'WAKA-SAMPLE-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into public.sample_requests (
    reference_number,
    full_name,
    company,
    email,
    country,
    product_name,
    sample_quantity,
    sample_quantity_unit,
    shipping_address,
    message,
    status
  ) values (
    v_ref,
    trim(p_full_name),
    nullif(trim(coalesce(p_company, '')), ''),
    lower(trim(p_email)),
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_product_name, '')), ''),
    p_sample_quantity,
    coalesce(nullif(trim(coalesce(p_sample_quantity_unit, '')), ''), 'kg'),
    nullif(trim(coalesce(p_shipping_address, '')), ''),
    nullif(trim(coalesce(p_message, '')), ''),
    'new'
  );

  return v_ref;
end;
$$;

revoke all on function public.submit_sample_request(
  text, text, text, text, text, numeric, text, text, text
) from public;
grant execute on function public.submit_sample_request(
  text, text, text, text, text, numeric, text, text, text
) to anon, authenticated;
