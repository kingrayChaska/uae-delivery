# Database

PostgreSQL schema + Row Level Security for the UAE delivery platform, designed for Supabase.

## Deploying to Supabase

Apply the files in `migrations/` **in order** — either paste each into the Supabase SQL Editor, or use the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Then run `seed/0001_default_pricing_rule.sql` once, to create the initial 5km / AED 12 / AED 1-per-km pricing rule the booking flow depends on.

You do **not** need to add any `GRANT` statements yourselves — Supabase's managed Postgres already grants `anon`/`authenticated` baseline table and sequence access by default; RLS (enabled on every table here) is the actual restriction layer. The two `GRANT EXECUTE` statements at the end of `0011_public_tracking.sql` are the one exception, needed so the anonymous `/tracking` page can call those two functions.

## Design decisions worth knowing

- **Roles are a Postgres enum** (`customer`/`driver`/`operator`/`manager`), not a separate `roles` table — there's no facility/tenant layer in this build (confirmed decision, see project notes), so a fixed enum is simpler than a lookup table with nothing to look up.
- **`profiles` is the single identity table.** Role-specific fields split into `driver_profiles` (vehicle, license, availability) and `staff_profiles` (employee ID, for both operator and manager) rather than one wide nullable table.
- **Pickup/dropoff live as columns on `shipments`**, not a separate `locations` table — they're 1:1 with a shipment and never reused, so normalizing them out would add a join for no benefit. `driver_locations` (a real time series, reused across pings) *is* its own table.
- **Self-registration can never choose its own role.** The `handle_new_user` trigger always inserts `role='customer'`, regardless of what's in signup metadata. Staff accounts are created by a Manager-only server action using the service-role client, which promotes the role *after* the trigger has already run — see the comment in `0002_profiles.sql`.
- **Price is checked twice.** The booking server action (Phase 5+) computes `distance_km` and `price` itself and never reads them from client input — that's the primary control. `shipments_insert`'s RLS policy also independently re-validates that `price` is mathematically consistent with `distance_km` and the referenced `pricing_rules` row, as a backstop against a request that bypasses the server action and hits the Supabase REST API directly.
- **Status transitions are data, not code.** `shipment_status_transitions` lists every legal `(from, to)` pair; a trigger rejects anything not listed. See that table for the full state machine.
- **`audit_logs`, `payments`, and `notifications` have no INSERT policy for `authenticated` at all.** They're written only by trusted server code using the service-role client, after that code has already checked the actor's role — there is no RLS policy to route around because there's no client-reachable write path in the first place.
- **Public tracking is a function, not a table grant.** `get_shipment_tracking(tracking_number)` / `get_shipment_tracking_history(...)` are `SECURITY DEFINER` functions that return a curated, PII-free subset of a shipment's data (status, ETA, live driver position while in transit) — callable by anonymous visitors on `/tracking`. The `shipments` table itself is never readable by `anon`.
- **Package photos are folder-scoped by uploader, not by shipment.** The photo is uploaded during booking, before the shipment row exists, so the upload-time RLS policy checks the path prefix against `auth.uid()`. Read access is broader once the shipment exists: the uploader, any staff member, or the shipment's assigned driver (via a join back to `shipments.package_image_url`) can view it.
- **Proof-of-delivery evidence is folder-scoped by shipment, not by uploader.** Unlike package photos, this is uploaded by the driver after the shipment already exists, so `proof-of-delivery` bucket policies (migration 0013) key off `shipments.id` in the path and join back to check `driver_id`/`customer_id`/staff — the uploader, the customer, and staff can all view it; nobody else can.
- **A driver can't null out their own `driver_id` through the ordinary RLS update policy** — declining an assignment needs the new row's `driver_id` to be `null`, which fails `shipments_update`'s `WITH CHECK` for a non-staff caller by design. `decline_shipment_assignment()` (migration 0013) is a narrow `SECURITY DEFINER` function that checks the caller is actually the assigned driver and the shipment is still `'assigned'`, then makes that one specific state change — a scalpel, not a policy loosening.
- **Row-level access isn't column-level access.** RLS decides *which rows* a session can update, not *which columns or statuses*. `enforce_shipment_update_permissions` (migration 0015) closes that gap: customers may only cancel their own shipment; drivers may only move status through the driver workflow and set a failure reason; staff are unrestricted. It only applies to direct client sessions (`current_user = 'authenticated'`) — `SECURITY DEFINER` functions and the service-role client do their own checks. Before 0015, a customer could assign a driver to their own shipment and advance it through legal driver-only transitions; this was found by probing during Phase 9, not by review.
- **Delivery secrets live where drivers can't read them.** The QR token and delivery OTP are in `shipment_secrets` (RLS on, no policies at all). `issue_delivery_otp()` generates the code and notifies the customer inside the database; `complete_delivery()` is the only path to `'delivered'` — it verifies OTP/QR against the secrets table, checks any photo/signature path really exists in that shipment's storage folder, requires at least one proof, and records `proof_of_delivery` atomically. Wrong OTPs return `'invalid_otp'` (rather than raising, which would roll back the counter) and the code is invalidated after 5 attempts. Drivers can no longer insert `proof_of_delivery` directly.
- **Delivery OTP has no SMS provider behind it.** The generated code (stored in `shipment_secrets` since migration 0015) is delivered via the customer's in-app notification feed rather than a text message, since no SMS integration is configured in this build. Swap in a real provider by changing how `issue_delivery_otp()` delivers the code — storage and verification don't need to change.

