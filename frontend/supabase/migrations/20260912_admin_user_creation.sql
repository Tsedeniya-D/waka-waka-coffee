-- Migration: Admin Employee User Creation RPC & Profile Trigger Hardening
-- ---------------------------------------------------------------------------

-- 1. Update handle_new_user trigger function to respect raw_user_meta_data role if present
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    user_id,
    email,
    full_name,
    role,
    is_active,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'user'),
    true,
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = case 
      when nullif(new.raw_user_meta_data->>'role', '') is not null then new.raw_user_meta_data->>'role'
      else public.profiles.role
    end,
    updated_at = now();
  return new;
end;
$$;

-- 2. Create RPC function for secure admin employee user creation
create or replace function public.admin_create_employee_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_caller_role text;
  v_new_user_id uuid;
  v_allowed_roles text[] := array[
    'super_admin',
    'admin',
    'sales',
    'export_manager',
    'procurement',
    'field_officer',
    'quality',
    'quality_officer',
    'warehouse',
    'warehouse_officer'
  ];
  v_encrypted_pw text;
begin
  -- Check requester authorization: caller must be authenticated and have an admin role
  select role into v_caller_role
  from public.profiles
  where user_id = auth.uid() or id = auth.uid()
  limit 1;

  if v_caller_role is null or v_caller_role not in ('super_admin', 'admin') then
    raise exception 'Unauthorized: Only administrators can create users.';
  end if;

  -- Validate parameters
  if p_email is null or trim(p_email) = '' then
    raise exception 'Email is required.';
  end if;

  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'Full name is required.';
  end if;

  if p_role is null or not (p_role = any(v_allowed_roles)) then
    raise exception 'Invalid role selected.';
  end if;

  -- Check duplicate email in auth.users
  if exists (select 1 from auth.users where lower(email) = lower(trim(p_email))) then
    raise exception 'A user with this email already exists.';
  end if;

  -- Generate new UUID & hash password
  v_new_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  -- Insert into auth.users
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_new_user_id,
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name), 'role', p_role),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- Insert into auth.identities for password auth compatibility
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_new_user_id,
    format('{"sub":"%s","email":"%s"}', v_new_user_id, lower(trim(p_email)))::jsonb,
    'email',
    lower(trim(p_email)),
    now(),
    now(),
    now()
  );

  -- Upsert into public.profiles
  insert into public.profiles (
    id,
    user_id,
    email,
    full_name,
    role,
    is_active,
    created_at,
    updated_at
  ) values (
    v_new_user_id,
    v_new_user_id,
    lower(trim(p_email)),
    trim(p_full_name),
    p_role,
    true,
    now(),
    now()
  )
  on conflict (id) do update set
    user_id = excluded.user_id,
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = true,
    updated_at = now();

  return jsonb_build_object(
    'success', true,
    'user_id', v_new_user_id,
    'email', lower(trim(p_email)),
    'role', p_role
  );
end;
$$;

-- Grant execution permission to authenticated users
grant execute on function public.admin_create_employee_user(text, text, text, text) to authenticated;

-- 3. Fix existing sales account if its profile role is 'user'
update public.profiles
set role = 'sales', is_active = true, updated_at = now()
where (email = 'sales@gmail.com' or id = '1417cf25-2e10-4eec-9fe3-f763ca925cb6' or user_id = '1417cf25-2e10-4eec-9fe3-f763ca925cb6')
  and role = 'user';
