-- Phase 1: Auth/profile hardening, form-schema alignment, RLS fixes
-- Non-destructive / additive only. Safe to re-run where IF NOT EXISTS is used.

-- ---------------------------------------------------------------------------
-- Profiles: email + unique auth link + auto-provision
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists email text;

create unique index if not exists profiles_user_id_uidx on profiles (user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'user'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent clients from escalating their own role
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if not exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('super_admin', 'admin')
    ) then
      raise exception 'Only admin roles may change profile.role';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on profiles;
create trigger profiles_prevent_role_escalation
  before update on profiles
  for each row execute function public.prevent_profile_role_escalation();

-- ---------------------------------------------------------------------------
-- Role helpers for RLS (security definer avoids recursive policy issues)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(allowed text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = any (allowed)
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(array['super_admin', 'admin']);
$$;

-- ---------------------------------------------------------------------------
-- Quote / sample request columns used by public forms
-- ---------------------------------------------------------------------------
alter table quote_requests add column if not exists product_name text;
alter table quote_requests add column if not exists region_name text;
alter table quote_requests add column if not exists grade text;
alter table quote_requests add column if not exists processing text;
alter table quote_requests add column if not exists destination_port text;
alter table quote_requests add column if not exists certifications text[];
alter table quote_requests add column if not exists target_shipment text;

-- ---------------------------------------------------------------------------
-- RLS: products public read + staff manage; quotes/samples staff manage
-- ---------------------------------------------------------------------------
alter table if exists products enable row level security;
alter table if exists product_images enable row level security;
alter table if exists quote_requests enable row level security;
alter table if exists sample_requests enable row level security;
alter table if exists contact_messages enable row level security;
alter table if exists profiles enable row level security;

-- Drop legacy narrow admin-only product policy if present, then recreate broader set
drop policy if exists "admin_manage_products" on products;
drop policy if exists "public_read_published_products" on products;
drop policy if exists "staff_manage_products" on products;

create policy "public_read_published_products"
  on products for select
  using (is_published = true and coalesce(is_archived, false) = false);

create policy "staff_manage_products"
  on products for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "public_read_product_images" on product_images;
drop policy if exists "staff_manage_product_images" on product_images;

create policy "public_read_product_images"
  on product_images for select
  using (
    exists (
      select 1 from products p
      where p.id = product_images.product_id
        and p.is_published = true
        and coalesce(p.is_archived, false) = false
    )
  );

create policy "staff_manage_product_images"
  on product_images for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin_manage_contact" on contact_messages;
drop policy if exists "staff_manage_contact" on contact_messages;

create policy "staff_manage_contact"
  on contact_messages for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "staff_manage_quotes" on quote_requests;
create policy "staff_manage_quotes"
  on quote_requests for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "staff_manage_samples" on sample_requests;
create policy "staff_manage_samples"
  on sample_requests for all
  using (public.is_admin())
  with check (public.is_admin());

-- Profiles: owner read; admins read all; no public inserts (trigger uses security definer)
drop policy if exists "profiles_owner_read" on profiles;
drop policy if exists "profiles_admin_read" on profiles;
drop policy if exists "profiles_owner_update" on profiles;

create policy "profiles_owner_read"
  on profiles for select
  using (user_id = auth.uid() or public.is_admin());

create policy "profiles_owner_update"
  on profiles for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket note (run in dashboard if missing):
--   insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);
-- Add storage policies so admins can upload and public can read.
-- ---------------------------------------------------------------------------
