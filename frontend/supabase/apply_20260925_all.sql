-- Waka Coffee: all 2026-09-25 migrations in order (paste into the Supabase SQL editor and Run once).
-- Generated from migrations/20260925000100..500. Safe to re-run.

-- ============================== migrations/20260925000100_schema_reconciliation.sql
-- =============================================================================
-- Waka Coffee — 2026-09-25 (1/5): schema reconciliation
-- =============================================================================
-- The deployed database and the SQL files in this folder had drifted apart
-- (e.g. the live `profiles` table has no `user_id`, quote/sample requests have
-- no `customer_id`, `farmers` / `farms` / `inventory` exist only in the live DB,
-- `quote_items` / `documents` / `locations` exist nowhere).
--
-- This migration converges BOTH a fresh install (init.sql) and the live
-- database onto one schema. It is additive and idempotent:
--   * `create table if not exists` / `add column if not exists`
--   * constraints are added NOT VALID so existing rows never block it
--   * no existing column or row is dropped
--
-- Identity rule used everywhere: profiles.id = auth.users.id
-- (notifications.user_id, sales_person_id, inspector_id, ... all store it).
-- =============================================================================

create extension if not exists pgcrypto;

-- Utility: drop CHECK constraints that mention a given column, so a canonical
-- constraint can replace whatever the deployed database happens to have.
create or replace function pg_temp.drop_column_checks(p_table regclass, p_column text)
returns void language plpgsql as $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = p_table and c.contype = 'c' and a.attname = p_column
  loop
    execute format('alter table %s drop constraint %I', p_table, r.conname);
  end loop;
end $$;

create or replace function pg_temp.column_exists(p_table text, p_column text)
returns boolean language sql stable as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_column
  );
$$;

-- Utility: add a foreign key when the column exists but has none (columns that
-- pre-date this migration were sometimes created without a reference).
create or replace function pg_temp.ensure_fk(
  p_table text, p_column text, p_ref_table text, p_on_delete text default 'set null'
) returns void language plpgsql as $$
begin
  if to_regclass('public.' || p_table) is null or to_regclass('public.' || p_ref_table) is null then
    return;
  end if;
  if exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = ('public.' || p_table)::regclass and c.contype = 'f' and a.attname = p_column
  ) then
    return;
  end if;
  execute format(
    'alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s not valid',
    p_table, p_table || '_' || p_column || '_fkey', p_column, p_ref_table, p_on_delete);
end $$;

-- Shared updated_at trigger function
create or replace function public.update_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Profiles (identity = auth.users.id)
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'user';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists is_active boolean default true;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- Fresh installs (init.sql) created profiles.id as a random uuid plus user_id.
-- Converge on profiles.id = auth user id so one identity is used everywhere.
do $$
begin
  if pg_temp.column_exists('profiles', 'user_id') then
    update public.profiles p
       set id = p.user_id
     where p.user_id is not null
       and p.id is distinct from p.user_id
       and not exists (select 1 from public.profiles x where x.id = p.user_id);
  end if;
end $$;

update public.profiles set is_active = true where is_active is null;
update public.profiles set role = 'user' where role is null or btrim(role) = '';
alter table public.profiles alter column is_active set default true;
alter table public.profiles alter column is_active set not null;
alter table public.profiles alter column role set default 'user';
alter table public.profiles alter column role set not null;

select pg_temp.drop_column_checks('public.profiles', 'role');
alter table public.profiles add constraint profiles_role_check check (role in (
  'super_admin', 'admin', 'sales', 'export_manager', 'procurement', 'field_officer',
  'quality', 'quality_officer', 'warehouse', 'warehouse_officer', 'user'
)) not valid;

create index if not exists profiles_role_idx on public.profiles (role) where is_active;

-- -----------------------------------------------------------------------------
-- 2. Reference-number counters (race-free, replaces client-side numbering)
-- -----------------------------------------------------------------------------
create table if not exists public.document_counters (
  scope text not null,
  period text not null default '',
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, period)
);

create or replace function public.next_document_code(
  p_scope text, p_prefix text, p_yearly boolean default true, p_width int default 4
) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_period text := case when p_yearly then to_char(now() at time zone 'utc', 'YYYY') else '' end;
  v_n bigint;
begin
  insert into public.document_counters as c (scope, period, last_value)
  values (p_scope, v_period, 1)
  on conflict (scope, period)
  do update set last_value = c.last_value + 1, updated_at = now()
  returning c.last_value into v_n;

  return p_prefix || '-' || case when p_yearly then v_period || '-' else '' end
         || lpad(v_n::text, p_width, '0');
end $$;

revoke all on function public.next_document_code(text, text, boolean, int) from public, anon, authenticated;

-- BEFORE INSERT trigger: fill a code column when the client did not send one.
-- args: column, scope, prefix, yearly ('true'/'false'), width
create or replace function public.assign_document_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_col text := tg_argv[0];
  v_code text;
  v_taken boolean;
  v_try int := 0;
begin
  if coalesce(btrim(to_jsonb(new) ->> v_col), '') <> '' then
    return new;
  end if;

  loop
    v_try := v_try + 1;
    v_code := public.next_document_code(tg_argv[1], tg_argv[2], tg_argv[3]::boolean, tg_argv[4]::int);
    execute format('select exists (select 1 from %I.%I where %I = $1)', tg_table_schema, tg_table_name, v_col)
      into v_taken using v_code;
    exit when not v_taken or v_try >= 50;
  end loop;

  new := jsonb_populate_record(new, jsonb_build_object(v_col, v_code));
  return new;
end $$;

-- Seed a counter from codes already stored so new numbers never collide.
create or replace function pg_temp.seed_counter(
  p_scope text, p_prefix text, p_yearly boolean, p_width int, p_table text, p_column text
) returns void language plpgsql as $$
declare r record;
begin
  if to_regclass('public.' || p_table) is null then return; end if;

  if p_yearly then
    for r in execute format(
      $q$select substring(%1$I from '^%2$s-([0-9]{4})-') as period,
                max(substring(%1$I from '^%2$s-[0-9]{4}-([0-9]+)$')::bigint) as mx
           from public.%3$I
          where %1$I ~ ('^%2$s-[0-9]{4}-[0-9]{%4$s}$')
          group by 1$q$,
      p_column, p_prefix, p_table, p_width)
    loop
      insert into public.document_counters (scope, period, last_value)
      values (p_scope, r.period, r.mx)
      on conflict (scope, period) do update
        set last_value = greatest(public.document_counters.last_value, excluded.last_value);
    end loop;
  else
    for r in execute format(
      $q$select max(substring(%1$I from '^%2$s-([0-9]+)$')::bigint) as mx
           from public.%3$I
          where %1$I ~ ('^%2$s-[0-9]{%4$s}$')$q$,
      p_column, p_prefix, p_table, p_width)
    loop
      if r.mx is not null then
        insert into public.document_counters (scope, period, last_value)
        values (p_scope, '', r.mx)
        on conflict (scope, period) do update
          set last_value = greatest(public.document_counters.last_value, excluded.last_value);
      end if;
    end loop;
  end if;
end $$;

-- Attach a code trigger (named to fire before any legacy generator) and drop
-- column defaults so every code comes from one generator.
create or replace function pg_temp.attach_code(
  p_table text, p_column text, p_scope text, p_prefix text, p_yearly boolean, p_width int
) returns void language plpgsql as $$
begin
  if to_regclass('public.' || p_table) is null then return; end if;
  execute format('alter table public.%I alter column %I drop default', p_table, p_column);
  execute format('drop trigger if exists aa_assign_%s on public.%I', p_column, p_table);
  execute format(
    'create trigger aa_assign_%s before insert on public.%I for each row execute function public.assign_document_code(%L, %L, %L, %L, %L)',
    p_column, p_table, p_column, p_scope, p_prefix, p_yearly::text, p_width::text);
  perform pg_temp.seed_counter(p_scope, p_prefix, p_yearly, p_width, p_table, p_column);
end $$;

-- -----------------------------------------------------------------------------
-- 3. Sourcing: suppliers, farmers, farms, locations, collections, lots
-- -----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text unique,
  name text not null,
  supplier_type text not null default 'cooperative',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suppliers add column if not exists contact_person text;
