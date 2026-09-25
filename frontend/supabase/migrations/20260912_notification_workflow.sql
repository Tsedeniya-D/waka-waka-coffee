-- Migration: Automatic Notification Workflow between Sales and Export Managers
-- ---------------------------------------------------------------------------

-- 1. Ensure required columns exist on sales_orders
alter table public.sales_orders add column if not exists sent_to_export_at timestamptz;
alter table public.sales_orders add column if not exists export_accepted_at timestamptz;
alter table public.sales_orders add column if not exists sales_person_id uuid references auth.users(id);

-- 2. Ensure indices for performance and uniqueness queries
create index if not exists idx_notifications_user_id_read on public.notifications(user_id, is_read);
create index if not exists idx_notifications_lookup on public.notifications(user_id, type, related_type, related_id);

-- 3. Idempotent helper function to create a notification for a user without duplicates
create or replace function public.create_user_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_related_type text default null,
  p_related_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  -- Prevent duplicate notifications for same user, type, related_type, and related_id
  select id into v_notification_id
  from public.notifications
  where user_id = p_user_id
    and type = p_type
    and related_type is not distinct from p_related_type
    and related_id is not distinct from p_related_id
  limit 1;

  if v_notification_id is not null then
    return v_notification_id;
  end if;

  insert into public.notifications (
    user_id, type, title, message, related_type, related_id, is_read
  )
  values (
    p_user_id, p_type, p_title, p_message, p_related_type, p_related_id, false
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

grant execute on function public.create_user_notification(uuid, text, text, text, text, uuid) to authenticated;

-- 4. RPC: Sales employee sends order to Export
create or replace function public.send_order_to_export(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_export_manager_id uuid;
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_order
  from public.sales_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Sales order not found';
  end if;

  -- Update order status, timestamp, and record sales_person_id if missing
  update public.sales_orders
  set status = 'sent_to_export',
      sent_to_export_at = coalesce(sent_to_export_at, now()),
      sales_person_id = coalesce(sales_person_id, v_caller_id),
      updated_at = now()
  where id = p_order_id;

  -- Find active Export Manager employee
  select coalesce(user_id, id) into v_export_manager_id
  from public.profiles
  where role = 'export_manager'
    and coalesce(is_active, true) = true
  order by created_at asc
  limit 1;

  -- Fallback to active admin/super_admin if no export_manager role exists
  if v_export_manager_id is null then
    select coalesce(user_id, id) into v_export_manager_id
    from public.profiles
    where role in ('admin', 'super_admin')
      and coalesce(is_active, true) = true
    order by created_at asc
    limit 1;
  end if;

  -- Create notification for the Export Manager
  if v_export_manager_id is not null then
    perform public.create_user_notification(
      v_export_manager_id,
      'order_sent_to_export',
      'New Export Request',
      'Order ' || v_order.order_number || ' has been sent to Export for processing.',
      'sales_order',
      p_order_id
    );
  end if;

  select * into v_order from public.sales_orders where id = p_order_id;
  return to_jsonb(v_order);
end;
$$;

grant execute on function public.send_order_to_export(uuid) to authenticated;

-- 5. RPC: Export Manager accepts order
create or replace function public.accept_export_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_sales_person_id uuid;
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_order
  from public.sales_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Sales order not found';
  end if;

  -- Update order status and set export_accepted_at timestamp
  update public.sales_orders
  set status = 'export_accepted',
      export_accepted_at = coalesce(export_accepted_at, now()),
      updated_at = now()
  where id = p_order_id;

  -- Identify original Sales employee
  v_sales_person_id := v_order.sales_person_id;
  if v_sales_person_id is null then
    v_sales_person_id := v_caller_id;
  end if;

  -- Create notification for the original Sales employee
  if v_sales_person_id is not null then
    perform public.create_user_notification(
      v_sales_person_id,
      'order_export_accepted',
      'Export Request Accepted',
      'Order ' || v_order.order_number || ' has been accepted by Export Manager.',
      'sales_order',
      p_order_id
    );
  end if;

  select * into v_order from public.sales_orders where id = p_order_id;
  return to_jsonb(v_order);
end;
$$;

grant execute on function public.accept_export_order(uuid) to authenticated;
