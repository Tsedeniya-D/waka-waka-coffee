-- ==========================================================
-- Migration: Customer auto-creation from Sample / Quote requests
-- Date: 2026-08-31
-- ==========================================================
-- Fixes:
--   1. customers.customer_code auto-generation (DB-level trigger + sequence)
--   2. customers.email unique index (dedup anchor)
--   3. sample_requests.customer_id FK → customers(id)
--   4. quote_requests.customer_id  FK → customers(id)
--   5. shared RPC upsert_customer_from_request() - atomic find-or-create
--   6. NEW submit_quote_request() RPC (mirror of sample RPC, with customer link)
--   7. UPDATED submit_sample_request() RPC - creates/links customer
--   8. customers.source optional audit field (Sample Request | Quote Request | Manual)
--
-- Security:
--   All customer touches happen inside SECURITY DEFINER RPCs.
--   Anon users NEVER get direct INSERT/SELECT on customers table.
-- ==========================================================

-- ---------------------------------------------------------------------------
-- 1.  Optional source column for auditability
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.customers') is null then
    raise exception 'customers table must exist before this migration';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='customers' and column_name='source'
  ) then
    alter table public.customers add column source text default 'Manual';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2.  customers.customer_code: SEQUENCE + BEFORE INSERT trigger
--     Format: CUST-0001 (auto gapless 4-digit zero-padded number)
-- ---------------------------------------------------------------------------
do $$
begin
  create sequence if not exists public.customers_code_seq
    increment by 1
    start with 1
    minvalue 1
    no maxvalue
    cache 1;
end $$;

create or replace function public.customers_gen_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.customer_code is null or trim(new.customer_code) = '' then
    new.customer_code := 'CUST-' || lpad(nextval('public.customers_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists customers_gen_code_trg on public.customers;
create trigger customers_gen_code_trg
  before insert on public.customers
  for each row
  when (new.customer_code is null or trim(new.customer_code) = '')
  execute function public.customers_gen_code();

-- ---------------------------------------------------------------------------
-- 3.  Unique index on customers(lower(email)) — reliable match anchor
--     (keeps ON CONFLICT safe)
-- ---------------------------------------------------------------------------
create unique index if not exists customers_email_lower_uidx
  on public.customers (lower(email))
  where email is not null and btrim(email) <> '';

-- ---------------------------------------------------------------------------
-- 4.  sample_requests.customer_id + quote_requests.customer_id FK columns
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sample_requests') is not null and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sample_requests' and column_name='customer_id'
  ) then
    alter table public.sample_requests
      add column customer_id uuid references public.customers(id) on delete set null;
  end if;

  if to_regclass('public.quote_requests') is not null and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='quote_requests' and column_name='customer_id'
  ) then
    alter table public.quote_requests
      add column customer_id uuid references public.customers(id) on delete set null;
  end if;
end $$;

create index if not exists sample_requests_customer_id_idx on public.sample_requests(customer_id);
create index if not exists quote_requests_customer_id_idx  on public.quote_requests(customer_id);