alter table public.suppliers add column if not exists phone text;
alter table public.suppliers add column if not exists email text;
alter table public.suppliers add column if not exists region text;
alter table public.suppliers add column if not exists zone text;
alter table public.suppliers add column if not exists woreda text;
alter table public.suppliers add column if not exists kebele text;
alter table public.suppliers add column if not exists address text;
alter table public.suppliers add column if not exists notes text;
alter table public.suppliers add column if not exists is_active boolean not null default true;
alter table public.suppliers add column if not exists created_by uuid;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  location_code text unique,
  name text not null,
  location_type text not null default 'collection_point',
  parent_id uuid references public.locations(id) on delete set null,
  region text,
  zone text,
  woreda text,
  kebele text,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  altitude_meters numeric(8,2),
  notes text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_type_check check (location_type in (
    'region', 'zone', 'woreda', 'kebele', 'collection_point', 'washing_station', 'port', 'other'
  )),
  constraint locations_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint locations_longitude_check check (longitude is null or longitude between -180 and 180)
);
create unique index if not exists locations_type_name_parent_uidx
  on public.locations (location_type, lower(name), coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.farmers (
  id uuid primary key default gen_random_uuid(),
  farmer_code text unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.farmers add column if not exists phone text;
alter table public.farmers add column if not exists email text;
alter table public.farmers add column if not exists region text;
alter table public.farmers add column if not exists zone text;
alter table public.farmers add column if not exists woreda text;
alter table public.farmers add column if not exists kebele text;
alter table public.farmers add column if not exists address text;
alter table public.farmers add column if not exists gender text;
alter table public.farmers add column if not exists national_id text;
alter table public.farmers add column if not exists notes text;
alter table public.farmers add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.farmers add column if not exists is_active boolean not null default true;
alter table public.farmers add column if not exists created_by uuid;
create index if not exists farmers_supplier_idx on public.farmers (supplier_id);

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  farm_code text unique,
  farmer_id uuid references public.farmers(id) on delete restrict,
  farm_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.farms add column if not exists region text;
alter table public.farms add column if not exists zone text;
alter table public.farms add column if not exists woreda text;
alter table public.farms add column if not exists kebele text;
alter table public.farms add column if not exists specific_location text;
alter table public.farms add column if not exists area_hectares numeric(10,2);
alter table public.farms add column if not exists coffee_variety text;
alter table public.farms add column if not exists altitude_meters numeric(8,2);
alter table public.farms add column if not exists latitude numeric(9,6);
alter table public.farms add column if not exists longitude numeric(9,6);
alter table public.farms add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.farms add column if not exists notes text;
alter table public.farms add column if not exists is_active boolean not null default true;
alter table public.farms add column if not exists created_by uuid;
create index if not exists farms_farmer_idx on public.farms (farmer_id);

create table if not exists public.collection_records (
  id uuid primary key default gen_random_uuid(),
  collection_code text unique,
  collection_date date not null default current_date,
  supplier_id uuid not null references public.suppliers(id),
  origin text not null,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.collection_records add column if not exists field_officer_id uuid;
alter table public.collection_records add column if not exists region text;
alter table public.collection_records add column if not exists zone text;
alter table public.collection_records add column if not exists woreda text;
alter table public.collection_records add column if not exists kebele text;
alter table public.collection_records add column if not exists coffee_type text default 'Arabica';
alter table public.collection_records add column if not exists variety text;
alter table public.collection_records add column if not exists processing_method text;
alter table public.collection_records add column if not exists grade text;
alter table public.collection_records add column if not exists purchase_price numeric(14,2);
alter table public.collection_records add column if not exists currency text default 'ETB';
alter table public.collection_records add column if not exists notes text;
alter table public.collection_records add column if not exists farmer_id uuid references public.farmers(id) on delete set null;
alter table public.collection_records add column if not exists farm_id uuid references public.farms(id) on delete set null;
alter table public.collection_records add column if not exists location_id uuid references public.locations(id) on delete set null;
create index if not exists collection_records_supplier_idx on public.collection_records (supplier_id);
create index if not exists collection_records_farmer_idx on public.collection_records (farmer_id);
create index if not exists collection_records_officer_idx on public.collection_records (field_officer_id);

select pg_temp.drop_column_checks('public.collection_records', 'status');
alter table public.collection_records add constraint collection_records_status_check check (status in (
  'submitted', 'verified', 'rejected', 'partially_processed', 'processed'
)) not valid;

create table if not exists public.coffee_lots (
  id uuid primary key default gen_random_uuid(),
  lot_code text unique,
  collection_id uuid not null references public.collection_records(id),
  supplier_id uuid not null references public.suppliers(id),
  origin text not null,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  status text not null default 'pending_quality',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.coffee_lots add column if not exists processing_method text;
alter table public.coffee_lots add column if not exists grade text;
alter table public.coffee_lots add column if not exists notes text;
alter table public.coffee_lots add column if not exists created_by uuid;
create index if not exists coffee_lots_collection_idx on public.coffee_lots (collection_id);
create index if not exists coffee_lots_status_idx on public.coffee_lots (status);

select pg_temp.drop_column_checks('public.coffee_lots', 'status');
alter table public.coffee_lots add constraint coffee_lots_status_check check (status in (
  'pending_quality', 'approved', 'rejected', 'in_warehouse', 'reserved', 'shipped', 'sold'
)) not valid;

-- -----------------------------------------------------------------------------
-- 4. Quality
-- -----------------------------------------------------------------------------
create table if not exists public.quality_inspections (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id) on delete cascade,
  inspection_date date not null default current_date,
  result text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quality_inspections add column if not exists inspector_id uuid;
alter table public.quality_inspections add column if not exists sample_type text default 'offer';
alter table public.quality_inspections add column if not exists sample_reference text;
alter table public.quality_inspections add column if not exists moisture numeric(5,2);
alter table public.quality_inspections add column if not exists defect_count integer;
alter table public.quality_inspections add column if not exists screen_size text;
alter table public.quality_inspections add column if not exists cup_score numeric(5,2);
alter table public.quality_inspections add column if not exists aroma text;
alter table public.quality_inspections add column if not exists flavor text;
alter table public.quality_inspections add column if not exists acidity text;
alter table public.quality_inspections add column if not exists body text;
alter table public.quality_inspections add column if not exists final_grade text;
alter table public.quality_inspections add column if not exists approval_status text default 'pending';
alter table public.quality_inspections add column if not exists approved_by uuid;
alter table public.quality_inspections add column if not exists approved_at timestamptz;
alter table public.quality_inspections add column if not exists notes text;
update public.quality_inspections set approval_status = 'pending' where approval_status is null;
update public.quality_inspections set sample_type = 'offer' where sample_type is null;

-- A lot is inspected more than once (offer, pre-shipment, arrival samples):
-- drop the old one-inspection-per-lot unique constraint if present.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.quality_inspections'::regclass
      and c.contype = 'u'
      and c.conkey = array[(select attnum from pg_attribute
                            where attrelid = 'public.quality_inspections'::regclass and attname = 'lot_id')]::smallint[]
  loop
    execute format('alter table public.quality_inspections drop constraint %I', r.conname);
  end loop;
end $$;
create index if not exists quality_inspections_lot_idx on public.quality_inspections (lot_id, inspection_date desc);

select pg_temp.drop_column_checks('public.quality_inspections', 'result');
select pg_temp.drop_column_checks('public.quality_inspections', 'approval_status');
select pg_temp.drop_column_checks('public.quality_inspections', 'sample_type');
select pg_temp.drop_column_checks('public.quality_inspections', 'cup_score');
select pg_temp.drop_column_checks('public.quality_inspections', 'moisture');
alter table public.quality_inspections add constraint quality_inspections_result_check
  check (result in ('pending', 'passed', 'failed')) not valid;
alter table public.quality_inspections add constraint quality_inspections_approval_check
  check (approval_status in ('pending', 'approved', 'rejected')) not valid;
alter table public.quality_inspections add constraint quality_inspections_sample_type_check
  check (sample_type in ('offer', 'pre_shipment', 'arrival', 'type_sample', 'other')) not valid;
alter table public.quality_inspections add constraint quality_inspections_cup_score_check
  check (cup_score is null or cup_score between 0 and 100) not valid;
alter table public.quality_inspections add constraint quality_inspections_moisture_check
  check (moisture is null or moisture between 0 and 100) not valid;

-- -----------------------------------------------------------------------------
-- 5. Warehouses & inventory
-- -----------------------------------------------------------------------------
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.warehouses add column if not exists location text;
alter table public.warehouses add column if not exists capacity_kg numeric(14,2);
alter table public.warehouses add column if not exists is_active boolean not null default true;
alter table public.warehouses add column if not exists status text default 'active';
alter table public.warehouses add column if not exists manager_id uuid references public.profiles(id) on delete set null;
alter table public.warehouses add column if not exists contact_person text;
alter table public.warehouses add column if not exists phone text;
alter table public.warehouses add column if not exists email text;
alter table public.warehouses add column if not exists notes text;
alter table public.warehouses add column if not exists temperature_min_c numeric;
alter table public.warehouses add column if not exists temperature_max_c numeric;
alter table public.warehouses add column if not exists humidity_min_percent numeric;
alter table public.warehouses add column if not exists humidity_max_percent numeric;
alter table public.warehouses add column if not exists ventilation text;
alter table public.warehouses add column if not exists lighting text;
alter table public.warehouses add column if not exists pallet_required boolean default true;
alter table public.warehouses add column if not exists wall_clearance_m numeric;
alter table public.warehouses add column if not exists ceiling_clearance_m numeric;
alter table public.warehouses add column if not exists packaging_type text;
alter table public.warehouses add column if not exists quality_check_zone text;
alter table public.warehouses add column if not exists pass_zone text;
alter table public.warehouses add column if not exists fail_zone text;
alter table public.warehouses add column if not exists sampling_frequency text;
alter table public.warehouses add column if not exists moisture_limit_percent numeric;
alter table public.warehouses add column if not exists pest_control_method text;
alter table public.warehouses add column if not exists sanitation_schedule text;
alter table public.warehouses add column if not exists location_id uuid references public.locations(id) on delete set null;
update public.warehouses set status = case when is_active then 'active' else 'inactive' end
 where status is null or status not in ('active', 'inactive');

select pg_temp.drop_column_checks('public.warehouses', 'capacity_kg');
alter table public.warehouses add constraint warehouses_capacity_check
  check (capacity_kg is null or capacity_kg >= 0) not valid;

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id),
  warehouse_id uuid not null references public.warehouses(id),
  quantity_kg numeric(14,2) not null default 0,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.inventory add column if not exists bag_count integer;
alter table public.inventory add column if not exists weight_per_bag_kg numeric;
alter table public.inventory add column if not exists unit_cost_per_kg numeric;
alter table public.inventory add column if not exists shipping_cost numeric;
alter table public.inventory add column if not exists par_level_bags integer;
alter table public.inventory add column if not exists roast_loss_percent numeric;
alter table public.inventory add column if not exists coffee_type text default 'Green Coffee';
alter table public.inventory add column if not exists inventory_type text default 'green';
alter table public.inventory add column if not exists received_date date default current_date;
alter table public.inventory add column if not exists notes text;
update public.inventory set quantity_kg = 0 where quantity_kg is null;
update public.inventory set status = 'available' where status is null;

select pg_temp.drop_column_checks('public.inventory', 'quantity_kg');
select pg_temp.drop_column_checks('public.inventory', 'status');
alter table public.inventory add constraint inventory_quantity_non_negative check (quantity_kg >= 0) not valid;
alter table public.inventory add constraint inventory_status_check
  check (status in ('available', 'reserved', 'shipped', 'depleted')) not valid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory'::regclass and contype = 'u'
      and conkey @> array[(select attnum from pg_attribute where attrelid = 'public.inventory'::regclass and attname = 'lot_id'),
                          (select attnum from pg_attribute where attrelid = 'public.inventory'::regclass and attname = 'warehouse_id')]::smallint[]
  ) then
    if exists (select 1 from public.inventory group by lot_id, warehouse_id having count(*) > 1) then
      raise notice 'inventory has duplicate (lot_id, warehouse_id) rows; merge them, then add the unique constraint inventory_lot_warehouse_key';
    else
      alter table public.inventory add constraint inventory_lot_warehouse_key unique (lot_id, warehouse_id);
    end if;
  end if;
end $$;
create index if not exists inventory_warehouse_idx on public.inventory (warehouse_id);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id),
  warehouse_id uuid not null references public.warehouses(id),
  transaction_type text not null,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  created_at timestamptz not null default now()
);
alter table public.inventory_transactions add column if not exists reference_type text;
alter table public.inventory_transactions add column if not exists reference_id uuid;
alter table public.inventory_transactions add column if not exists notes text;
alter table public.inventory_transactions add column if not exists performed_by uuid;
alter table public.inventory_transactions add column if not exists balance_after numeric(14,2);
create index if not exists inventory_transactions_lot_idx on public.inventory_transactions (lot_id, created_at desc);
create index if not exists inventory_transactions_ref_idx on public.inventory_transactions (reference_type, reference_id);

