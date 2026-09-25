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
