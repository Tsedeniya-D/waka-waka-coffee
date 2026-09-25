-- Minimal Supabase / Postgres schema for Waka Coffee frontend
-- Run this in your Supabase SQL editor or via psql against your Supabase database

create extension if not exists "pgcrypto";

-- Categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  image_url text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Coffee regions
create table if not exists coffee_regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  location text,
  flavor_profile text,
  image_url text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  region_id uuid references coffee_regions(id) on delete set null,
  flavor_notes text,
  is_featured boolean default false,
  is_published boolean default false,
  is_archived boolean default false,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  is_primary boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Services
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  icon text,
  image_url text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Gallery
create table if not exists gallery (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  category text,
  image_url text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Certificates
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text,
  document_number text,
  issue_date date,
  expiry_date date,
  file_url text,
  image_url text,
  is_public boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Blog
create table if not exists blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  excerpt text,
  content text,
  category_id uuid references blog_categories(id) on delete set null,
  is_published boolean default false,
  published_at timestamptz,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Testimonials, FAQs, Export countries
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text,
  author_name text,
  author_title text,
  company text,
  country text,
  avatar_url text,
  rating int,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists export_countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  flag_url text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Contact & newsletter
create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  country text,
  message text,
  status text default 'new',
  assigned_to uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  company text,
  country text,
  status text default 'active',
  created_at timestamptz default now()
);

-- Quote & sample requests
create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference_number text,
  full_name text,
  company text,
  email text,
  phone text,
  country text,
  destination_port text,
  product_id uuid references products(id),
  product_name text,
  region_id uuid references coffee_regions(id),
  region_name text,
  grade text,
  processing text,
  quantity_kg numeric,
  packaging text,
  certifications text[],
  target_shipment text,
  message text,
  status text default 'new',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sample_requests (
  id uuid primary key default gen_random_uuid(),
  reference_number text,
  product_id uuid references products(id),
  product_name text,
  quantity text,
  name text,
  company text,
  email text,
  phone text,
  country text,
  shipping_address text,
  notes text,
  status text default 'new',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Simple function to update updated_at timestamps
create or replace function update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Attach trigger to main tables
drop trigger if exists products_update_timestamp on products;
create trigger products_update_timestamp before update on products for each row execute function update_timestamp();
drop trigger if exists categories_update_timestamp on categories;
create trigger categories_update_timestamp before update on categories for each row execute function update_timestamp();
drop trigger if exists coffee_regions_update_timestamp on coffee_regions;
create trigger coffee_regions_update_timestamp before update on coffee_regions for each row execute function update_timestamp();

-- Add other triggers as needed

-- Profiles (application identity linked to Supabase Auth)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'user', -- super_admin | admin | field_officer | ... | user
  avatar_url text,
  company text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists profiles_user_id_uidx on profiles (user_id);

drop trigger if exists profiles_update_timestamp on profiles;
create trigger profiles_update_timestamp before update on profiles for each row execute function update_timestamp();

-- Auto-create profile on auth signup (role always defaults to 'user')
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
  select public.has_role(array['super_admin', 'admin']);
$$;

-- RLS
ALTER TABLE IF EXISTS contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sample_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_contact" ON contact_messages;
CREATE POLICY "public_insert_contact" ON contact_messages FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "public_insert_quote" ON quote_requests;
CREATE POLICY "public_insert_quote" ON quote_requests FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "public_insert_sample" ON sample_requests;
CREATE POLICY "public_insert_sample" ON sample_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public_read_published_products" ON products;
CREATE POLICY "public_read_published_products" ON products FOR SELECT
  USING (is_published = true AND coalesce(is_archived, false) = false);

DROP POLICY IF EXISTS "staff_manage_products" ON products;
CREATE POLICY "staff_manage_products" ON products FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "public_read_product_images" ON product_images;
CREATE POLICY "public_read_product_images" ON product_images FOR SELECT
  USING (
    exists (
      select 1 from products p
      where p.id = product_images.product_id
        and p.is_published = true
        and coalesce(p.is_archived, false) = false
    )
  );

DROP POLICY IF EXISTS "staff_manage_product_images" ON product_images;
CREATE POLICY "staff_manage_product_images" ON product_images FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "staff_manage_contact" ON contact_messages;
CREATE POLICY "staff_manage_contact" ON contact_messages FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "staff_manage_quotes" ON quote_requests;
CREATE POLICY "staff_manage_quotes" ON quote_requests FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "staff_manage_samples" ON sample_requests;
CREATE POLICY "staff_manage_samples" ON sample_requests FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_owner_read" ON profiles;
CREATE POLICY "profiles_owner_read" ON profiles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_owner_update" ON profiles;
CREATE POLICY "profiles_owner_update" ON profiles FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- End of init.sql