select pg_temp.drop_column_checks('public.inventory_transactions', 'transaction_type');
alter table public.inventory_transactions add constraint inventory_transactions_type_check check (transaction_type in (
  'receipt', 'issue', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out',
  'export_allocation', 'export_release',
  'in', 'out', 'adjustment'  -- legacy values
)) not valid;

-- -----------------------------------------------------------------------------
-- 6. Customers, public requests, quotations
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  company_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customers add column if not exists contact_person text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists country text;
alter table public.customers add column if not exists city text;
alter table public.customers add column if not exists destination_port text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists notes text;
alter table public.customers add column if not exists source text default 'Manual';
alter table public.customers add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.customers add column if not exists created_by uuid;
update public.customers set source = 'Manual' where source is null;

select pg_temp.drop_column_checks('public.customers', 'status');
select pg_temp.drop_column_checks('public.customers', 'source');
alter table public.customers add constraint customers_status_check check (status in ('active', 'inactive')) not valid;
alter table public.customers add constraint customers_source_check
  check (source in ('Manual', 'Quote Request', 'Sample Request', 'Contact Message')) not valid;

do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'customers_email_lower_uidx') then
    if exists (
      select 1 from public.customers
      where email is not null and btrim(email) <> ''
      group by lower(email) having count(*) > 1
    ) then
      raise notice 'customers contains duplicate emails; unique index customers_email_lower_uidx not created';
    else
      create unique index customers_email_lower_uidx on public.customers (lower(email))
        where email is not null and btrim(email) <> '';
    end if;
  end if;
end $$;

-- contact_messages: fresh installs have first_name/last_name, live has name/subject.
alter table public.contact_messages add column if not exists name text;
alter table public.contact_messages add column if not exists email text;
alter table public.contact_messages add column if not exists phone text;
alter table public.contact_messages add column if not exists company text;
alter table public.contact_messages add column if not exists country text;
alter table public.contact_messages add column if not exists subject text;
alter table public.contact_messages add column if not exists message text;
alter table public.contact_messages add column if not exists status text default 'new';
alter table public.contact_messages add column if not exists admin_notes text;
alter table public.contact_messages add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.contact_messages add column if not exists created_at timestamptz default now();
alter table public.contact_messages add column if not exists updated_at timestamptz default now();
do $$
begin
  if pg_temp.column_exists('contact_messages', 'first_name') then
    execute $u$update public.contact_messages
                 set name = nullif(btrim(concat_ws(' ', first_name, last_name)), '')
               where name is null$u$;
  end if;
end $$;
select pg_temp.drop_column_checks('public.contact_messages', 'status');
alter table public.contact_messages add constraint contact_messages_status_check
  check (status in ('new', 'unread', 'read', 'replied', 'closed')) not valid;

-- newsletter_subscribers: converge on (email, is_active, subscribed_at)
alter table public.newsletter_subscribers add column if not exists is_active boolean default true;
alter table public.newsletter_subscribers add column if not exists subscribed_at timestamptz default now();
alter table public.newsletter_subscribers add column if not exists unsubscribed_at timestamptz;
alter table public.newsletter_subscribers add column if not exists source text default 'website';
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'newsletter_email_lower_uidx') then
    if exists (select 1 from public.newsletter_subscribers group by lower(email) having count(*) > 1) then
      raise notice 'newsletter_subscribers has duplicate emails; unique index not created';
    else
      create unique index newsletter_email_lower_uidx on public.newsletter_subscribers (lower(email));
    end if;
  end if;
end $$;

-- quote_requests
alter table public.quote_requests add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.quote_requests add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.quote_requests add column if not exists admin_notes text;
alter table public.quote_requests add column if not exists currency text default 'USD';
alter table public.quote_requests add column if not exists incoterm text;
alter table public.quote_requests add column if not exists payment_terms text;
alter table public.quote_requests add column if not exists valid_until date;
alter table public.quote_requests add column if not exists quotation_notes text;
alter table public.quote_requests add column if not exists quoted_at timestamptz;
alter table public.quote_requests add column if not exists region_name text;
alter table public.quote_requests add column if not exists product_name text;
alter table public.quote_requests add column if not exists grade text;
alter table public.quote_requests add column if not exists processing text;
alter table public.quote_requests add column if not exists destination_port text;
alter table public.quote_requests add column if not exists certifications text[];
alter table public.quote_requests add column if not exists target_shipment text;
alter table public.quote_requests add column if not exists updated_at timestamptz default now();
create index if not exists quote_requests_customer_idx on public.quote_requests (customer_id);
create index if not exists quote_requests_status_idx on public.quote_requests (status, created_at desc);
create unique index if not exists quote_requests_reference_uidx on public.quote_requests (reference_number)
  where reference_number is not null;

select pg_temp.drop_column_checks('public.quote_requests', 'status');
alter table public.quote_requests add constraint quote_requests_status_check check (status in (
  'new', 'reviewing', 'contacted', 'quoted', 'accepted', 'rejected', 'converted'
)) not valid;

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  grade text,
  processing_method text,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  unit_price numeric(14,2) check (unit_price is null or unit_price >= 0),
  currency text not null default 'USD',
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quote_items_quote_idx on public.quote_items (quote_request_id, sort_order);

-- sample_requests: fresh installs used name/quantity/notes
do $$
begin
  if pg_temp.column_exists('sample_requests', 'name') and not pg_temp.column_exists('sample_requests', 'full_name') then
    alter table public.sample_requests rename column name to full_name;
  end if;
  if pg_temp.column_exists('sample_requests', 'quantity') and not pg_temp.column_exists('sample_requests', 'sample_quantity') then
    alter table public.sample_requests rename column quantity to sample_quantity;
  end if;
  if pg_temp.column_exists('sample_requests', 'notes') and not pg_temp.column_exists('sample_requests', 'message') then
    alter table public.sample_requests rename column notes to message;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sample_requests'
      and column_name = 'sample_quantity' and data_type = 'text'
  ) then
    alter table public.sample_requests alter column sample_quantity type numeric using (
      case when sample_quantity ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then btrim(sample_quantity)::numeric end
    );
  end if;
end $$;
alter table public.sample_requests add column if not exists full_name text;
alter table public.sample_requests add column if not exists sample_quantity numeric;
alter table public.sample_requests add column if not exists sample_quantity_unit text default 'kg';
alter table public.sample_requests add column if not exists message text;
alter table public.sample_requests add column if not exists phone text;
alter table public.sample_requests add column if not exists tracking_number text;
alter table public.sample_requests add column if not exists courier text;
alter table public.sample_requests add column if not exists shipped_at timestamptz;
alter table public.sample_requests add column if not exists delivered_at timestamptz;
alter table public.sample_requests add column if not exists admin_notes text;
alter table public.sample_requests add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.sample_requests add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.sample_requests add column if not exists updated_at timestamptz default now();
create index if not exists sample_requests_customer_idx on public.sample_requests (customer_id);
create index if not exists sample_requests_status_idx on public.sample_requests (status, created_at desc);
create unique index if not exists sample_requests_reference_uidx on public.sample_requests (reference_number)
  where reference_number is not null;

select pg_temp.drop_column_checks('public.sample_requests', 'status');
alter table public.sample_requests add constraint sample_requests_status_check check (status in (
  'new', 'reviewing', 'approved', 'preparing', 'processing', 'dispatched', 'delivered',
  'completed', 'rejected', 'cancelled'
)) not valid;

-- -----------------------------------------------------------------------------
-- 7. Sales orders
-- -----------------------------------------------------------------------------
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  customer_id uuid references public.customers(id),
  quote_request_id uuid references public.quote_requests(id),
  sales_person_id uuid,
  product_name text not null,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sales_orders add column if not exists origin text;
alter table public.sales_orders add column if not exists grade text;
alter table public.sales_orders add column if not exists processing_method text;
alter table public.sales_orders add column if not exists unit_price numeric(14,2);
alter table public.sales_orders add column if not exists currency text default 'USD';
alter table public.sales_orders add column if not exists incoterm text;
alter table public.sales_orders add column if not exists payment_terms text;
alter table public.sales_orders add column if not exists destination_country text;
alter table public.sales_orders add column if not exists destination_port text;
alter table public.sales_orders add column if not exists requested_ship_date date;
alter table public.sales_orders add column if not exists customer_notes text;
alter table public.sales_orders add column if not exists sent_to_export_at timestamptz;
alter table public.sales_orders add column if not exists export_accepted_at timestamptz;
alter table public.sales_orders add column if not exists export_accepted_by uuid;
alter table public.sales_orders add column if not exists shipped_at timestamptz;
alter table public.sales_orders add column if not exists completed_at timestamptz;
alter table public.sales_orders add column if not exists cancelled_at timestamptz;
alter table public.sales_orders add column if not exists cancellation_reason text;
create index if not exists sales_orders_customer_idx on public.sales_orders (customer_id);
create index if not exists sales_orders_status_idx on public.sales_orders (status, created_at desc);
create index if not exists sales_orders_quote_idx on public.sales_orders (quote_request_id);
create index if not exists sales_orders_sales_person_idx on public.sales_orders (sales_person_id);

select pg_temp.drop_column_checks('public.sales_orders', 'status');
select pg_temp.drop_column_checks('public.sales_orders', 'unit_price');
alter table public.sales_orders add constraint sales_orders_status_check check (status in (
  'draft', 'confirmed', 'sent_to_export', 'export_accepted', 'processing', 'shipped', 'completed', 'cancelled'
)) not valid;
alter table public.sales_orders add constraint sales_orders_unit_price_check
  check (unit_price is null or unit_price >= 0) not valid;

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  description text not null,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  grade text,
  processing_method text,
  unit_price numeric(14,2),
  created_at timestamptz not null default now()
);
create index if not exists sales_order_items_order_idx on public.sales_order_items (sales_order_id);

