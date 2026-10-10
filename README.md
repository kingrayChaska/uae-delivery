# UAE Delivery

Production logistics & last-mile delivery platform for the UAE. Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Supabase (Auth/Postgres/RLS/Storage) + Google Maps Platform.

This is a separate, new project — not related to the ParcelLink codebase.

## Status: all 13 phases complete

1. ✅ **Foundation** — scaffold, structure, Supabase clients, `.env.example`
2. ✅ **Database & RLS** — full schema, RLS policies, and a locally-run RLS attack battery (see `database/README.md`)
3. ✅ **Auth & roles** — register/login/forgot-password/reset-password wired to Supabase Auth, role-aware dashboard nav shell
4. ✅ **Public landing page + tracking page** — full marketing site (`components/marketing/`) and a real `/tracking` page wired to the `get_shipment_tracking` RPC
5. ✅ **Pricing engine** — formula (Phase 1) + DB wiring (Phase 2) + the interactive fare calculator on the landing page (Phase 4), all sharing the same `calculatePrice()` function
6. ✅ **Maps integration (Google Maps Platform)** — Places autocomplete (English/Arabic), map-pin selection, reverse geocoding, and real driving distance/duration from the Routes API; see `lib/maps/README.md`
7. ✅ **Customer dashboard + booking flow** — full 5-step booking wizard (pickup/delivery/package incl. photo upload/payment/review), dashboard home, My Deliveries, shipment detail + live tracking, payments, notifications, profile, and full support tickets
8. ✅ **Driver dashboard + delivery workflow** — accept/decline, the full status-progression workflow, proof of delivery (photo, signature pad, OTP via in-app notification, QR scan with manual fallback), COD collection, availability toggle, and location pings scoped to only-while-actively-delivering
9. ✅ **Operator dashboard + dispatch + live map** — dispatch board with proximity-sorted driver assignment, realtime live map with filters, shipments (incl. booking on a customer's behalf), drivers, customers, COD reconciliation, support inbox, and activity log; plus a database hardening pass (migration 0015) closing role/column-level update gaps found while testing
10. ✅ **Manager dashboard** — operator/driver onboarding (email invite or temporary password), staff edit/deactivate/reset, pricing rules with live preview, business accounts with members and CSV bulk shipment upload, reports with charts and CSV export, payments, settings; plus migration 0016 closing three gaps found while probing
11. ✅ **QR codes, notifications, COD reconciliation** — every shipment status change now fires the right notification via a single database trigger (migration 0017), printable QR waybills for customers and staff, optional QR verification at pickup, and a COD CSV export for managers
12. ✅ **Security hardening pass** — all 20 checklist items audited, fixed where needed, and verified; see **[SECURITY.md](SECURITY.md)**, including the pre-deploy steps only you can do
13. ✅ **Testing + final QA** — full spec test matrix automated (see **Testing** below); end-to-end suite against a real local Supabase stack found and fixed four release-blocking bugs

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Google Maps keys
npm run dev
npm test                     # unit tests (no network needed)
npm run security:secrets     # scan for committed credentials
npm run security:audit       # dependency vulnerability scan
```

## Roles

`customer`, `driver`, `operator`, `manager` — enforced server-side via `lib/auth/`, never trusted from the client. Role-based route redirects also happen in `proxy.ts` (Next.js 16's replacement for `middleware.ts`) as a UX convenience, not as the security boundary.

## Auth

Customer self-registration only (`/register`) — driver/operator/manager accounts are created by a Manager-only server action using the service-role client (Phase 10), never through a public form; the `handle_new_user` DB trigger hard-codes `role='customer'` regardless of client input either way. Whether `/register` redirects straight into the dashboard or shows a "check your email" message depends on whether **Confirm email** is enabled under Authentication → Providers in your Supabase project.

## Testing

| Command | What it proves |
|---|---|
| `npm test` | 139 unit tests: pricing (incl. the spec's 0/1/5/5.1/6/10/20/50+ km matrix), booking guards, route access for every role × area, CSV safety, CSP, security helpers |
| `npm run test:e2e` | 19 browser journeys against the real Supabase Auth + PostgREST servers — see [e2e/README.md](e2e/README.md) |
| `database/test/attacks.sql` + `grade.py` | 43 RLS / trigger / function-privilege attacks and legitimate paths |
| `database/test/transitions.sql` | Every shipment status transition (all from→to pairs) against an independently written state machine |
| `database/test/price-consistency.sh` | 5,000 random bookings: the app's price must equal the database's own price re-check |
| `npm run security:secrets` / `security:audit` | No committed credentials; no vulnerable dependencies |

The end-to-end suite found four bugs that every other check had passed — most seriously, a rounding mismatch that made the database reject almost every real booking. Details in [e2e/README.md](e2e/README.md#bugs-this-suite-found-all-fixed).

## Merchants, pricing and tracking (v2)

- **Deploy order:** apply `database/migrations/0022_merchants_pricing_v2.sql` **before** deploying this code — the app reads the new profile, pricing and shipment columns on every request.
- **Pricing** lives in one engine, `lib/pricing/calculate.ts` (`calculateShipmentPrice`), used by the booking wizard, the landing-page calculator, the server-side booking and — as SQL — the database's own price check. Rules (per account type × same-day/next-day, with weight allowance, COD fee and distance limit) are managed on **Manager → Pricing**.
- **Merchants:** customers choose Individual or Merchant after registering; merchant applications are reviewed under **Manager → Merchant Applications**.
- **Merchant emails** use `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `ParcelLink <notifications@yourdomain.ae>`). Without them, the in-app notification is still sent and the email is skipped (logged).
- **Tracking IDs** are 8 characters (e.g. `PL7K29X4`). Existing `DLV-…` numbers still work on `/tracking`.

