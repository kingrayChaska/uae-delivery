# UAE Delivery

Production logistics & last-mile delivery platform for the UAE. Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Supabase (Auth/Postgres/RLS/Storage) + Mapbox.

This is a separate, new project — not related to the ParcelLink codebase.

## Status: all 13 phases complete

1. ✅ **Foundation** — scaffold, structure, Supabase clients, `.env.example`
2. ✅ **Database & RLS** — full schema, RLS policies, and a locally-run RLS attack battery (see `database/README.md`)
3. ✅ **Auth & roles** — register/login/forgot-password/reset-password wired to Supabase Auth, role-aware dashboard nav shell
4. ✅ **Public landing page + tracking page** — full marketing site (`components/marketing/`) and a real `/tracking` page wired to the `get_shipment_tracking` RPC
5. ✅ **Pricing engine** — formula (Phase 1) + DB wiring (Phase 2) + the interactive fare calculator on the landing page (Phase 4), all sharing the same `calculatePrice()` function
6. ✅ **Maps integration (Mapbox)** — address autocomplete, geocoding, and real road-route distance/duration; see `lib/maps/README.md`
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
cp .env.example .env.local   # fill in Supabase + Mapbox keys
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