-- -----------------------------------------------------------------------------
-- 8. Export batches, allocations, shipments
-- -----------------------------------------------------------------------------
create table if not exists public.export_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text unique,
  sales_order_id uuid not null references public.sales_orders(id),
  export_manager_id uuid,
  total_quantity_kg numeric(14,2) not null default 0 check (total_quantity_kg >= 0),
  status text not null default 'preparing',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.export_batches add column if not exists destination_country text;
alter table public.export_batches add column if not exists destination_port text;
alter table public.export_batches add column if not exists shipped_at timestamptz;
alter table public.export_batches add column if not exists completed_at timestamptz;
alter table public.export_batches add column if not exists cancelled_at timestamptz;
create index if not exists export_batches_order_idx on public.export_batches (sales_order_id);

select pg_temp.drop_column_checks('public.export_batches', 'status');
alter table public.export_batches add constraint export_batches_status_check check (status in (
  'preparing', 'ready', 'approved', 'shipped', 'completed', 'cancelled'
)) not valid;

create table if not exists public.export_batch_lots (
  id uuid primary key default gen_random_uuid(),
  export_batch_id uuid not null references public.export_batches(id) on delete cascade,
  lot_id uuid not null references public.coffee_lots(id),
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  created_at timestamptz not null default now()
);
alter table public.export_batch_lots add column if not exists warehouse_id uuid references public.warehouses(id);
alter table public.export_batch_lots add column if not exists released_at timestamptz;
-- One lot may now be allocated from several warehouses into the same batch.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.export_batch_lots'::regclass and contype = 'u'
      and conname <> 'export_batch_lots_batch_lot_warehouse_key'
  loop
    execute format('alter table public.export_batch_lots drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'export_batch_lots_batch_lot_warehouse_key') then
    alter table public.export_batch_lots
      add constraint export_batch_lots_batch_lot_warehouse_key unique (export_batch_id, lot_id, warehouse_id);
  end if;
end $$;
create index if not exists export_batch_lots_lot_idx on public.export_batch_lots (lot_id);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text unique,
  export_batch_id uuid not null references public.export_batches(id),
  export_manager_id uuid,
  status text not null default 'preparing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shipments add column if not exists destination_country text;
alter table public.shipments add column if not exists destination_port text;
alter table public.shipments add column if not exists port_of_loading text;
alter table public.shipments add column if not exists carrier text;
alter table public.shipments add column if not exists container_number text;
alter table public.shipments add column if not exists vessel_name text;
alter table public.shipments add column if not exists booking_reference text;
alter table public.shipments add column if not exists bill_of_lading_number text;
alter table public.shipments add column if not exists tracking_number text;
alter table public.shipments add column if not exists shipping_date date;
alter table public.shipments add column if not exists estimated_arrival date;
alter table public.shipments add column if not exists actual_arrival date;
alter table public.shipments add column if not exists notes text;
alter table public.shipments add column if not exists cancelled_at timestamptz;
create index if not exists shipments_batch_idx on public.shipments (export_batch_id);

select pg_temp.drop_column_checks('public.shipments', 'status');
alter table public.shipments add constraint shipments_status_check check (status in (
  'preparing', 'booked', 'in_transit', 'arrived', 'completed', 'cancelled'
)) not valid;
alter table public.shipments drop constraint if exists shipments_arrival_after_departure;
alter table public.shipments add constraint shipments_arrival_after_departure
  check (estimated_arrival is null or shipping_date is null or estimated_arrival >= shipping_date) not valid;

create table if not exists public.shipment_updates (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  status text,
  location text,
  description text not null,
  event_time timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists shipment_updates_shipment_idx on public.shipment_updates (shipment_id, event_time desc);

-- Legacy per-shipment document register (kept; superseded by public.documents)
create table if not exists public.shipment_documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  document_type text not null,
  document_name text not null,
  file_url text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 9. Documents (Supabase Storage bucket "documents", private)
-- -----------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  document_type text not null default 'other',
  related_type text not null default 'general',
  related_id uuid,
  file_path text unique,
  file_url text,
  file_name text,
  mime_type text,
  file_size bigint,
  is_public boolean not null default false,
  notes text,
  uploaded_by uuid,
  legacy_shipment_document_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_type_check check (document_type in (
    'quotation', 'invoice', 'commercial_invoice', 'packing_list', 'certificate',
    'certificate_of_origin', 'phytosanitary_certificate', 'quality_certificate',
    'bill_of_lading', 'product_specification', 'quality_document', 'export_permit',
    'contract', 'other'
  )),
  constraint documents_related_type_check check (related_type in (
    'general', 'quote_request', 'sample_request', 'customer', 'sales_order', 'export_batch',
    'shipment', 'coffee_lot', 'quality_inspection', 'warehouse', 'product', 'supplier',
    'farmer', 'collection'
  )),
  constraint documents_related_id_check check (related_type = 'general' or related_id is not null),
  constraint documents_file_size_check check (file_size is null or file_size between 0 and 26214400)
);
create index if not exists documents_related_idx on public.documents (related_type, related_id);
create index if not exists documents_type_idx on public.documents (document_type);

-- Bring the legacy shipment document register into the unified table.
insert into public.documents (title, document_type, related_type, related_id, file_url, uploaded_by,
                              legacy_shipment_document_id, created_at)
select sd.document_name,
       case
         when lower(regexp_replace(sd.document_type, '[^a-zA-Z]+', '_', 'g')) in (
           'quotation', 'invoice', 'commercial_invoice', 'packing_list', 'certificate',
           'certificate_of_origin', 'phytosanitary_certificate', 'quality_certificate',
           'bill_of_lading', 'product_specification', 'quality_document', 'export_permit', 'contract')
         then lower(regexp_replace(sd.document_type, '[^a-zA-Z]+', '_', 'g'))
         else 'other'
       end,
       'shipment', sd.shipment_id,
       nullif(btrim(sd.file_url), ''),
       sd.uploaded_by, sd.id, sd.created_at
from public.shipment_documents sd
where not exists (select 1 from public.documents d where d.legacy_shipment_document_id = sd.id);

-- -----------------------------------------------------------------------------
-- 10. Catalog: products, images, categories, regions
-- -----------------------------------------------------------------------------
do $$
declare v_had_active boolean := pg_temp.column_exists('products', 'is_active');
begin
  alter table public.products add column if not exists is_active boolean default true;
  -- Fresh installs used is_published; the deployed catalog uses is_active.
  if not v_had_active and pg_temp.column_exists('products', 'is_published') then
    execute 'update public.products set is_active = coalesce(is_published, false)';
  end if;
  -- flavor_notes is text[] in the deployed database; convert fresh installs.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'products'
               and column_name = 'flavor_notes' and data_type = 'text') then
    alter table public.products alter column flavor_notes type text[]
      using (case when flavor_notes is null or btrim(flavor_notes) = '' then null
                  else regexp_split_to_array(btrim(flavor_notes), '\s*,\s*') end);
  end if;
end $$;
alter table public.products add column if not exists is_featured boolean default false;
alter table public.products add column if not exists is_archived boolean not null default false;
alter table public.products add column if not exists sort_order integer not null default 0;
alter table public.products add column if not exists short_description text;
alter table public.products add column if not exists origin text;
alter table public.products add column if not exists grade text;
alter table public.products add column if not exists variety text;
alter table public.products add column if not exists processing text;
alter table public.products add column if not exists altitude text;
alter table public.products add column if not exists flavor_notes text[];
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists harvest_season text;
alter table public.products add column if not exists screen_size text;
alter table public.products add column if not exists moisture numeric(5,2);
alter table public.products add column if not exists cup_score numeric(5,2);
alter table public.products add column if not exists packaging text;
alter table public.products add column if not exists availability text default 'available';
alter table public.products add column if not exists certifications text[];
alter table public.products add column if not exists min_order_kg numeric(14,2);
select pg_temp.drop_column_checks('public.products', 'availability');
alter table public.products add constraint products_availability_check check (availability in (
  'available', 'limited', 'sold_out', 'available_on_request'
)) not valid;

alter table public.product_images add column if not exists display_order integer default 0;
alter table public.product_images add column if not exists storage_path text;
alter table public.categories add column if not exists is_active boolean default true;
alter table public.coffee_regions add column if not exists is_active boolean default true;
alter table public.coffee_regions add column if not exists altitude text;
do $$
begin
  if not pg_temp.column_exists('coffee_regions', 'flavor_notes') then
    alter table public.coffee_regions add column flavor_notes text[];
  end if;
  if not pg_temp.column_exists('coffee_regions', 'processing_methods') then
    alter table public.coffee_regions add column processing_methods text[];
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Notifications & activity log
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text not null,
  related_type text,
  related_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_id_read on public.notifications (user_id, is_read, created_at desc);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- 12. Relationships the API embeds (no-ops where they already exist)
-- -----------------------------------------------------------------------------
select pg_temp.ensure_fk('contact_messages', 'assigned_to', 'profiles');
select pg_temp.ensure_fk('customers', 'assigned_to', 'profiles');
select pg_temp.ensure_fk('quote_requests', 'assigned_to', 'profiles');
select pg_temp.ensure_fk('quote_requests', 'customer_id', 'customers');
select pg_temp.ensure_fk('quote_requests', 'product_id', 'products');
select pg_temp.ensure_fk('sample_requests', 'assigned_to', 'profiles');
select pg_temp.ensure_fk('sample_requests', 'customer_id', 'customers');
select pg_temp.ensure_fk('sample_requests', 'product_id', 'products');
select pg_temp.ensure_fk('warehouses', 'manager_id', 'profiles');
select pg_temp.ensure_fk('warehouses', 'location_id', 'locations');
select pg_temp.ensure_fk('farmers', 'supplier_id', 'suppliers');
select pg_temp.ensure_fk('farms', 'farmer_id', 'farmers', 'restrict');
select pg_temp.ensure_fk('farms', 'location_id', 'locations');
select pg_temp.ensure_fk('collection_records', 'farmer_id', 'farmers');
select pg_temp.ensure_fk('collection_records', 'farm_id', 'farms');
select pg_temp.ensure_fk('collection_records', 'location_id', 'locations');
select pg_temp.ensure_fk('collection_records', 'supplier_id', 'suppliers', 'restrict');
select pg_temp.ensure_fk('coffee_lots', 'collection_id', 'collection_records', 'restrict');
select pg_temp.ensure_fk('coffee_lots', 'supplier_id', 'suppliers', 'restrict');
select pg_temp.ensure_fk('inventory', 'lot_id', 'coffee_lots', 'restrict');
select pg_temp.ensure_fk('inventory', 'warehouse_id', 'warehouses', 'restrict');
select pg_temp.ensure_fk('export_batch_lots', 'warehouse_id', 'warehouses', 'restrict');
select pg_temp.ensure_fk('products', 'category_id', 'categories');
select pg_temp.ensure_fk('products', 'region_id', 'coffee_regions');

