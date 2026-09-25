# Waka Coffee — Export Management System

Full-stack system for an Ethiopian green-coffee exporter: a public website
(products, origins, quote / sample requests, contact, newsletter) and an
internal management system covering the whole chain

```
Customer ─► Quote Request ─► Sales review ─► Sales Order (draft) ─► Send to Export
         ─► Export Manager accepts ─► Export Batch (stock allocated) ─► Shipment
         ─► Documents ─► Traceability ─► Reports

Farmer / Supplier ─► Collection ─► Coffee Lot ─► Quality ─► Warehouse / Inventory ─► Export Batch
```

Sample requests are a separate workflow (review → prepare → dispatch → deliver)
and never turn into sales orders.

## Architecture

| Layer | Technology | Location |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query, Tailwind | `frontend/` |
| API | Node.js 20+, Express 5, zod, jose, multer | `backend/` |
| Database / Auth / Storage | Supabase (PostgreSQL, GoTrue, Storage, Realtime) | `frontend/supabase/` |

* **All business data goes through the Express API** (`/api/v1`). The browser
  uses Supabase only to hold the login session (token refresh) and to receive
  live notification events.
* The API calls Supabase **with the caller's own JWT**, so every Row Level
  Security policy applies on top of the API's role checks (defence in depth).
  The service-role key is optional and only used for Auth-admin operations.
* Workflow rules live **in the database** (triggers + `SECURITY DEFINER`
  functions): allowed status transitions (`workflow_transitions` table), stock
  never negative, lots never exceed their collection, allocations never exceed
  stock or the order, quality gate before warehouse/export, reference numbers
  generated race-free. They hold for every client — the API, the SQL editor or
  somebody calling PostgREST directly with their token.
* Notifications are created by database triggers and targeted at people
  (`notifications.user_id = profiles.id = auth.users.id`), never at the actor.

## 1. Database setup (Supabase)

Run the SQL files in the Supabase **SQL editor** in this order.

**Existing (deployed) project** — apply only the new migrations, in order:

1. `frontend/supabase/migrations/20260925000100_schema_reconciliation.sql`
2. `frontend/supabase/migrations/20260925000200_security_rls.sql`
3. `frontend/supabase/migrations/20260925000300_workflows.sql`
4. `frontend/supabase/migrations/20260925000400_notifications_audit.sql`
5. `frontend/supabase/migrations/20260925000500_reporting_traceability.sql`

They are idempotent (safe to re-run) and were tested against three starting
points: the deployed schema, a fresh `init.sql` install, and `init.sql` plus
every older migration in this folder.

**Brand-new project** — run `frontend/supabase/init.sql`, then the five
`20260925*` files above. (The older migrations in the folder are history;
their content is superseded by the 2026-09-25 set.)

What the migrations do (summary):

* **01 schema reconciliation** — converges the live schema and the SQL files
  (identity `profiles.id = auth.users.id`, `customer_id`/`assigned_to` on
  quotes and samples, `quote_items`, `documents`, `locations`,
  `shipment_updates`, farmer/farm/location links on collections, warehouse
  details, export allocations per warehouse, product catalog fields), status
  CHECK constraints, foreign keys, indexes, and race-free code generators
  (`SO-2026-0001`, `EXP-…`, `SHP-…`, `LOT-…`, `COL-…`, `WAKA-RFQ-…`,
  `WAKA-SAMPLE-…`, `CUST-…`, `SUP-…`, `FRM-…`, `FARM-…`, `LOC-…`, `WH-…`)
  seeded from existing data so numbers never collide.
* **02 security** — role helpers (department synonyms `procurement`,
  `quality`, `warehouse` behave like `field_officer`, `quality_officer`,
  `warehouse_officer`; inactive accounts lose access), **fixes a privilege
  escalation** (sign-up trusted a client-supplied role), profile guard
  (only admins change role/status; only super admins touch super admins),
  a complete reviewed RLS policy set for every table (existing unknown
  policies are dropped first), anon access limited to the public website
  tables, private `documents` storage bucket and product-image policies,
  realtime for notifications.
* **03 workflows** — `workflow_transitions` + transition triggers, public
  submission RPCs (quote, sample, contact, newsletter; customer
  find-or-create, throttling), `convert_quote_to_order`,
  `send_order_to_export` / `accept_export_order`, collection/lot/quality
  rules, stock ledger functions (`inventory_receive/adjust/issue/transfer`),
  `create_export_batch` / `set_export_batch_status` (allocate and release
  stock), shipment rules and propagation, `admin_create_employee_user`.
