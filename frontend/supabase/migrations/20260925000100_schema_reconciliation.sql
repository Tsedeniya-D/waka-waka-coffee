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