-- -----------------------------------------------------------------------------
-- 13. Code generators (one format, race-free) + updated_at triggers
-- -----------------------------------------------------------------------------
select pg_temp.attach_code('quote_requests',     'reference_number', 'quote_request',  'WAKA-RFQ',    true,  4);
select pg_temp.attach_code('sample_requests',    'reference_number', 'sample_request', 'WAKA-SAMPLE', true,  4);
select pg_temp.attach_code('customers',          'customer_code',    'customer',       'CUST',        false, 4);
select pg_temp.attach_code('sales_orders',       'order_number',     'sales_order',    'SO',          true,  4);
select pg_temp.attach_code('export_batches',     'batch_number',     'export_batch',   'EXP',         true,  4);
select pg_temp.attach_code('shipments',          'shipment_number',  'shipment',       'SHP',         true,  4);
select pg_temp.attach_code('suppliers',          'supplier_code',    'supplier',       'SUP',         false, 4);
select pg_temp.attach_code('farmers',            'farmer_code',      'farmer',         'FRM',         false, 4);
select pg_temp.attach_code('farms',              'farm_code',        'farm',           'FARM',        false, 4);
select pg_temp.attach_code('locations',          'location_code',    'location',       'LOC',         false, 4);
select pg_temp.attach_code('collection_records', 'collection_code',  'collection',     'COL',         true,  4);
select pg_temp.attach_code('coffee_lots',        'lot_code',         'coffee_lot',     'LOT',         true,  4);
select pg_temp.attach_code('warehouses',         'code',             'warehouse',      'WH',          false, 3);

do $$
declare t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.update_timestamp()', t);
  end loop;
end $$;

-- ============================== migrations/20260925000200_security_rls.sql
-- =============================================================================
-- Waka Coffee — 2026-09-25 (2/5): identity, role helpers, RLS, storage
-- =============================================================================
-- * One identity: profiles.id = auth.users.id = auth.uid()
-- * Department synonyms (procurement / quality / warehouse) are treated exactly
--   like field_officer / quality_officer / warehouse_officer, as the API does.
-- * Deactivated employees lose database access immediately (is_active).
-- * Every application table gets a known, reviewed set of policies: all
--   existing policies on those tables are dropped first, because unknown
--   permissive policies in the deployed database would OR with ours.
-- * Workflow tables whose invariants live in SECURITY DEFINER functions
--   (inventory, stock ledger, batch allocations, notifications, audit log)
--   are read-only for API roles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Role helpers
-- -----------------------------------------------------------------------------
create or replace function public.canonical_role(p_role text)
returns text language sql immutable as $$
  select case p_role
    when 'procurement' then 'field_officer'
    when 'quality' then 'quality_officer'
    when 'warehouse' then 'warehouse_officer'
    else p_role
  end;
$$;

create or replace function public.is_role(allowed text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and (p.role = any (allowed) or public.canonical_role(p.role) = any (allowed))
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_role(array['super_admin', 'admin']);
$$;

-- Kept for compatibility with older policies / scripts.
create or replace function public.has_role(allowed text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_role(allowed);
$$;

create or replace function public.is_employee()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_role(array[
    'super_admin', 'admin', 'sales', 'export_manager',
    'field_officer', 'quality_officer', 'warehouse_officer'
  ]);
$$;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select public.canonical_role(p.role) from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

grant execute on function public.canonical_role(text) to anon, authenticated;
grant execute on function public.is_role(text[]) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_role(text[]) to anon, authenticated;
grant execute on function public.is_employee() to anon, authenticated;
grant execute on function public.current_app_role() to authenticated;

-- Raise helpers with SQLSTATEs the API maps to HTTP statuses:
--   P0400 validation (400) · P0403 forbidden (403) · P0404 not found (404) · P0409 conflict/invalid transition (409)
create or replace function public.app_error(p_code text, p_message text)
returns void language plpgsql as $$
begin
  raise exception using errcode = p_code, message = p_message;
end $$;

-- Internal flag set by trusted workflow functions so guard triggers can tell
-- system-driven changes (e.g. shipment departure -> order shipped) from direct
-- API writes. Only reachable from SQL; PostgREST does not expose set_config.
create or replace function public.in_workflow()
returns boolean language sql stable as $$
  select coalesce(current_setting('waka.workflow', true), '') = 'on';
$$;

create or replace function public.begin_workflow()
returns void language sql volatile as $$
  select set_config('waka.workflow', 'on', true);
$$;
revoke all on function public.begin_workflow() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Profiles: signup provisioning and privilege-escalation guard
-- -----------------------------------------------------------------------------
-- SECURITY FIX: an earlier version copied raw_user_meta_data->>'role' into the
-- profile. Public sign-up is enabled on the project, so anyone could register
-- as admin. New accounts are ALWAYS role 'user'; employees are created by the
-- API / admin_create_employee_user, which sets the role explicitly.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'user'), '@', 1)),
    'user',
    true
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fresh installs still have profiles.user_id: keep it equal to id.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id') then
    execute $f$
      create or replace function public.profiles_sync_user_id()
      returns trigger language plpgsql as $b$
      begin
        new.user_id := new.id;
        return new;
      end $b$;
    $f$;
    execute 'drop trigger if exists profiles_sync_user_id on public.profiles';
    execute 'create trigger profiles_sync_user_id before insert or update on public.profiles for each row execute function public.profiles_sync_user_id()';
  end if;
end $$;

create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_caller text;
begin
  -- Service role, SQL editor and signup trigger run without a user.
  if v_uid is null then
    return new;
  end if;

  select role into v_caller from public.profiles where id = v_uid and is_active;

  if tg_op = 'INSERT' then
    if new.role <> 'user' and not public.is_admin() then
      perform public.app_error('P0403', 'Only administrators can create employee profiles.');
    end if;
    if new.role in ('super_admin') and v_caller is distinct from 'super_admin' then
      perform public.app_error('P0403', 'Only a super admin can create another super admin.');
    end if;
    return new;
  end if;

  if new.id is distinct from old.id then
    perform public.app_error('P0400', 'A profile id cannot be changed.');
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email then
    if not public.is_admin() then
      perform public.app_error('P0403', 'Only administrators can change a role, account status or email.');
    end if;
    if (new.role = 'super_admin' or old.role = 'super_admin') and v_caller is distinct from 'super_admin' then
      perform public.app_error('P0403', 'Only a super admin can grant, change or revoke super admin access.');
    end if;
    if old.id = v_uid and (not new.is_active or public.canonical_role(new.role) not in ('admin', 'super_admin')) then
      perform public.app_error('P0403', 'You cannot deactivate or demote your own account.');
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
drop trigger if exists guard_profile_changes on public.profiles;
create trigger guard_profile_changes
  before insert or update on public.profiles
  for each row execute function public.guard_profile_changes();

-- -----------------------------------------------------------------------------
-- 3. Reset policies on every application table
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  r record;
  app_tables text[] := array[
    'profiles', 'categories', 'coffee_regions', 'products', 'product_images', 'services', 'gallery',
    'certificates', 'blog_categories', 'blog_posts', 'testimonials', 'faqs', 'export_countries',
    'contact_messages', 'newsletter_subscribers', 'quote_requests', 'quote_items', 'sample_requests',
    'customers', 'sales_orders', 'sales_order_items', 'export_batches', 'export_batch_lots',
    'shipments', 'shipment_updates', 'shipment_documents', 'documents', 'suppliers', 'farmers',
    'farms', 'locations', 'collection_records', 'coffee_lots', 'quality_inspections', 'warehouses',
    'inventory', 'inventory_transactions', 'notifications', 'activity_logs', 'document_counters'
  ];
begin
  foreach t in array app_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- Internal-only tables: no API access at all.
revoke all on public.document_counters from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Public content (read by the website, managed by staff)
-- -----------------------------------------------------------------------------
-- Products: public sees active, non-archived products; catalog staff manage.
create policy products_public_read on public.products for select to anon, authenticated
  using (is_active and not is_archived);
create policy products_staff_read on public.products for select to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy products_staff_insert on public.products for insert to authenticated
  with check (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy products_staff_update on public.products for update to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy products_admin_delete on public.products for delete to authenticated
  using (public.is_admin());

create policy product_images_public_read on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active and not p.is_archived));
create policy product_images_staff_all on public.product_images for all to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));

do $$
declare t text;
begin
  -- Tables with an is_active flag: public reads active rows, admins manage.
  foreach t in array array['categories', 'coffee_regions', 'services', 'gallery', 'certificates',
                           'testimonials', 'faqs', 'export_countries'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'is_active') then
      execute format('create policy %I on public.%I for select to anon, authenticated using (is_active)', t || '_public_read', t);
    else
      execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
    end if;
    execute format('create policy %I on public.%I for select to authenticated using (public.is_employee())', t || '_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- Catalog staff also maintain categories and origins.
create policy categories_catalog_write on public.categories for insert to authenticated
  with check (public.is_role(array['sales', 'export_manager']));
create policy categories_catalog_update on public.categories for update to authenticated
  using (public.is_role(array['sales', 'export_manager'])) with check (public.is_role(array['sales', 'export_manager']));
create policy coffee_regions_catalog_write on public.coffee_regions for insert to authenticated
  with check (public.is_role(array['sales', 'export_manager']));
create policy coffee_regions_catalog_update on public.coffee_regions for update to authenticated
  using (public.is_role(array['sales', 'export_manager'])) with check (public.is_role(array['sales', 'export_manager']));

create policy blog_categories_public_read on public.blog_categories for select to anon, authenticated using (true);
create policy blog_categories_admin_all on public.blog_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy blog_posts_public_read on public.blog_posts for select to anon, authenticated using (is_published);
create policy blog_posts_staff_read on public.blog_posts for select to authenticated using (public.is_employee());
create policy blog_posts_admin_all on public.blog_posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 5. Profiles
-- -----------------------------------------------------------------------------
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_employee_directory on public.profiles for select to authenticated
  using (public.is_employee() and role <> 'user');
create policy profiles_admin_read on public.profiles for select to authenticated
  using (public.is_admin());
-- Field-level rules (role / is_active / email) are enforced by guard_profile_changes.
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy profiles_admin_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
revoke delete on public.profiles from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Leads: contact messages, newsletter, quote & sample requests
--    Public submissions go through SECURITY DEFINER RPCs only (reference
--    numbers, customer linking, throttling), so anon has no direct INSERT.
-- -----------------------------------------------------------------------------
create policy contact_messages_sales_read on public.contact_messages for select to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']));
create policy contact_messages_sales_update on public.contact_messages for update to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));
create policy contact_messages_admin_delete on public.contact_messages for delete to authenticated
  using (public.is_admin());