* **04 notifications & audit** — targeted notifications for every workflow
  event and a row-level audit trail in `activity_logs`.
* **05 reporting** — `dashboard_summary()` (role-aware), `report_summary()`,
  and traceability functions (`trace_lot`, `trace_shipment`, `trace_search`,
  `trace_overview`).

To inspect the live schema at any time run `backend/scripts/schema-snapshot.sql`
in the SQL editor (read-only).

### First administrator

1. Supabase Dashboard → Authentication → Users → *Add user* (email + password,
   auto-confirm).
2. In the SQL editor:

```sql
update public.profiles set role = 'super_admin' where email = 'you@yourdomain.com';
```

All other employees are then created from **Admin → Users**.

Recommended in Supabase → Authentication → Providers → Email: disable public
sign-ups (employees are created by administrators). Even if left enabled,
self-registered accounts get the `user` role and cannot enter the system.

## 2. Backend

```bash
cd backend
cp .env.example .env      # fill SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CORS_ORIGINS
npm install
npm run dev               # http://localhost:4000/api/v1
```

`GET /api/v1/health/ready` checks that Supabase Auth and REST are reachable.

## 3. Frontend

```bash
cd frontend
cp .env.example .env      # VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:3000
```

Staff sign in at `/admin/login`; every role lands on its own dashboard.
Password resets use `/admin/reset-password`.

## Roles and permissions

| Module | super_admin / admin | sales | export_manager | field_officer (procurement) | quality_officer (quality) | warehouse_officer (warehouse) |
|---|---|---|---|---|---|---|
| Dashboard, notifications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Quote / sample requests, contact messages | ✓ | ✓ | | | | |
| Customers, sales orders | ✓ | ✓ | view + accept | | | |
| Products & catalog | ✓ | ✓ | ✓ | | | |
| Farmers, suppliers, farms & locations, collections | ✓ | | | ✓ | | |
| Coffee lots | ✓ | | view | create/edit | view | view |
| Quality | ✓ | | | | ✓ | |
| Warehouses, inventory | ✓ | | | | | ✓ |
| Export batches, shipments, documents | ✓ | | ✓ | | | |
| Traceability | ✓ | | ✓ | | ✓ | ✓ |
| Reports | ✓ | | ✓ | | | |
| Users, settings, audit log | ✓ | | | | | |

Deleting records is admin-only. The same matrix is enforced three times:
the UI (`frontend/src/lib/permissions.ts`), the API
(`backend/src/config/permissions.js`) and the database (RLS + triggers).

## API reference (`/api/v1`)

Responses: `{ data }` or, for lists, `{ data: [...], meta: { total, page, limit } }`
(also `X-Total-Count`). Errors: `{ error: { message, code, details?, request_id } }`.
Lists accept `page`, `limit`, `search`, `sort` (`-created_at`), `from`, `to`
and module filters (status filters accept comma lists).