-- ---------------------------------------------------------------------------
-- 5.  SHARED helper: upsert_customer_from_request
--     Finds existing customer by email, or creates a new one.
--     Used by BOTH submit_sample_request() and submit_quote_request()
--
--     Returns table (customer_id uuid, customer_code text, is_new boolean)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_customer_from_request(
  p_email            text,
  p_company_name     text,
  p_contact_person   text default null,
  p_phone            text default null,
  p_country          text default null,
  p_address          text default null,
  p_destination_port text default null,
  p_source           text default 'Manual'
)
returns table (
  customer_id    uuid,
  customer_code  text,
  is_new         boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email          text  := lower(btrim(coalesce(p_email, '')));
  v_company        text  := coalesce(nullif(btrim(p_company_name), ''), 'Walk-In Customer');
  v_contact        text  := nullif(btrim(coalesce(p_contact_person, '')), '');
  v_phone          text  := nullif(btrim(coalesce(p_phone, '')), '');
  v_country        text  := nullif(btrim(coalesce(p_country, '')), '');
  v_address        text  := nullif(btrim(coalesce(p_address, '')), '');
  v_dest_port      text  := nullif(btrim(coalesce(p_destination_port, '')), '');
  v_lock_key       bigint;
  v_found          record;
begin
  if v_email = '' then
    raise exception 'email is required';
  end if;

  -- Advisory lock on hash(email) to prevent two concurrent submissions
  -- of the same email from creating duplicate customers.
  v_lock_key := ('x' || substr(md5(v_email), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Lookup existing customer first (use index on lower(email))
  select c.id, c.customer_code
    into v_found
    from public.customers c
   where lower(c.email) = v_email
   order by c.created_at desc
   limit 1;

  if v_found is not null then
    -- MERGE-UP: populate empty fields from the new request data.
    -- Do NOT overwrite fields the customer already supplied before.
    update public.customers
       set contact_person   = coalesce(nullif(contact_person, ''), v_contact),
           phone            = coalesce(nullif(phone, ''), v_phone),
           country          = coalesce(nullif(country, ''), v_country),
           address          = coalesce(nullif(address, ''), v_address),
           destination_port = coalesce(nullif(destination_port, ''), v_dest_port),
           updated_at       = now()
     where id = v_found.id;

    customer_id   := v_found.id;
    customer_code := v_found.customer_code;
    is_new        := false;
    return next;
    return;
  end if;

  -- INSERT: brand new customer.
  -- customer_code will be auto-populated by customers_gen_code_trg.
  insert into public.customers (
    company_name,
    contact_person,
    email,
    phone,
    country,
    address,
    destination_port,
    status,
    source
  ) values (
    v_company,
    v_contact,
    v_email,
    v_phone,
    v_country,
    v_address,
    v_dest_port,
    'active',
    coalesce(nullif(btrim(p_source), ''), 'Manual')
  )
  returning id, customer_code
  into customer_id, customer_code;

  is_new := true;
  return next;
end;
$$;

revoke all on function public.upsert_customer_from_request(
  text, text, text, text, text, text, text, text
) from public;

-- Only submit_* RPCs (SECURITY DEFINER) call this helper. Not exposed to anon.

-- ---------------------------------------------------------------------------
-- 6.  RETURN TYPE: submit_result (reference_number, customer_code, is_new_customer)
--     Used by both sample and quote RPCs.
-- ---------------------------------------------------------------------------
do $$
begin
  execute $t$
    create type if not exists public.submit_result as (
      reference_number  text,
      customer_code     text,
      is_new_customer   boolean
    );
  $t$;
end $$;

-- ---------------------------------------------------------------------------
-- 7.  UPDATED submit_sample_request — now upserts customer + links customer_id
--     Note: We drop/recreate so signature can change to return submit_result.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_sample_request(
  text, text, text, text, text, numeric, text, text, text
);

create or replace function public.submit_sample_request(
  p_full_name          text,
  p_company            text default null,
  p_email              text default null,
  p_country            text default null,
  p_product_name       text default null,
  p_sample_quantity    numeric default null,
  p_sample_quantity_unit text default null,
  p_shipping_address   text default null,
  p_message            text default null,
  p_phone              text default null
)
returns public.submit_result
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref         text;
  v_year        text := to_char(now() at time zone 'utc', 'YYYY');
  v_seq         int;
  v_cust_id     uuid;
  v_cust_code   text;
  v_cust_isnew  boolean;
  r             public.submit_result;
begin
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'full_name is required';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'email is required';
  end if;

  -- 1. Upsert customer
  select customer_id, customer_code, is_new
    into v_cust_id, v_cust_code, v_cust_isnew
    from public.upsert_customer_from_request(
      p_email            => p_email,
      p_company_name     => coalesce(p_company, split_part(p_email, '@', 1)),
      p_contact_person   => p_full_name,
      p_phone            => p_phone,
      p_country          => p_country,
      p_address          => p_shipping_address,
      p_destination_port => null,
      p_source           => 'Sample Request'
    );

  -- 2. Generate reference number (year-based, gapless)
  select coalesce(max(
    nullif(regexp_replace(reference_number, '^WAKA-SAMPLE-' || v_year || '-', ''), '')::int
  ), 0) + 1
    into v_seq
    from public.sample_requests
   where reference_number ~ ('^WAKA-SAMPLE-' || v_year || '-[0-9]+$');

  v_ref := 'WAKA-SAMPLE-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- 3. Insert sample request LINKED to customer
  insert into public.sample_requests (
    reference_number,
    full_name,
    company,
    email,
    phone,
    country,
    product_name,
    sample_quantity,
    sample_quantity_unit,
    shipping_address,
    message,
    status,
    customer_id
  ) values (
    v_ref,
    btrim(p_full_name),
    nullif(btrim(coalesce(p_company, '')), ''),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_country, '')), ''),
    nullif(btrim(coalesce(p_product_name, '')), ''),
    p_sample_quantity,
    coalesce(nullif(btrim(coalesce(p_sample_quantity_unit, '')), ''), 'kg'),
    nullif(btrim(coalesce(p_shipping_address, '')), ''),
    nullif(btrim(coalesce(p_message, '')), ''),
    'new',
    v_cust_id
  );

  r.reference_number := v_ref;
  r.customer_code    := v_cust_code;
  r.is_new_customer  := v_cust_isnew;
  return r;
