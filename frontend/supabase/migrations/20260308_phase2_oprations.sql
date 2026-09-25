
-- Waka Coffee Phase 2: operational workflow
-- Supply -> Quality -> Inventory -> Sales -> Export -> Shipment
-- Run this after the Phase 1 migrations.

-- ---------------------------------------------------------------------------
-- Suppliers / field sourcing
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text unique not null,
  name text not null,
  supplier_type text not null default 'cooperative',
  contact_person text,
  phone text,
  email text,
  region text,
  zone text,
  woreda text,
  kebele text,
  address text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_records (
  id uuid primary key default gen_random_uuid(),
  collection_code text unique not null,
  collection_date date not null default current_date,
  field_officer_id uuid references auth.users(id),
  supplier_id uuid not null references public.suppliers(id),
  origin text not null,
  region text,
  zone text,
  woreda text,
  kebele text,
  coffee_type text default 'Arabica',
  variety text,
  processing_method text,
  grade text,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  purchase_price numeric(14,2),
  notes text,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coffee_lots (
  id uuid primary key default gen_random_uuid(),
  lot_code text unique not null,
  collection_id uuid not null references public.collection_records(id),
  supplier_id uuid not null references public.suppliers(id),
  origin text not null,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  processing_method text,
  grade text,
  status text not null default 'pending_quality',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Quality
-- ---------------------------------------------------------------------------
create table if not exists public.quality_inspections (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null unique references public.coffee_lots(id) on delete cascade,
  inspector_id uuid references auth.users(id),
  inspection_date date not null default current_date,
  moisture numeric(5,2),
  defect_count integer,
  screen_size text,
  cup_score numeric(5,2),
  aroma text,
  flavor text,
  acidity text,
  body text,
  final_grade text,
  result text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Warehouses / inventory movements
-- ---------------------------------------------------------------------------
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  location text,
  capacity_kg numeric(14,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id),
  warehouse_id uuid not null references public.warehouses(id),
  transaction_type text not null,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  reference_type text,
  reference_id uuid,
  notes text,
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customers / Sales
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique not null,
  company_name text not null,
  contact_person text,
  email text,
  phone text,
  country text,
  destination_port text,
  address text,
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_id uuid references public.customers(id),
  quote_request_id uuid references public.quote_requests(id),
  sales_person_id uuid references auth.users(id),
  product_name text not null,
  origin text,
  grade text,
  processing_method text,
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  unit_price numeric(14,2),
  currency text default 'USD',
  destination_country text,
  destination_port text,
  requested_ship_date date,
  customer_notes text,
  status text not null default 'draft',
  sent_to_export_at timestamptz,
  export_accepted_at timestamptz,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- ---------------------------------------------------------------------------
-- Export / logistics
-- ---------------------------------------------------------------------------
create table if not exists public.export_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text unique not null,
  sales_order_id uuid not null references public.sales_orders(id),
  export_manager_id uuid references auth.users(id),
  total_quantity_kg numeric(14,2) not null default 0 check (total_quantity_kg >= 0),
  status text not null default 'preparing',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.export_batch_lots (
  id uuid primary key default gen_random_uuid(),
  export_batch_id uuid not null references public.export_batches(id) on delete cascade,
  lot_id uuid not null references public.coffee_lots(id),
  quantity_kg numeric(14,2) not null check (quantity_kg > 0),
  created_at timestamptz not null default now(),
  unique(export_batch_id, lot_id)
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text unique not null,
  export_batch_id uuid not null references public.export_batches(id),
  export_manager_id uuid references auth.users(id),
  destination_country text,
  destination_port text,
  container_number text,
  vessel_name text,
  booking_reference text,
  shipping_date date,
  estimated_arrival date,
  actual_arrival date,
  status text not null default 'preparing',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipment_documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  document_type text not null,
  document_name text not null,
  file_url text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications: cross-department communication
-- ---------------------------------------------------------------------------
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

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_role(allowed text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = any(allowed)
  );
$$;

create or replace function public.notify_role(
  target_roles text[],
  notification_type text,
  notification_title text,
  notification_message text,
  related_type_value text default null,
  related_id_value uuid default null
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_role(array['super_admin','admin','sales','export_manager']) then
    raise exception 'Not allowed to create role notifications';
  end if;

  insert into public.notifications (
    id, type, title, message, related_type, related_id
  )
  select p.id, notification_type, notification_title,
       notification_message, related_type_value, related_id_value
from public.profiles p
where p.role = any(target_roles);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.collection_records enable row level security;
alter table public.coffee_lots enable row level security;
alter table public.quality_inspections enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.customers enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.export_batches enable row level security;
alter table public.export_batch_lots enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_documents enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

-- Read policies by department. Admins can see everything.
create policy "ops_admin_all_suppliers" on public.suppliers for all
  using (public.is_admin()) with check (public.is_admin());
create policy "field_read_suppliers" on public.suppliers for select
  using (public.is_role(array['field_officer','quality_officer','warehouse_officer','sales','export_manager']));

create policy "field_insert_collections" on public.collection_records for insert
  with check (public.is_role(array['field_officer','admin','super_admin']));
create policy "field_read_collections" on public.collection_records for select
  using (public.is_admin() or field_officer_id = auth.uid() or public.is_role(array['quality_officer','warehouse_officer','sales','export_manager']));
create policy "field_update_collections" on public.collection_records for update
  using (public.is_admin() or field_officer_id = auth.uid())
  with check (public.is_admin() or field_officer_id = auth.uid());

create policy "ops_admin_all_lots" on public.coffee_lots for all
  using (public.is_admin()) with check (public.is_admin());
create policy "ops_read_lots" on public.coffee_lots for select
  using (public.is_role(array['field_officer','quality_officer','warehouse_officer','sales','export_manager']));
create policy "field_create_lots" on public.coffee_lots for insert
  with check (public.is_role(array['field_officer','admin','super_admin']));

create policy "quality_manage_inspections" on public.quality_inspections for all
  using (public.is_role(array['quality_officer','admin','super_admin']))
  with check (public.is_role(array['quality_officer','admin','super_admin']));
create policy "ops_read_quality" on public.quality_inspections for select
  using (public.is_role(array['field_officer','quality_officer','warehouse_officer','sales','export_manager']));

create policy "warehouse_admin_all" on public.warehouses for all
  using (public.is_role(array['warehouse_officer','admin','super_admin']))
  with check (public.is_role(array['warehouse_officer','admin','super_admin']));
create policy "ops_read_warehouses" on public.warehouses for select
  using (public.is_role(array['field_officer','quality_officer','warehouse_officer','sales','export_manager']));

create policy "warehouse_manage_inventory" on public.inventory_transactions for all
  using (public.is_role(array['warehouse_officer','admin','super_admin']))
  with check (public.is_role(array['warehouse_officer','admin','super_admin']));
create policy "ops_read_inventory" on public.inventory_transactions for select
  using (public.is_role(array['quality_officer','warehouse_officer','sales','export_manager','admin','super_admin']));

create policy "sales_admin_all_customers" on public.customers for all
  using (public.is_role(array['sales','admin','super_admin']))
  with check (public.is_role(array['sales','admin','super_admin']));
create policy "sales_read_customers" on public.customers for select
  using (public.is_role(array['export_manager']));

create policy "sales_manage_orders" on public.sales_orders for all
  using (public.is_role(array['sales','admin','super_admin']))
  with check (public.is_role(array['sales','admin','super_admin']));
create policy "export_read_orders" on public.sales_orders for select
  using (public.is_role(array['export_manager','admin','super_admin']));
create policy "export_update_orders" on public.sales_orders for update
  using (public.is_role(array['export_manager','admin','super_admin']))
  with check (public.is_role(array['export_manager','admin','super_admin']));

create policy "sales_manage_order_items" on public.sales_order_items for all
  using (public.is_role(array['sales','admin','super_admin']))
  with check (public.is_role(array['sales','admin','super_admin']));
create policy "export_read_order_items" on public.sales_order_items for select
  using (public.is_role(array['export_manager','admin','super_admin']));

create policy "export_manage_batches" on public.export_batches for all
  using (public.is_role(array['export_manager','admin','super_admin']))
  with check (public.is_role(array['export_manager','admin','super_admin']));
create policy "export_manage_batch_lots" on public.export_batch_lots for all
  using (public.is_role(array['export_manager','admin','super_admin']))
  with check (public.is_role(array['export_manager','admin','super_admin']));

create policy "export_manage_shipments" on public.shipments for all
  using (public.is_role(array['export_manager','admin','super_admin']))
  with check (public.is_role(array['export_manager','admin','super_admin']));
create policy "export_manage_documents" on public.shipment_documents for all
  using (public.is_role(array['export_manager','admin','super_admin']))
  with check (public.is_role(array['export_manager','admin','super_admin']));

create policy "users_read_own_notifications" on public.notifications for select
  using (user_id = auth.uid() or public.is_admin());
create policy "users_update_own_notifications" on public.notifications for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "staff_read_activity" on public.activity_logs for select
  using (public.is_admin());
create policy "staff_insert_activity" on public.activity_logs for insert
  with check (auth.uid() = user_id);

-- Timestamp triggers
do $$
declare
  t text;
begin
  foreach t in array array[
    'suppliers','collection_records','coffee_lots','quality_inspections',
    'warehouses','customers','sales_orders','export_batches','shipments'
  ] loop
    execute format('drop trigger if exists %I_update_timestamp on public.%I', t, t);
    execute format('create trigger %I_update_timestamp before update on public.%I for each row execute function public.update_timestamp()', t, t);
  end loop;
end $$;

-- Grants for authenticated app clients.
grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.collection_records to authenticated;
grant select, insert, update, delete on public.coffee_lots to authenticated;
grant select, insert, update, delete on public.quality_inspections to authenticated;
grant select, insert, update, delete on public.warehouses to authenticated;
grant select, insert, update, delete on public.inventory_transactions to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.sales_orders to authenticated;
grant select, insert, update, delete on public.sales_order_items to authenticated;
grant select, insert, update, delete on public.export_batches to authenticated;
grant select, insert, update, delete on public.export_batch_lots to authenticated;
grant select, insert, update, delete on public.shipments to authenticated;
grant select, insert, update, delete on public.shipment_documents to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert on public.activity_logs to authenticated;
grant execute on function public.notify_role(text[], text, text, text, text, uuid) to authenticated;


-- Admin can manage staff profile metadata/roles for accounts that already exist
drop policy if exists "profiles_admin_manage" on public.profiles;
create policy "profiles_admin_manage"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.profiles to authenticated;