create policy newsletter_sales_read on public.newsletter_subscribers for select to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']));
create policy newsletter_admin_update on public.newsletter_subscribers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy newsletter_admin_delete on public.newsletter_subscribers for delete to authenticated
  using (public.is_admin());

create policy quote_requests_sales_read on public.quote_requests for select to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']));
create policy quote_requests_sales_insert on public.quote_requests for insert to authenticated
  with check (public.is_role(array['sales', 'admin', 'super_admin']));
create policy quote_requests_sales_update on public.quote_requests for update to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));
create policy quote_requests_admin_delete on public.quote_requests for delete to authenticated
  using (public.is_admin());

create policy quote_items_sales_all on public.quote_items for all to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));

create policy sample_requests_sales_read on public.sample_requests for select to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']));
create policy sample_requests_sales_insert on public.sample_requests for insert to authenticated
  with check (public.is_role(array['sales', 'admin', 'super_admin']));
create policy sample_requests_sales_update on public.sample_requests for update to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));
create policy sample_requests_admin_delete on public.sample_requests for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 7. Customers & sales
-- -----------------------------------------------------------------------------
create policy customers_read on public.customers for select to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy customers_sales_insert on public.customers for insert to authenticated
  with check (public.is_role(array['sales', 'admin', 'super_admin']));
create policy customers_sales_update on public.customers for update to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));
create policy customers_admin_delete on public.customers for delete to authenticated
  using (public.is_admin());

-- Status transitions and edit windows are enforced by sales_orders_guard.
create policy sales_orders_read on public.sales_orders for select to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy sales_orders_sales_insert on public.sales_orders for insert to authenticated
  with check (public.is_role(array['sales', 'admin', 'super_admin']));
create policy sales_orders_update on public.sales_orders for update to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy sales_orders_admin_delete on public.sales_orders for delete to authenticated
  using (public.is_admin() and status in ('draft', 'cancelled'));