## Merchant bulk shipments

- **Deploy order:** apply `database/migrations/0026_merchant_bulk_shipments.sql` **before** deploying this code. Every shipment read selects the new `delivery_date` column.
- Merchants upload a CSV at **Bulk Shipments** (`/dashboard/customer/bulk`). The server checks every row (address, coverage, route, price), the merchant reviews and fixes rows, then books them in one all-or-nothing step. Staff see the batches under **Bulk Shipments**, and can filter **Shipments** by batch (`?batch=<id>`).
- **Background checking:** set `BULK_WORKER_SECRET` (a random string of 16+ characters, e.g. `openssl rand -hex 32`). Rows are then checked by `/api/internal/bulk-worker` even after the merchant closes the tab. Each run restarts itself until the batch is done. On Vercel, `CRON_SECRET` works too. You can also add a cron that GETs that route with `Authorization: Bearer <secret>` (for example every 5 minutes on plans that allow it) to resume a run that was cut short. Without a secret, the merchant's open review screen does all the checking, so they need to keep it open until it finishes. The worker calls the app at `NEXT_PUBLIC_APP_URL` (or Vercel's URL).
- Google lookups for uploads are cached in `maps_cache` for a day and shared by every server instance. Driving routes are cached there for an hour, which also helps single bookings.
- Card payment is not offered for bulk bookings until a real payment provider replaces the stub in `lib/payments` (see `cardPaymentsLive()`).

## Operator booking emails

When a customer — individual or merchant — books a shipment themselves, the operations inbox gets an email with the booking details and a **View Shipment** link. A multi-shipment booking or merchant bulk list sends **one** summary email listing its shipments, not one per parcel.

- **Deploy order:** apply `database/migrations/0043_operator_booking_emails.sql` **before** deploying this code.
- **Environment variables** (server-side only):
  - `OPERATOR_NOTIFICATION_EMAIL` — the inbox, e.g. `operations@parcellinkuae.com`. Several addresses can be separated by commas (up to 10).
  - `RESEND_API_KEY` and `EMAIL_FROM` — the same Resend setup as merchant emails. In production, `EMAIL_FROM` must be on a domain verified in Resend.
  - `NEXT_PUBLIC_APP_URL` — the app's public URL (e.g. `https://parcellinkuae.com`), used only to build the email links.
  - `CRON_SECRET` (or `BULK_WORKER_SECRET`) — lets a cron call the retry sweep.