- **Only the active pricing rule prices client bookings** (migration 0016). The price check previously accepted any rule id, so after a Manager changed pricing a customer calling the API directly could keep booking at a retired, cheaper rate.
- **Business tagging requires membership** (0016). A customer can only attach `business_account_id` for a business they belong to; otherwise they could inject shipments into another company's history and billing.
- **The manager role is locked** (0016). No application session — not even a manager's — can grant or revoke `manager`; that's done from the Supabase dashboard (see the root README). All three 0016 gaps were found by probing before the Manager dashboard was built.
- **Notifications are fired from one place: table triggers, not application code.** `shipments` changes reach the database through four different code paths (customer cancel, driver status advance, operator assign/reassign, and the `complete_delivery`/`decline_shipment_assignment` functions). A single `AFTER INSERT`/`AFTER UPDATE` trigger pair (migration 0017) is the one place that sees every path, so it's the reliable place to fire customer/driver/operator notifications from — scattering inserts across each call site would eventually miss one. The one app-level notification insert that existed before this (`lib/dispatch/actions.ts`) was removed once the trigger covered it, to avoid duplicates.
- **QR label printing and pickup verification go through purpose-built functions, not a table read.** `shipment_secrets` (0015) still has zero policies. `get_shipment_qr_token()` returns the token to the customer, the assigned driver, or staff, for printing a label. `verify_shipment_qr()` is read-only — it tells a driver's scan whether it matches, without revealing the correct value and without changing any state, so an optional "verify at pickup" scan can't be confused with the mandatory proof-of-delivery check `complete_delivery()` already does.
- **Functions are not callable by default** (migration 0018). Postgres grants `EXECUTE` on new functions to everyone, which let any signed-in user call the internal `notify_operators()` helper and message every staff member (found in the Phase 12 audit). It's now revoked, and default privileges in the schema are changed so future functions start with no grants. Every client-callable function is granted deliberately. Also in 0018: random tracking numbers, the `rate_limits` table and `check_rate_limit()` (service-role only), bcrypt-hashed delivery OTPs, and server-side upload size/type limits on both storage buckets.
- **Duplicate submissions can't create duplicate shipments** (migration 0019). The booking wizard sends one request id per booking attempt; a unique index on `(customer_id, client_request_id)` guarantees one shipment per id even when two requests race, and the app returns the original shipment instead of an error.
- **Bulk shipment lists are batches** (migration 0020). A customer's bulk list is a `shipment_batches` row, and each shipment created from it carries `batch_id`. A trigger lets a shipment join only an open batch that belongs to the same customer, so nobody can slip shipments into someone else's list. Customers may only open a batch in its initial state; finalizing it (counts, failed rows, status) is done with the service-role client. Batch shipments skip the per-shipment "booked" and "ready for dispatch" notifications, and a single batch-level notification goes to the customer and to every operator and manager instead. The manager's business-account CSV upload goes through the same batch pipeline.
- **Realtime** (migration 0014) publishes `shipments` and `driver_locations` for the live dispatch map. Supabase Realtime applies each subscriber's RLS, so no extra policies are needed — but Realtime itself can't run in the local harness, so the live-update behaviour is only verifiable against a real Supabase project.

## Local verification (`test/`)

Everything in `test/` is a local-only harness — it is **not** deployed to Supabase. It applies all migrations to a scratch Postgres database and runs a battery of RLS attacks (role self-promotion, price tampering, illegal status jumps, cross-role data access, direct writes to service-role-only tables, etc.) to confirm they're actually blocked, not just reviewed by eye.

```bash
# requires a local Postgres with a postgres superuser
sudo apt-get install postgresql && sudo service postgresql start

bash database/test/run.sh          # applies migrations + seed to a scratch DB
sudo -u postgres psql -d uae_delivery_test -f database/test/attacks.sql 2>&1 | python3 database/test/grade.py
```

Two more suites run against the same scratch database:

```bash
sudo -u postgres psql -d uae_delivery_test -f database/test/transitions.sql   # every status transition
bash database/test/price-consistency.sh    # needs the e2e database: bash e2e/stack/setup-db.sh
```

`transitions.sql` tries every from→to status pair (self-transitions are no-ops and skipped) and compares the database's verdict with a state machine written out independently in the test. `price-consistency.sh` prices 5,000 random bookings with the app's `calculatePrice()` and asks the database's own `shipment_price_is_valid()` to accept each one.

`grade.py` checks every labelled step and exits non-zero if any `ATTACK` got through or any `LEGITIMATE` step errored. Always run it against a fresh database (`run.sh` first) — the battery inserts fixed test users and changes the active pricing rule, so a second run on the same database produces false failures.

Read the output against the `ATTACK:` / `LEGITIMATE:` labels in `attacks.sql` — an `ERROR` after an `ATTACK:` line means it was correctly blocked; an `ERROR` after a `LEGITIMATE:` line means something is actually broken.

`test/0000b_storage_stub.sql` similarly stubs just enough of Supabase Storage's schema (`storage.buckets`/`storage.objects`/`storage.foldername()`) to exercise migration 0012's policies — folder-scoped upload, cross-customer read isolation, and the assigned-driver read path are all covered by `attacks.sql`. It does not replicate Supabase Storage's actual upload API, so a real end-to-end upload still needs a live Supabase project.