create policy sales_order_items_read on public.sales_order_items for select to authenticated
  using (public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy sales_order_items_sales_write on public.sales_order_items for all to authenticated
  using (public.is_role(array['sales', 'admin', 'super_admin'])
         and exists (select 1 from public.sales_orders o where o.id = sales_order_id and o.status in ('draft', 'confirmed')))
  with check (public.is_role(array['sales', 'admin', 'super_admin'])
         and exists (select 1 from public.sales_orders o where o.id = sales_order_id and o.status in ('draft', 'confirmed')));

-- -----------------------------------------------------------------------------
-- 8. Export: batches (created via create_export_batch), shipments, updates
-- -----------------------------------------------------------------------------
create policy export_batches_read on public.export_batches for select to authenticated
  using (public.is_role(array['export_manager', 'sales', 'warehouse_officer', 'quality_officer', 'admin', 'super_admin']));
create policy export_batches_export_update on public.export_batches for update to authenticated
  using (public.is_role(array['export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));
revoke insert, delete on public.export_batches from anon, authenticated;

create policy export_batch_lots_read on public.export_batch_lots for select to authenticated
  using (public.is_role(array['export_manager', 'sales', 'warehouse_officer', 'quality_officer', 'admin', 'super_admin']));
revoke insert, update, delete on public.export_batch_lots from anon, authenticated;

create policy shipments_read on public.shipments for select to authenticated
  using (public.is_role(array['export_manager', 'sales', 'admin', 'super_admin']));
create policy shipments_export_insert on public.shipments for insert to authenticated
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));
create policy shipments_export_update on public.shipments for update to authenticated
  using (public.is_role(array['export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));
create policy shipments_admin_delete on public.shipments for delete to authenticated
  using (public.is_admin() and status in ('preparing', 'cancelled'));

create policy shipment_updates_read on public.shipment_updates for select to authenticated
  using (public.is_role(array['export_manager', 'sales', 'admin', 'super_admin']));
create policy shipment_updates_export_insert on public.shipment_updates for insert to authenticated
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']) and created_by = auth.uid());
create policy shipment_updates_admin_delete on public.shipment_updates for delete to authenticated
  using (public.is_admin());

create policy shipment_documents_export_all on public.shipment_documents for all to authenticated
  using (public.is_role(array['export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));

-- -----------------------------------------------------------------------------
-- 9. Documents: visibility follows the department that owns the related record
-- -----------------------------------------------------------------------------
create or replace function public.can_access_document(p_related_type text, p_uploaded_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_role(array['admin', 'super_admin', 'export_manager'])
      or p_uploaded_by = auth.uid()
      or (p_related_type in ('quote_request', 'sample_request', 'customer', 'sales_order', 'product', 'general')
          and public.is_role(array['sales']))
      or (p_related_type in ('coffee_lot', 'quality_inspection', 'general')
          and public.is_role(array['quality_officer']))
      or (p_related_type in ('warehouse', 'coffee_lot', 'general')
          and public.is_role(array['warehouse_officer']))
      or (p_related_type in ('coffee_lot', 'collection', 'supplier', 'farmer', 'general')
          and public.is_role(array['field_officer']));
$$;
grant execute on function public.can_access_document(text, uuid) to authenticated;

create policy documents_public_read on public.documents for select to anon, authenticated
  using (is_public);
create policy documents_staff_read on public.documents for select to authenticated
  using (public.can_access_document(related_type, uploaded_by));
create policy documents_staff_insert on public.documents for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_access_document(related_type, uploaded_by)
              and (related_type <> 'general' or public.is_role(array['admin', 'super_admin', 'export_manager'])));
create policy documents_staff_update on public.documents for update to authenticated
  using (public.is_role(array['admin', 'super_admin', 'export_manager']) or uploaded_by = auth.uid())
  with check (public.is_role(array['admin', 'super_admin', 'export_manager']) or uploaded_by = auth.uid());
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_admin() or uploaded_by = auth.uid());

-- -----------------------------------------------------------------------------
-- 10. Sourcing / field operations
-- -----------------------------------------------------------------------------
create policy suppliers_read on public.suppliers for select to authenticated using (public.is_employee());
create policy suppliers_field_insert on public.suppliers for insert to authenticated
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy suppliers_field_update on public.suppliers for update to authenticated
  using (public.is_role(array['field_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy suppliers_admin_delete on public.suppliers for delete to authenticated using (public.is_admin());

create policy locations_read on public.locations for select to authenticated using (public.is_employee());
create policy locations_field_insert on public.locations for insert to authenticated
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy locations_field_update on public.locations for update to authenticated
  using (public.is_role(array['field_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy locations_admin_delete on public.locations for delete to authenticated using (public.is_admin());

create policy farmers_read on public.farmers for select to authenticated
  using (public.is_role(array['field_officer', 'quality_officer', 'warehouse_officer', 'export_manager', 'admin', 'super_admin']));
create policy farmers_field_insert on public.farmers for insert to authenticated
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy farmers_field_update on public.farmers for update to authenticated
  using (public.is_role(array['field_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy farmers_admin_delete on public.farmers for delete to authenticated using (public.is_admin());

create policy farms_read on public.farms for select to authenticated
  using (public.is_role(array['field_officer', 'quality_officer', 'warehouse_officer', 'export_manager', 'admin', 'super_admin']));
create policy farms_field_insert on public.farms for insert to authenticated
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy farms_field_update on public.farms for update to authenticated
  using (public.is_role(array['field_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy farms_admin_delete on public.farms for delete to authenticated using (public.is_admin());

create policy collections_read on public.collection_records for select to authenticated
  using (public.is_role(array['field_officer', 'quality_officer', 'warehouse_officer', 'export_manager', 'admin', 'super_admin']));
create policy collections_field_insert on public.collection_records for insert to authenticated
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy collections_field_update on public.collection_records for update to authenticated
  using (public.is_role(array['field_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy collections_admin_delete on public.collection_records for delete to authenticated using (public.is_admin());

-- Lot status is changed only by workflow functions (see coffee_lots_guard).
create policy lots_read on public.coffee_lots for select to authenticated
  using (public.is_role(array['field_officer', 'quality_officer', 'warehouse_officer', 'export_manager', 'sales', 'admin', 'super_admin']));
create policy lots_field_insert on public.coffee_lots for insert to authenticated
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy lots_field_update on public.coffee_lots for update to authenticated
  using (public.is_role(array['field_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['field_officer', 'admin', 'super_admin']));
create policy lots_admin_delete on public.coffee_lots for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 11. Quality
-- -----------------------------------------------------------------------------
create policy quality_read on public.quality_inspections for select to authenticated
  using (public.is_role(array['quality_officer', 'field_officer', 'warehouse_officer', 'export_manager', 'sales', 'admin', 'super_admin']));
create policy quality_officer_insert on public.quality_inspections for insert to authenticated
  with check (public.is_role(array['quality_officer', 'admin', 'super_admin']));
create policy quality_officer_update on public.quality_inspections for update to authenticated
  using (public.is_role(array['quality_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['quality_officer', 'admin', 'super_admin']));
create policy quality_admin_delete on public.quality_inspections for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 12. Warehouses & inventory (stock only moves through inventory_* functions)
-- -----------------------------------------------------------------------------
create policy warehouses_read on public.warehouses for select to authenticated using (public.is_employee());
create policy warehouses_officer_insert on public.warehouses for insert to authenticated
  with check (public.is_role(array['warehouse_officer', 'admin', 'super_admin']));
create policy warehouses_officer_update on public.warehouses for update to authenticated
  using (public.is_role(array['warehouse_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['warehouse_officer', 'admin', 'super_admin']));
create policy warehouses_admin_delete on public.warehouses for delete to authenticated using (public.is_admin());

create policy inventory_read on public.inventory for select to authenticated
  using (public.is_role(array['warehouse_officer', 'quality_officer', 'export_manager', 'sales', 'admin', 'super_admin']));
-- Descriptive columns may be edited directly; quantities/status may not.
create policy inventory_officer_update on public.inventory for update to authenticated
  using (public.is_role(array['warehouse_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['warehouse_officer', 'admin', 'super_admin']));
revoke insert, update, delete on public.inventory from anon, authenticated;
grant update (bag_count, weight_per_bag_kg, unit_cost_per_kg, shipping_cost, par_level_bags,
              roast_loss_percent, coffee_type, inventory_type, notes)
  on public.inventory to authenticated;

create policy inventory_tx_read on public.inventory_transactions for select to authenticated
  using (public.is_role(array['warehouse_officer', 'quality_officer', 'export_manager', 'sales', 'admin', 'super_admin']));
revoke insert, update, delete on public.inventory_transactions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 13. Notifications & audit log
-- -----------------------------------------------------------------------------
create policy notifications_own_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());
revoke insert on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (is_read) on public.notifications to authenticated;

create policy activity_logs_admin_read on public.activity_logs for select to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.activity_logs from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 14. Anonymous access: only the public website tables
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'contact_messages', 'newsletter_subscribers', 'quote_requests', 'quote_items', 'sample_requests',
    'customers', 'sales_orders', 'sales_order_items', 'export_batches', 'export_batch_lots',
    'shipments', 'shipment_updates', 'shipment_documents', 'suppliers', 'farmers', 'farms',
    'locations', 'collection_records', 'coffee_lots', 'quality_inspections', 'warehouses',
    'inventory', 'inventory_transactions', 'notifications', 'activity_logs', 'profiles'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 15. Storage
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Private bucket: files are only reachable through short-lived signed URLs
-- issued by the API after the caller passes the documents RLS check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-excel', 'text/csv', 'text/plain'
])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ~ '(product-images|''documents'')' or coalesce(with_check, '') ~ '(product-images|''documents'')'
           or policyname in ('Public read product-images', 'Admin upload product-images',
                             'Admin update product-images', 'Admin delete product-images',
                             'staff_upload_product_images', 'staff_update_product_images',
                             'staff_delete_product_images'))
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy waka_product_images_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy waka_product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy waka_product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']))
  with check (bucket_id = 'product-images' and public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));
create policy waka_product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_role(array['sales', 'export_manager', 'admin', 'super_admin']));

-- Object visibility follows the documents row that points at it.
create policy waka_documents_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.file_path = name));
create policy waka_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_employee());
create policy waka_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (public.is_admin() or owner = auth.uid()));

-- -----------------------------------------------------------------------------
-- 16. Realtime for the notification bell
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ============================== migrations/20260925000300_workflows.sql
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

-- ============================== migrations/20260925000400_notifications_audit.sql
-- =============================================================================
-- Waka Coffee — 2026-09-25 (4/5): notifications and audit trail
-- =============================================================================
-- Notifications target a person (notifications.user_id = profiles.id =
-- auth.users.id) or the active members of a department. They are created by
-- database triggers, so every client path (API, SQL, RPC) produces them, and
-- the person who performed the action is never notified about it.
-- =============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('create_user_notification', 'notify_role', 'notify_roles', 'broadcast_notification')
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Delivery helpers (internal)
-- -----------------------------------------------------------------------------
create or replace function public.create_user_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_related_type text default null,
  p_related_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_user_id is null or p_user_id is not distinct from auth.uid() then
    return null;
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and is_active) then
    return null;
  end if;

  -- Collapse exact repeats (double clicks, retries) within two minutes.
  select id into v_id from public.notifications
   where user_id = p_user_id and type = p_type and message = p_message
     and related_id is not distinct from p_related_id
     and created_at > now() - interval '2 minutes'
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.notifications (user_id, type, title, message, related_type, related_id, is_read)
  values (p_user_id, p_type, p_title, p_message, p_related_type, p_related_id, false)
  returning id into v_id;
  return v_id;
end $$;

-- Notify every active member of the given (canonical) roles, except the actor.
-- When nobody holds the role, administrators are notified instead so work is
-- never silently dropped.
create or replace function public.notify_roles(
  p_roles text[],
  p_type text,
  p_title text,
  p_message text,
  p_related_type text default null,
  p_related_id uuid default null,
  p_fallback_to_admins boolean default true
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select id from public.profiles
     where is_active and public.canonical_role(role) = any (p_roles)
  loop
    if public.create_user_notification(r.id, p_type, p_title, p_message, p_related_type, p_related_id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count = 0 and p_fallback_to_admins
     and not exists (select 1 from public.profiles where is_active and public.canonical_role(role) = any (p_roles)) then
    for r in select id from public.profiles where is_active and role in ('admin', 'super_admin') loop
      if public.create_user_notification(r.id, p_type, p_title, p_message, p_related_type, p_related_id) is not null then
        v_count := v_count + 1;
      end if;
    end loop;
  end if;
  return v_count;
end $$;

revoke all on function public.create_user_notification(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.notify_roles(text[], text, text, text, text, uuid, boolean) from public, anon, authenticated;

-- Legacy name kept for compatibility; now administrators only and it targets
-- notifications.user_id correctly.
create or replace function public.notify_role(
  target_roles text[],
  notification_type text,
  notification_title text,
  notification_message text,
  related_type_value text default null,
  related_id_value uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    perform public.app_error('P0403', 'Only administrators can send role notifications.');
  end if;
  return public.notify_roles(target_roles, notification_type, notification_title, notification_message,
                             related_type_value, related_id_value, false);
end $$;
revoke all on function public.notify_role(text[], text, text, text, text, uuid) from public, anon;
grant execute on function public.notify_role(text[], text, text, text, text, uuid) to authenticated;

-- System announcements from an administrator to roles and/or specific people.
create or replace function public.broadcast_notification(
  p_title text,
  p_message text,
  p_roles text[] default null,
  p_user_ids uuid[] default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_id uuid;
begin
  if not public.is_admin() then
    perform public.app_error('P0403', 'Only administrators can send system notifications.');
  end if;
  if coalesce(length(btrim(p_title)), 0) = 0 or coalesce(length(btrim(p_message)), 0) = 0 then
    perform public.app_error('P0400', 'Title and message are required.');
  end if;
  if coalesce(array_length(p_roles, 1), 0) = 0 and coalesce(array_length(p_user_ids, 1), 0) = 0 then
    perform public.app_error('P0400', 'Choose at least one role or person.');
  end if;

  if coalesce(array_length(p_roles, 1), 0) > 0 then
    v_count := public.notify_roles(p_roles, 'system', btrim(p_title), btrim(p_message), null, null, false);
  end if;
  if coalesce(array_length(p_user_ids, 1), 0) > 0 then
    for v_id in select distinct unnest(p_user_ids) loop
      if public.create_user_notification(v_id, 'system', btrim(p_title), btrim(p_message)) is not null then
        v_count := v_count + 1;
      end if;
    end loop;
  end if;
  return v_count;
end $$;
revoke all on function public.broadcast_notification(text, text, text[], uuid[]) from public, anon;
grant execute on function public.broadcast_notification(text, text, text[], uuid[]) to authenticated;

-- Helpers to describe records in messages
create or replace function public.fmt_qty(p_value numeric)
returns text language sql immutable as $$
  select rtrim(to_char(p_value, 'FM999999999990.99'), '.');
$$;

create or replace function public.pretty_status(p_status text)
returns text language sql immutable as $$
  select initcap(replace(coalesce(p_status, ''), '_', ' '));
$$;

-- -----------------------------------------------------------------------------
-- 2. Lead notifications (quote / sample / contact)
-- -----------------------------------------------------------------------------
create or replace function public.notify_quote_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_roles(array['sales'], 'quote_request', 'New quote request',
      format('%s from %s%s%s', new.reference_number, coalesce(new.company, new.full_name),
             coalesce(' (' || new.country || ')', ''),
             coalesce(' — ' || public.fmt_qty(new.quantity_kg) || ' kg ' || new.product_name, '')),
      'quote_request', new.id);
  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    perform public.create_user_notification(new.assigned_to, 'quote_assigned', 'Quote request assigned to you',
      format('%s from %s is now yours.', new.reference_number, coalesce(new.company, new.full_name)),
      'quote_request', new.id);
  end if;
  return null;
end $$;
drop trigger if exists ee_notify_quote_request on public.quote_requests;
create trigger ee_notify_quote_request after insert or update of assigned_to on public.quote_requests
  for each row execute function public.notify_quote_request();

create or replace function public.notify_sample_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_roles(array['sales'], 'sample_request', 'New sample request',
      format('%s from %s%s%s', new.reference_number, coalesce(new.company, new.full_name),
             coalesce(' (' || new.country || ')', ''), coalesce(' — ' || new.product_name, '')),
      'sample_request', new.id);
  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    perform public.create_user_notification(new.assigned_to, 'sample_assigned', 'Sample request assigned to you',
      format('%s from %s is now yours.', new.reference_number, coalesce(new.company, new.full_name)),
      'sample_request', new.id);
  elsif new.status is distinct from old.status and new.assigned_to is not null then
    perform public.create_user_notification(new.assigned_to, 'sample_update', 'Sample request updated',
      format('%s is now %s.', new.reference_number, public.pretty_status(new.status)),
      'sample_request', new.id);
  end if;
  return null;
end $$;
drop trigger if exists ee_notify_sample_request on public.sample_requests;
create trigger ee_notify_sample_request after insert or update of assigned_to, status on public.sample_requests
  for each row execute function public.notify_sample_request();

create or replace function public.notify_contact_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_roles(array['sales'], 'contact_message', 'New contact message',
    format('%s <%s>: %s', coalesce(new.name, 'Website visitor'), new.email, left(coalesce(new.subject, new.message), 120)),
    'contact_message', new.id);
  return null;
end $$;
drop trigger if exists ee_notify_contact_message on public.contact_messages;
create trigger ee_notify_contact_message after insert on public.contact_messages
  for each row execute function public.notify_contact_message();

-- -----------------------------------------------------------------------------
-- 3. Sales -> Export workflow notifications
-- -----------------------------------------------------------------------------
create or replace function public.notify_sales_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_customer text;
  v_desc text;
begin
  select company_name into v_customer from public.customers where id = new.customer_id;
  v_desc := format('Order %s%s — %s kg %s', new.order_number, coalesce(' for ' || v_customer, ''),
                   public.fmt_qty(new.quantity_kg), new.product_name);

  if tg_op = 'INSERT' then
    perform public.create_user_notification(new.sales_person_id, 'sales_order_created', 'Sales order created',
      v_desc || ' was created and assigned to you.', 'sales_order', new.id);
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  case new.status
    when 'sent_to_export' then
      perform public.notify_roles(array['export_manager'], 'order_sent_to_export', 'New Export Request',
        v_desc || ' has been sent to Export for processing.', 'sales_order', new.id);
    when 'export_accepted' then
      if old.status = 'sent_to_export' then
        perform public.create_user_notification(new.sales_person_id, 'order_export_accepted', 'Export Request Accepted',
          v_desc || ' has been accepted by the Export Manager.', 'sales_order', new.id);
      end if;
    when 'confirmed' then
      if old.status = 'sent_to_export' then
        perform public.create_user_notification(new.sales_person_id, 'order_returned', 'Order returned by Export',
          v_desc || ' was returned to Sales for changes.', 'sales_order', new.id);
      end if;
    when 'processing' then
      perform public.create_user_notification(new.sales_person_id, 'export_batch_created', 'Export batch created',
        v_desc || ' is being prepared for export.', 'sales_order', new.id);
    when 'shipped' then
      perform public.create_user_notification(new.sales_person_id, 'order_shipped', 'Order shipped',
        v_desc || ' has left for its destination.', 'sales_order', new.id);
    when 'completed' then
      perform public.create_user_notification(new.sales_person_id, 'order_completed', 'Order completed',
        v_desc || ' has been delivered and completed.', 'sales_order', new.id);
    when 'cancelled' then
      perform public.create_user_notification(new.sales_person_id, 'order_cancelled', 'Order cancelled',
        v_desc || ' was cancelled' || coalesce(': ' || new.cancellation_reason, '.'), 'sales_order', new.id);
      if old.status in ('sent_to_export', 'export_accepted', 'processing') then
        perform public.notify_roles(array['export_manager'], 'order_cancelled', 'Order cancelled',
          v_desc || ' was cancelled' || coalesce(': ' || new.cancellation_reason, '.'), 'sales_order', new.id);
      end if;
    else
      null;
  end case;
  return null;
end $$;
drop trigger if exists ee_notify_sales_order on public.sales_orders;
create trigger ee_notify_sales_order after insert or update of status on public.sales_orders
  for each row execute function public.notify_sales_order();

create or replace function public.notify_shipment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order public.sales_orders;
  v_batch text;
  v_msg text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  select o.* into v_order
    from public.export_batches b join public.sales_orders o on o.id = b.sales_order_id
   where b.id = new.export_batch_id;
  select batch_number into v_batch from public.export_batches where id = new.export_batch_id;

  v_msg := format('Shipment %s (batch %s, order %s) is now %s%s.', new.shipment_number, v_batch, v_order.order_number,
                  public.pretty_status(new.status),
                  coalesce(' — ' || nullif(concat_ws(', ', new.vessel_name, new.destination_port), ''), ''));

  perform public.create_user_notification(v_order.sales_person_id, 'shipment_update',
    case when tg_op = 'INSERT' then 'Shipment created' else 'Shipment update' end, v_msg, 'shipment', new.id);
  perform public.notify_roles(array['export_manager'], 'shipment_update',
    case when tg_op = 'INSERT' then 'Shipment created' else 'Shipment update' end, v_msg, 'shipment', new.id, false);
  return null;
end $$;
drop trigger if exists ee_notify_shipment on public.shipments;
create trigger ee_notify_shipment after insert or update of status on public.shipments
  for each row execute function public.notify_shipment();

-- Manual tracking events (status events are covered by notify_shipment)
create or replace function public.notify_shipment_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sales uuid;
  v_number text;
begin
  if public.in_workflow() then
    return null;
  end if;
  select o.sales_person_id, s.shipment_number into v_sales, v_number
    from public.shipments s
    join public.export_batches b on b.id = s.export_batch_id
    join public.sales_orders o on o.id = b.sales_order_id
   where s.id = new.shipment_id;
  perform public.create_user_notification(v_sales, 'shipment_update', 'Shipment tracking update',
    format('%s: %s%s', v_number, new.description, coalesce(' (' || new.location || ')', '')), 'shipment', new.shipment_id);
  return null;
end $$;
drop trigger if exists ee_notify_shipment_update on public.shipment_updates;
create trigger ee_notify_shipment_update after insert on public.shipment_updates
  for each row execute function public.notify_shipment_update();

-- -----------------------------------------------------------------------------
-- 4. Documents and quality results
-- -----------------------------------------------------------------------------
create or replace function public.notify_document()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_msg text := format('%s (%s) was added', new.title, public.pretty_status(new.document_type));
  v_sales uuid;
  v_label text;
begin
  case new.related_type
    when 'shipment' then
      select o.sales_person_id, s.shipment_number into v_sales, v_label
        from public.shipments s join public.export_batches b on b.id = s.export_batch_id
        join public.sales_orders o on o.id = b.sales_order_id where s.id = new.related_id;
    when 'export_batch' then
      select o.sales_person_id, b.batch_number into v_sales, v_label
        from public.export_batches b join public.sales_orders o on o.id = b.sales_order_id where b.id = new.related_id;
    when 'sales_order' then
      select sales_person_id, order_number into v_sales, v_label from public.sales_orders where id = new.related_id;
    when 'quote_request' then
      select assigned_to, reference_number into v_sales, v_label from public.quote_requests where id = new.related_id;
    when 'sample_request' then
      select assigned_to, reference_number into v_sales, v_label from public.sample_requests where id = new.related_id;
    when 'coffee_lot' then
      select null, lot_code into v_sales, v_label from public.coffee_lots where id = new.related_id;
    else
      v_label := null;
  end case;
  v_msg := v_msg || coalesce(' to ' || v_label, '') || '.';

  if new.related_type in ('shipment', 'export_batch', 'sales_order') then
    perform public.create_user_notification(v_sales, 'document_added', 'Document added', v_msg, 'document', new.id);
    perform public.notify_roles(array['export_manager'], 'document_added', 'Document added', v_msg, 'document', new.id, false);
  elsif new.related_type in ('quote_request', 'sample_request', 'customer') then
    if v_sales is not null then
      perform public.create_user_notification(v_sales, 'document_added', 'Document added', v_msg, 'document', new.id);
    end if;
  elsif new.related_type in ('coffee_lot', 'quality_inspection') then
    perform public.notify_roles(array['quality_officer'], 'document_added', 'Document added', v_msg, 'document', new.id, false);
  end if;
  return null;
end $$;
drop trigger if exists ee_notify_document on public.documents;
create trigger ee_notify_document after insert on public.documents
  for each row execute function public.notify_document();

create or replace function public.notify_quality_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_lot record;
  v_msg text;
begin
  if new.approval_status not in ('approved', 'rejected')
     or (tg_op = 'UPDATE' and new.approval_status is not distinct from old.approval_status) then
    return null;
  end if;
  select l.lot_code, c.field_officer_id into v_lot
    from public.coffee_lots l join public.collection_records c on c.id = l.collection_id
   where l.id = new.lot_id;

  v_msg := format('Lot %s was %s by Quality%s%s.', v_lot.lot_code, new.approval_status,
                  coalesce(' — grade ' || new.final_grade, ''),
                  coalesce(', cup score ' || new.cup_score::text, ''));

  perform public.create_user_notification(v_lot.field_officer_id, 'quality_result', 'Quality result', v_msg, 'quality', new.id);
  if new.approval_status = 'approved' then
    perform public.notify_roles(array['warehouse_officer'], 'quality_result', 'Lot ready for warehouse',
      v_msg || ' It can now be received into a warehouse.', 'lot', new.lot_id, false);
  end if;
  return null;
end $$;
drop trigger if exists ee_notify_quality_result on public.quality_inspections;
create trigger ee_notify_quality_result after insert or update of approval_status on public.quality_inspections
  for each row execute function public.notify_quality_result();

-- -----------------------------------------------------------------------------
-- 5. Audit trail (activity_logs)
-- -----------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_action text;
  v_label text;
begin
  v_label := coalesce(
    coalesce(v_new, v_old) ->> 'order_number', coalesce(v_new, v_old) ->> 'reference_number',
    coalesce(v_new, v_old) ->> 'batch_number', coalesce(v_new, v_old) ->> 'shipment_number',
    coalesce(v_new, v_old) ->> 'lot_code', coalesce(v_new, v_old) ->> 'collection_code',
    coalesce(v_new, v_old) ->> 'customer_code', coalesce(v_new, v_old) ->> 'supplier_code',
    coalesce(v_new, v_old) ->> 'farmer_code', coalesce(v_new, v_old) ->> 'farm_code',
    coalesce(v_new, v_old) ->> 'code', coalesce(v_new, v_old) ->> 'title',
    coalesce(v_new, v_old) ->> 'name', coalesce(v_new, v_old) ->> 'company_name',
    coalesce(v_new, v_old) ->> 'email');

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'created_at')
         and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object(
          'from', case when length((v_old -> v_key)::text) > 300 then to_jsonb('(long text)'::text) else v_old -> v_key end,
          'to', case when length((v_new -> v_key)::text) > 300 then to_jsonb('(long text)'::text) else v_new -> v_key end));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
    v_action := case when v_changes ? 'status' then 'status_changed'
                     when v_changes ? 'role' then 'role_changed'
                     when v_changes ? 'is_active' then 'status_changed'
                     else 'updated' end;
  else
    v_action := case tg_op when 'INSERT' then 'created' else 'deleted' end;
  end if;

  insert into public.activity_logs (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), v_action, tg_table_name, coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
          jsonb_strip_nulls(jsonb_build_object(
            'label', v_label,
            'changes', case when tg_op = 'UPDATE' then v_changes end,
            'status', coalesce(v_new, v_old) ->> 'status')));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'customers', 'quote_requests', 'sample_requests', 'sales_orders', 'export_batches', 'shipments',
    'documents', 'coffee_lots', 'collection_records', 'quality_inspections', 'warehouses', 'farmers',
    'farms', 'suppliers', 'locations', 'products', 'contact_messages'
  ] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- Profiles: only account-level changes are audited (not avatar/name edits).
drop trigger if exists zz_audit on public.profiles;
create trigger zz_audit after insert or update of role, is_active on public.profiles
  for each row execute function public.audit_row_change();

-- ============================== migrations/20260925000500_reporting_traceability.sql
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
