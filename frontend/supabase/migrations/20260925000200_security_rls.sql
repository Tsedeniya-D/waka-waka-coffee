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
