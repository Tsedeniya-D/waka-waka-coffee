-- Phase 1b: UNIQUE constraint, public INSERT-only policies, storage, trigger fix
-- Additive / idempotent where possible. Run after 20260309_phase1_auth_rls.sql.

-- Ensure role helpers exist (safe if Phase 1a already created them)
create or replace function public.has_role(allowed text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = any (allowed)
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Phase 1 active admin role is `admin`.
  -- `super_admin` accepted if set manually later; not provisioned by Phase 1 UI.
  select public.has_role(array['admin', 'super_admin']);
$$;

-- ---------------------------------------------------------------------------
-- profiles.user_id UNIQUE (prefer named constraint)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_user_id_key'
  ) then
    begin
      alter table public.profiles
        add constraint profiles_user_id_key unique using index profiles_user_id_uidx;
    exception
      when undefined_object then
        alter table public.profiles
          add constraint profiles_user_id_key unique (user_id);
      when duplicate_table then
        null;
      when others then
        -- If duplicates exist, unique cannot be applied until cleaned manually
        raise notice 'Could not add profiles_user_id_key: %', sqlerrm;
    end;
  end if;
end $$;

alter table public.profiles add column if not exists email text;

-- ---------------------------------------------------------------------------
-- Auto-provision: always role = 'user' (never trust client metadata for role)
-- ---------------------------------------------------------------------------
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
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
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

-- Role escalation guard: allow system/service (auth.uid null); block non-admins
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if auth.uid() is null then
      return new;
    end if;
    if not public.is_admin() then
      raise exception 'Only admin may change profile.role';
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
-- Ensure public can INSERT leads only (no SELECT for anon)
-- ---------------------------------------------------------------------------
alter table if exists contact_messages enable row level security;
alter table if exists quote_requests enable row level security;
alter table if exists sample_requests enable row level security;

drop policy if exists "public_insert_contact" on contact_messages;
create policy "public_insert_contact"
  on contact_messages
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public_insert_quote" on quote_requests;
create policy "public_insert_quote"
  on quote_requests
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public_insert_sample" on sample_requests;
create policy "public_insert_sample"
  on sample_requests
  for insert
  to anon, authenticated
  with check (true);

-- Admin manage policies (idempotent recreate)
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

-- ---------------------------------------------------------------------------
-- Storage: product-images bucket + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read product-images" on storage.objects;
create policy "Public read product-images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'product-images');

drop policy if exists "Admin upload product-images" on storage.objects;
create policy "Admin upload product-images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admin update product-images" on storage.objects;
create policy "Admin update product-images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admin delete product-images" on storage.objects;
create policy "Admin delete product-images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
