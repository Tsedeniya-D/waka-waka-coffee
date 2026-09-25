-- Waka Coffee: READ-ONLY live schema snapshot
-- ---------------------------------------------------------------------------
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It only reads system catalogs (plus row counts / distinct status values).
-- It returns ONE row with ONE column "snapshot". Copy that cell's value and
-- save it as: backend/schema-snapshot.json
--
-- No personal data is returned: only structure, function/policy definitions,
-- row counts, and counts per status / role value.
-- ---------------------------------------------------------------------------

with
tbl as (
select c.oid, c.relname, c.relkind, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
),
tables_json as (
select jsonb_agg(x order by x->>'name') as v
from (
select jsonb_build_object(
'name', t.relname,
'kind', t.relkind,
'rls_enabled', t.relrowsecurity,
'columns', (
select jsonb_agg(jsonb_build_object(
'name', a.attname,
'type', format_type(a.atttypid, a.atttypmod),
'not_null', a.attnotnull,
'default', pg_get_expr(d.adbin, d.adrelid)
) order by a.attnum)
from pg_attribute a
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
),
'constraints', (
select jsonb_agg(jsonb_build_object(
'name', con.conname,
'type', con.contype,
'def', pg_get_constraintdef(con.oid)
) order by con.conname)
from pg_constraint con
where con.conrelid = t.oid
),
'indexes', (
select jsonb_agg(pg_get_indexdef(i.indexrelid))
from pg_index i
where i.indrelid = t.oid
),
'triggers', (
select jsonb_agg(pg_get_triggerdef(tg.oid))
from pg_trigger tg
where tg.tgrelid = t.oid and not tg.tgisinternal
),
'policies', (
select jsonb_agg(jsonb_build_object(
'name', p.policyname,
'cmd', p.cmd,
'roles', p.roles,
'permissive', p.permissive,
'using', p.qual,
'with_check', p.with_check
) order by p.policyname)
from pg_policies p
where p.schemaname = 'public' and p.tablename = t.relname
),
'row_estimate', (
select s.n_live_tup from pg_stat_user_tables s where s.relid = t.oid
)
) as x
from tbl t
) s
),
functions_json as (
select jsonb_agg(jsonb_build_object(
'name', p.proname,
'args', pg_get_function_identity_arguments(p.oid),
'returns', pg_get_function_result(p.oid),
'security_definer', p.prosecdef,
'definition', pg_get_functiondef(p.oid)
) order by p.proname) as v
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
and p.prokind = 'f'
and not exists (
select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e'
)
),
function_grants_json as (
select jsonb_agg(jsonb_build_object(
'function', r.routine_name,
'grantee', r.grantee,
'privilege', r.privilege_type
)) as v
from information_schema.routine_privileges r
where r.routine_schema = 'public' and r.grantee in ('anon', 'authenticated', 'service_role')
),
table_grants_json as (
select jsonb_object_agg(g.table_name, g.privs) as v
from (
select table_name,
jsonb_object_agg(grantee, privs) as privs
from (
select table_name, grantee, jsonb_agg(privilege_type order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
) x
group by table_name
) g
),
enums_json as (
select jsonb_object_agg(t.typname, (
select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid
)) as v
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e'
),
sequences_json as (
select jsonb_agg(jsonb_build_object('name', sequencename, 'last_value', last_value)) as v
from pg_sequences where schemaname = 'public'
),
auth_triggers_json as (
select jsonb_agg(pg_get_triggerdef(tg.oid)) as v
from pg_trigger tg
where tg.tgrelid = 'auth.users'::regclass and not tg.tgisinternal
),
storage_json as (
select jsonb_build_object(
'buckets', (
select jsonb_agg(jsonb_build_object(
'id', b.id, 'public', b.public,
'file_size_limit', b.file_size_limit,
'allowed_mime_types', b.allowed_mime_types
)) from storage.buckets b
),
'policies', (
select jsonb_agg(jsonb_build_object(
'name', p.policyname, 'cmd', p.cmd, 'roles', p.roles,
'using', p.qual, 'with_check', p.with_check
)) from pg_policies p where p.schemaname = 'storage'
)
) as v
),
realtime_json as (
select jsonb_agg(tablename) as v
from pg_publication_tables
where pubname = 'supabase_realtime'
),
-- Distinct values actually stored (counts only). to_jsonb(row)->>'col' never
-- errors if a column is missing; it simply yields null.
value_counts_json as (
select jsonb_build_object(
'profiles.role', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'role', '<null>') k, count(*) n from public.profiles x group by 1) s),
'profiles.is_active', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'is_active', '<null>') k, count(*) n from public.profiles x group by 1) s),
'quote_requests.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.quote_requests x group by 1) s),
'sample_requests.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.sample_requests x group by 1) s),
'contact_messages.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.contact_messages x group by 1) s),
'customers.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.customers x group by 1) s),
'customers.source', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'source', '<null>') k, count(*) n from public.customers x group by 1) s),
'sales_orders.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.sales_orders x group by 1) s),
'sales_orders.order_number_sample', (select jsonb_agg(v) from (select to_jsonb(x)->>'order_number' v from public.sales_orders x order by x.created_at desc limit 3) s),
'export_batches.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.export_batches x group by 1) s),
'shipments.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.shipments x group by 1) s),
'shipment_documents.document_type', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'document_type', '<null>') k, count(*) n from public.shipment_documents x group by 1) s),
'coffee_lots.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.coffee_lots x group by 1) s),
'coffee_lots.lot_code_sample', (select jsonb_agg(v) from (select to_jsonb(x)->>'lot_code' v from public.coffee_lots x order by x.created_at desc limit 3) s),
'collection_records.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.collection_records x group by 1) s),
'quality_inspections.result', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'result', '<null>') k, count(*) n from public.quality_inspections x group by 1) s),
'quality_inspections.approval_status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'approval_status', '<null>') k, count(*) n from public.quality_inspections x group by 1) s),
'inventory.status', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'status', '<null>') k, count(*) n from public.inventory x group by 1) s),
'inventory_transactions.transaction_type', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'transaction_type', '<null>') k, count(*) n from public.inventory_transactions x group by 1) s),
'notifications.type', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'type', '<null>') k, count(*) n from public.notifications x group by 1) s),
'notifications.related_type', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'related_type', '<null>') k, count(*) n from public.notifications x group by 1) s),
'activity_logs.action', (select jsonb_object_agg(k, n) from (select coalesce(to_jsonb(x)->>'action', '<null>') k, count(*) n from public.activity_logs x group by 1) s)
) as v
)
select jsonb_pretty(jsonb_build_object(
'generated_at', now(),
'postgres_version', version(),
'tables', (select v from tables_json),
'functions', (select v from functions_json),
'function_grants', (select v from function_grants_json),
'table_grants', (select v from table_grants_json),
'enums', (select v from enums_json),
'sequences', (select v from sequences_json),
'auth_users_triggers', (select v from auth_triggers_json),
'storage', (select v from storage_json),
'realtime_tables', (select v from realtime_json),
'value_counts', (select v from value_counts_json)
)) as snapshot;