| Area | Endpoints |
|---|---|
| Health | `GET /health`, `GET /health/ready` |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/password-reset`, `POST /auth/reset-password`, `POST /auth/change-password`, `GET /auth/me`, `PATCH /auth/me`, `GET /auth/workflows` |
| Public website | `POST /public/quote-requests`, `POST /public/sample-requests`, `POST /public/contact-messages`, `POST /public/newsletter`, `GET /public/products`, `GET /public/products/:slug`, `GET /public/documents/:id/download` |
| Users | `GET /users`, `GET /users/directory`, `POST /users`, `GET /users/:id`, `PATCH /users/:id`, `PATCH /users/:id/role`, `PATCH /users/:id/status`, `POST /users/:id/password-reset` |
| Dashboard & activity | `GET /dashboard`, `GET /activity-logs` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id`, `POST /notifications/read-all`, `DELETE /notifications/:id`, `POST /notifications/broadcast` |
| Catalog | `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `PATCH /products/:id/publish`, `PATCH /products/:id/feature`, `PATCH /products/:id/archive`, `POST /products/:id/images`, `PATCH/DELETE /products/:id/images/:imageId`, `GET/POST /categories`, `GET/PATCH/DELETE /categories/:id`, `GET/POST /coffee-regions`, `GET/PATCH/DELETE /coffee-regions/:id` |
| Customers | `GET/POST /customers`, `GET/PATCH/DELETE /customers/:id`, `POST /customers/bulk-delete` |
| Quote requests | `GET/POST /quote-requests`, `GET/PATCH/DELETE /quote-requests/:id`, `PATCH /quote-requests/:id/status`, `PATCH /quote-requests/:id/assign`, `POST /quote-requests/:id/link-customer`, `POST /quote-requests/:id/convert`, `POST /quote-requests/:id/items`, `PATCH/DELETE /quote-requests/:id/items/:itemId`, `POST /quote-requests/bulk-delete` |
| Sample requests | `GET/POST /sample-requests`, `GET/PATCH/DELETE /sample-requests/:id`, `PATCH /sample-requests/:id/status`, `PATCH /sample-requests/:id/assign`, `POST /sample-requests/:id/link-customer`, `POST /sample-requests/bulk-delete` |
| Contact & newsletter | `GET /contact-messages`, `GET/PATCH/DELETE /contact-messages/:id`, `GET /newsletter-subscribers`, `PATCH/DELETE /newsletter-subscribers/:id` |
| Sales orders | `GET/POST /sales-orders`, `GET/PATCH/DELETE /sales-orders/:id`, `PATCH /sales-orders/:id/status`, `POST /sales-orders/:id/send-to-export`, `POST /sales-orders/:id/accept`, `POST /sales-orders/:id/items`, `PATCH/DELETE /sales-orders/:id/items/:itemId` |
| Sourcing | `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:id`; same for `/farmers`, `/farms`, `/locations`, `/collections` (+ `PATCH /collections/:id/status`), `/lots` |
| Quality | `GET/POST /quality-inspections`, `GET/PATCH/DELETE /quality-inspections/:id`, `POST /quality-inspections/:id/decision`, `POST /quality-inspections/:id/reopen`, `POST /quality-inspections/bulk-delete` |
| Warehouses & stock | `GET/POST /warehouses`, `GET/PATCH/DELETE /warehouses/:id`, `GET /inventory`, `GET /inventory/transactions`, `GET /inventory/receivable-lots`, `POST /inventory/receive`, `GET/PATCH /inventory/:id`, `POST /inventory/:id/adjust`, `POST /inventory/:id/issue`, `POST /inventory/:id/transfer` |
| Export | `GET/POST /export-batches`, `GET /export-batches/eligible-orders`, `GET /export-batches/available-stock`, `GET/PATCH /export-batches/:id`, `PATCH /export-batches/:id/status`, `GET/POST /shipments`, `GET /shipments/eligible-batches`, `GET/PATCH/DELETE /shipments/:id`, `PATCH /shipments/:id/status`, `POST /shipments/:id/updates` |
| Documents | `GET/POST /documents` (multipart `file` or `file_url`), `GET/PATCH/DELETE /documents/:id`, `GET /documents/:id/download` (short-lived signed link) |
| Traceability | `GET /traceability`, `GET /traceability/search?q=`, `GET /traceability/lots/:id`, `GET /traceability/shipments/:id` |
| Reports | `GET /reports/summary?from=&to=` |

## Tests

```bash
cd backend
npm test            # unit + integration (integration runs when TEST_ADMIN_* are set)
RUN_E2E=1 TEST_ADMIN_EMAIL=… TEST_ADMIN_PASSWORD=… npm run test:e2e
```

The end-to-end suite (`backend/tests/e2e`) walks the complete business chain
through the real API, RLS and triggers: public forms → quote → order → send
to Export → accept → field collection → lot → quality approval → warehouse
receipt → export batch → shipment → documents → traceability → reports, plus
role restrictions, direct-database bypass attempts, deactivated accounts and
token refresh/logout. It creates data in the target project (employees are
deactivated afterwards) — point it at a staging project.

```bash
cd frontend
npm run build       # TypeScript check + production build
```

## Troubleshooting

* **"The database schema is out of date"** (API error `SCHEMA_OUTDATED`) — apply the `20260925*` migrations.
* **"Cannot reach the Waka Coffee API"** — start the backend and check `VITE_API_URL`; the frontend origin must be in `CORS_ORIGINS`.
* **Signed in but "Access denied"** — the account is inactive or has the `user` role; an administrator can change it under Users.