- **Which bookings:** bookings the customer made themselves (`/dashboard/customer/book` and merchant bulk lists). Bookings staff enter (on a customer's behalf, guest bookings, the manager's CSV upload) don't send one, and neither do edits, reassignments or status changes.
- **How it's sent:** database triggers queue each booking in `operator_booking_emails`, in the same transaction as the booking, so a booking that fails queues nothing. The app sends the email straight after the booking response. Failed sends are retried with backoff (1 min, 5 min, 15 min, 1 h, 3 h; 6 attempts in total). Bookings more than 48 hours old are never sent.
- **Retry sweep:** schedule `GET /api/internal/operator-emails` with `Authorization: Bearer <CRON_SECRET>`, for example every 5 minutes. Without it, a retry only happens when the next customer booking arrives. On Vercel, add this to `vercel.json` (needs a plan that allows crons more often than daily):
  ```json
  "crons": [{ "path": "/api/internal/operator-emails", "schedule": "*/5 * * * *" }]
  ```
- **If something's missing:** with no `OPERATOR_NOTIFICATION_EMAIL`, `RESEND_API_KEY` or `EMAIL_FROM`, bookings work as normal. Emails wait in the queue without using up attempts, and every run logs `recipient_missing` / `provider_not_configured`.
- **Monitoring:** every step logs one JSON line with `"scope":"operator_booking_email"`. The events are `notification_requested`, `provider_accepted` (with Resend's message id), `retry_scheduled`, `notification_failed`, `duplicate_ignored` and `recipient_missing`. The logs contain ids and tracking codes only: no names, phones, addresses or email addresses. The queue row records `status`, `attempts`, `last_error`, `provider_message_id` and `accepted_at`. `accepted` means Resend accepted the email. It does **not** mean the email was delivered (see Resend's dashboard for delivery).
- **Don't email real inboxes from development:** point `OPERATOR_NOTIFICATION_EMAIL` at your own address, or at Resend's test address `delivered@resend.dev`.

## Supabase email templates

Staff invitations and password resets use Supabase's server-side `token_hash` flow, handled by `/auth/confirm`. In the Supabase dashboard (Authentication → Email Templates), point these links at it:

- **Invite user:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
- **Reset password:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- **Confirm signup:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`

Also set **Site URL** to your deployed domain and add it under Redirect URLs. Without these changes, invite and reset emails will link to the wrong place.

## Creating a manager

Managers can't be created from inside the app — the database refuses to grant or revoke the `manager` role from any application session, including another manager's (migration 0016). To create the first manager (or any later one):

1. Supabase dashboard → Authentication → Users → **Add user** (email + password, auto-confirm).
2. SQL editor, as the `postgres` role:
   ```sql
   update profiles set role = 'manager' where email = 'manager@yourcompany.ae';
   insert into staff_profiles (profile_id, employee_id)
   select id, 'MGR-001' from profiles where email = 'manager@yourcompany.ae';
   ```

That manager can then onboard operators and drivers from **Operators** / **Drivers** in the dashboard.

## Branding

The landing page uses a placeholder brand name, **"Wasla"** (Arabic: "link/connection") — a one-line change in `components/marketing/site-nav.tsx` and `site-footer.tsx` once you have a real name. Brand colors/fonts live as CSS variables in `globals.css` (`--brand-*`) and self-hosted fonts (Space Grotesk / IBM Plex Sans / IBM Plex Mono, via `@fontsource`) are imported in `app/layout.tsx` — both are single places to swap if you want a different visual identity.

## Structure

```
src/
  app/            routes (public, auth, dashboard/<role>)
  components/     ui primitives (shadcn) + feature components
  lib/            auth, supabase clients, pricing, payments, maps, shared types
  services/       data-access layer per domain (shipments, drivers, payments, tracking)
database/
  migrations/     SQL schema + RLS policies (apply in order — see database/README.md)
  seed/           seed data (default pricing rule)
  test/           local-only RLS attack battery, not deployed to Supabase
```

## Conventions

Single quotes, semicolons, 2-space indent, arrow-function components (default export at the bottom for app components, named exports for `ui/` primitives and hooks/utils), props destructured with defaults, shared types/constants from `lib/types.ts`, data-fetching abstracted into hooks/services separate from UI.
