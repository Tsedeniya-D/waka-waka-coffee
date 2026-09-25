-- Migration: Role-Based Access Control (RBAC) & RLS Hardening
-- ---------------------------------------------------------------------------

-- 1. Helper function: Check if authenticated user has one of the allowed roles
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

-- 2. Sales Orders Policy Hardening
drop policy if exists "sales_manage_orders" on public.sales_orders;
drop policy if exists "export_read_orders" on public.sales_orders;
drop policy if exists "export_update_orders" on public.sales_orders;

create policy "sales_manage_orders" on public.sales_orders for all
  using (public.is_role(array['sales', 'admin', 'super_admin']))
  with check (public.is_role(array['sales', 'admin', 'super_admin']));

create policy "export_read_orders" on public.sales_orders for select
  using (public.is_role(array['export_manager', 'admin', 'super_admin']));

create policy "export_update_orders" on public.sales_orders for update
  using (public.is_role(array['export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));

-- 3. Export Batches Policy Hardening
drop policy if exists "export_manage_batches" on public.export_batches;
drop policy if exists "export_manage_batch_lots" on public.export_batch_lots;
drop policy if exists "sales_read_batches" on public.export_batches;

create policy "export_manage_batches" on public.export_batches for all
  using (public.is_role(array['export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));

create policy "sales_read_batches" on public.export_batches for select
  using (public.is_role(array['sales']));

create policy "export_manage_batch_lots" on public.export_batch_lots for all
  using (public.is_role(array['export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));

-- 4. Shipments & Documents Policy Hardening
drop policy if exists "export_manage_shipments" on public.shipments;
drop policy if exists "export_manage_documents" on public.shipment_documents;

create policy "export_manage_shipments" on public.shipments for all
  using (public.is_role(array['export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));

create policy "export_manage_documents" on public.shipment_documents for all
  using (public.is_role(array['export_manager', 'admin', 'super_admin']))
  with check (public.is_role(array['export_manager', 'admin', 'super_admin']));

-- 5. Procurement Policy Hardening
drop policy if exists "procurement_manage_suppliers" on public.suppliers;
drop policy if exists "procurement_manage_collections" on public.collection_records;

create policy "procurement_manage_suppliers" on public.suppliers for all
  using (public.is_role(array['procurement', 'field_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['procurement', 'field_officer', 'admin', 'super_admin']));

create policy "procurement_manage_collections" on public.collection_records for all
  using (public.is_role(array['procurement', 'field_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['procurement', 'field_officer', 'admin', 'super_admin']));

-- 6. Quality Policy Hardening
drop policy if exists "quality_manage_inspections" on public.quality_inspections;

create policy "quality_manage_inspections" on public.quality_inspections for all
  using (public.is_role(array['quality', 'quality_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['quality', 'quality_officer', 'admin', 'super_admin']));

-- 7. Warehouse & Inventory Policy Hardening
drop policy if exists "warehouse_admin_all" on public.warehouses;
drop policy if exists "warehouse_manage_inventory" on public.inventory_transactions;

create policy "warehouse_admin_all" on public.warehouses for all
  using (public.is_role(array['warehouse', 'warehouse_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['warehouse', 'warehouse_officer', 'admin', 'super_admin']));

create policy "warehouse_manage_inventory" on public.inventory_transactions for all
  using (public.is_role(array['warehouse', 'warehouse_officer', 'admin', 'super_admin']))
  with check (public.is_role(array['warehouse', 'warehouse_officer', 'admin', 'super_admin']));

-- 8. Profiles Policy Hardening (User management reserved for super_admin & admin)
drop policy if exists "profiles_admin_manage" on public.profiles;

create policy "profiles_admin_manage" on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());