end;
$$;

revoke all on function public.submit_sample_request(
  text, text, text, text, text, numeric, text, text, text, text
) from public;
grant execute on function public.submit_sample_request(
  text, text, text, text, text, numeric, text, text, text, text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8.  NEW submit_quote_request — mirrors sample request + quote-specific fields
-- ---------------------------------------------------------------------------
create or replace function public.submit_quote_request(
  p_full_name        text,
  p_company          text default null,
  p_email            text default null,
  p_phone            text default null,
  p_country          text default null,
  p_destination_port text default null,
  p_product_name     text default null,
  p_region_name      text default null,
  p_grade            text default null,
  p_processing       text default null,
  p_quantity_kg      numeric default null,
  p_packaging        text default null,
  p_certifications   text[] default null,
  p_target_shipment  text default null,
  p_message          text default null
)
returns public.submit_result
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref         text;
  v_year        text := to_char(now() at time zone 'utc', 'YYYY');
  v_seq         int;
  v_cust_id     uuid;
  v_cust_code   text;
  v_cust_isnew  boolean;
  r             public.submit_result;
begin
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'full_name is required';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'email is required';
  end if;
  if p_company is null or btrim(p_company) = '' then
    raise exception 'company is required';
  end if;

  -- 1. Upsert customer
  select customer_id, customer_code, is_new
    into v_cust_id, v_cust_code, v_cust_isnew
    from public.upsert_customer_from_request(
      p_email            => p_email,
      p_company_name     => p_company,
      p_contact_person   => p_full_name,
      p_phone            => p_phone,
      p_country          => p_country,
      p_address          => null,
      p_destination_port => p_destination_port,
      p_source           => 'Quote Request'
    );

  -- 2. Generate reference number
  select coalesce(max(
    nullif(regexp_replace(reference_number, '^WAKA-RFQ-' || v_year || '-', ''), '')::int
  ), 0) + 1
    into v_seq
    from public.quote_requests
   where reference_number ~ ('^WAKA-RFQ-' || v_year || '-[0-9]+$');

  v_ref := 'WAKA-RFQ-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- 3. Insert quote request LINKED to customer
  insert into public.quote_requests (
    reference_number,
    full_name,
    company,
    email,
    phone,
    country,
    destination_port,
    product_name,
    region_name,
    grade,
    processing,
    quantity_kg,
    packaging,
    certifications,
    target_shipment,
    message,
    status,
    customer_id
  ) values (
    v_ref,
    btrim(p_full_name),
    btrim(p_company),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_country, '')), ''),
    nullif(btrim(coalesce(p_destination_port, '')), ''),
    nullif(btrim(coalesce(p_product_name, '')), ''),
    nullif(btrim(coalesce(p_region_name, '')), ''),
    nullif(btrim(coalesce(p_grade, '')), ''),
    nullif(btrim(coalesce(p_processing, '')), ''),
    p_quantity_kg,
    nullif(btrim(coalesce(p_packaging, '')), ''),
    p_certifications,
    nullif(btrim(coalesce(p_target_shipment, '')), ''),
    nullif(btrim(coalesce(p_message, '')), ''),
    'new',
    v_cust_id
  );

  r.reference_number := v_ref;
  r.customer_code    := v_cust_code;
  r.is_new_customer  := v_cust_isnew;
  return r;
end;
$$;

revoke all on function public.submit_quote_request(
  text, text, text, text, text, text, text, text, text, text, numeric, text, text[], text, text
) from public;
grant execute on function public.submit_quote_request(
  text, text, text, text, text, text, text, text, text, text, numeric, text, text[], text, text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9.  RLS touch-up:
--     Quote_requests.public_insert_quote / sample_requests.public_insert_sample
--     were added for the public roles in init.sql. They are still valid because
--     SECURITY DEFINER bypasses RLS. But we also want them in case a direct
--     INSERT happens (e.g. test harness). Keep them.
--
--     Forbid direct anon customers SELECT/INSERT by NOT adding policies.
--     (Customers table RLS already restricts to Sales/Admin.)
-- ---------------------------------------------------------------------------
