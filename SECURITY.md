# Security

This maps the project's pre-launch security checklist to what is implemented, how each item was verified, and what still has to be done when deploying. "Verified" means an automated check that fails if the protection is removed: the database attack battery (`database/test/`), unit tests (`npm test`), or the checks recorded under each item.

## Pre-deploy checklist (things only you can do)

1. Set every variable in `.env.example` in your host's environment settings — never in a committed file.
2. Create a Cloudflare Turnstile widget and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Without them, production refuses logins by design (item 12).
3. In Mapbox, restrict `NEXT_PUBLIC_MAPBOX_TOKEN` to your production domain(s). Keep `MAPBOX_SECRET_TOKEN` unrestricted but server-only.
4. In Supabase → Authentication: set the Site URL and Redirect URLs to your domain, update the three email templates (README, "Supabase email templates"), and set the minimum password length to 8.
5. Apply all migrations in `database/migrations/` in order, then the seed.
6. Run `npm run security:secrets` and `npm run security:audit` before every release (ideally in CI).
7. If any key has **ever** been committed, pasted into a chat or ticket, or shared, rotate it in the provider's dashboard. Deleting it from the code is not enough.

## The 20 items

### 1. Hide API keys
Secrets are only read server-side from `process.env`. Files that use them import `server-only`, so a client import fails the build. The only browser-visible values are the ones designed to be public: the Supabase URL and anon key, the Mapbox public token, and the Turnstile site key.
**Verified:** the build was run with a unique sentinel value in every secret variable, and the compiled client bundle (`.next/static`) was searched. No sentinel values, no secret variable names, and no server-only code (`auth.admin`, `check_rate_limit`, `createAdminClient`) were found.

### 2. Purge Git secrets
`.env*` is git-ignored, with an exception so `.env.example` (placeholders only) *is* committed; previously the rule accidentally ignored it too. `npm run security:secrets` scans the working tree for JWTs, Supabase secret keys, Mapbox secret tokens, Turnstile secrets, Stripe keys, private key blocks, and database URLs containing passwords.
**Verified:** clean tree passes; planted fake keys are detected and the script exits 1.
**Your action:** this project has no git history yet, so there is nothing to purge. If a secret is ever committed, rotate it, then remove it from history with `git filter-repo`.

### 3. Use public DB key
The browser only ever holds the anon key, whose access is entirely governed by RLS. The service-role key is used from exactly one module (`lib/supabase/admin.ts`, marked `server-only`), and every function that uses it checks the caller's role first.

### 4. Enable row-level security
RLS is enabled on every table. Tables with no client use have RLS on and **zero** policies, so nothing reaches them except `SECURITY DEFINER` functions: `shipment_secrets`, `rate_limits`, and writes to `audit_logs`, `payments` and `notifications`.
**Verified:** a catalog query confirms no table in `public` has RLS disabled; the attack battery checks access per role.

### 5. Encrypt sensitive data
- In transit: TLS everywhere (item 19). Supabase and Mapbox are HTTPS-only.
- At rest: Supabase encrypts the database and storage at rest (AES-256).
- Application level: delivery OTPs are stored as bcrypt hashes (migration 0018); the plaintext only exists in the customer's notification. QR tokens stay in `shipment_secrets`, readable only through purpose-built functions.
- Passwords: see item 10.

### 6. Enforce server-side auth
Every server action checks the caller with `requireRole`/`requireUser`, except the inherently public ones: login, register, password reset, and tracking lookup. Those get Turnstile and rate limiting instead. Page layouts re-check the role server-side, and RLS is the final check under all of it.
**Fixed in this pass:** the address-search and routing actions had no auth check at all, so anyone could run up the Mapbox bill. They now require a signed-in user and are rate limited.

### 7. Lock record access
Row access is scoped by RLS per role; ownership lookups return "not found" rather than "forbidden", so they don't reveal which ids exist. Public tracking returns a limited, PII-free view through a function, never direct table access.
**Fixed in this pass:** tracking numbers were sequential, so the public tracking page could be walked to see every active shipment. They are now random (`DLV-YYYYMMDD-XXXXXXXX`, about 850 billion per day), and the lookup is also rate limited and Turnstile-protected.
**Verified:** attack battery (cross-customer reads, a driver reading another driver's shipment, anonymous table access).

### 8. Block field tampering
Database triggers restrict which columns and status changes each role can make: customers can only cancel, drivers can only move through the driver workflow, and pricing or payment fields can only be changed by staff. The manager role can't be granted or revoked from any application session. Bookings must use the active pricing rule, and business tagging requires membership.
**Verified:** attack battery — self-assigning a driver, editing addresses after booking, skipping proof of delivery, booking at a retired rate, self-promotion — and the same self-promotion attempt through the real PostgREST API (`e2e/stack/smoke.sh`). Every status transition is covered by `database/test/transitions.sql`.

### 9. Secure session cookies
Supabase session cookies are set with `SameSite=Lax` and `Secure` in production. They are *not* `httpOnly`, because the browser client must read the session for realtime updates and direct uploads. The mitigation is the strict script CSP (item 18): with no inline or injected scripts allowed, an XSS bug has no easy way to reach the cookie.

### 10. Hash passwords
Passwords are handled entirely by Supabase Auth, which stores bcrypt hashes; the app never sees or stores one. Sign-up requires 8+ characters with upper and lower case letters and a number (enforced in the app).
**Your action:** set the minimum password length to match in the Supabase dashboard.

### 11. Rate-limit login
Counters live in Postgres (`rate_limits`, updated in a single atomic statement) so every serverless instance shares them. Limits are defined in one place, `lib/security/rate-limit.ts`:

| Action | Limit |
|---|---|
| Login | 20 / 15 min per IP **and** 5 / 15 min per email |
| Register | 5 / hour per IP |
| Password reset request | 5 / hour per IP and 3 / hour per email |
| Password change | 5 / 15 min per user |
| Tracking lookup | 30 / min per IP |
| Address search & routing | 60 / min per user |
| Booking | 20 / hour per user |
| Delivery OTP re-send | 5 / hour per shipment |
| Support tickets, bulk uploads, staff creation | per-user hourly caps |

The per-email login limit matters specifically here: every auth request reaches Supabase *from this server's IP*, so Supabase's own per-IP limits can't tell users apart. Wrong delivery OTPs are also capped at 5 attempts per code in the database. The limiter fails closed.
**Verified:** the attack battery confirms a client session can't call the limiter function and that limits are enforced; the end-to-end suite shows it in a real browser — the 6th wrong password in a row locks the account, and even the *correct* password is then refused until the window passes.

### 12. Add bot protection
Cloudflare Turnstile protects login, registration, password reset, and the public tracking lookup. Tokens are verified server-side (single-use; the widget resets after every attempt). If the secret key is missing in production, those requests are refused rather than silently unprotected; disabling it requires `TURNSTILE_DISABLED=true`.
**Verified:** unit tests cover mode selection and request/response handling. A real verification needs your Turnstile keys; use Cloudflare's always-pass test keys locally.

### 13. Parameterize queries
All queries go through supabase-js/PostgREST, which parameterizes values, and no SQL function builds SQL from strings (a catalog check found no `EXECUTE` in any function). The one string-built PostgREST filter, `.or()` in the staff detail service, only receives an id that has been verified as a UUID first. Every action that takes an id validates it as a UUID before use.
**Verified:** unit tests include filter-injection strings like `x,entity_id.neq.null` being rejected.

### 14. Validate all input
Every server action validates its input with Zod before doing anything, even when the browser form already validated. Bulk CSV uploads are re-parsed and re-validated server-side, and location pings are range-checked. Report date ranges are parsed, bounded to a year, and fall back safely when malformed.

### 15. Escape user content
React escapes all rendered text, and the codebase contains no `dangerouslySetInnerHTML`. CSV exports prefix formula-trigger characters (`= + - @`), so a customer named `=HYPERLINK(...)` can't execute in Excel or Sheets. Database errors are never shown verbatim; only messages written for users by our own `RAISE EXCEPTION` pass through (`lib/security/errors.ts`).
**Fixed in this pass:** 27 places returned raw database errors, leaking table, policy and constraint names.

### 16. Restrict file uploads
Both storage buckets are private and enforce a 5 MB size limit and a JPEG/PNG/WebP type allowlist *server-side* (migration 0018). The browser checks the same things only for fast feedback. Upload paths are scoped by RLS: package photos go under the uploader's own folder, and proof-of-delivery files under a shipment the uploader is assigned to. Delivery completion also re-checks that referenced files really exist in that shipment's folder.
**Verified:** attack battery (uploading to another customer's folder, uploading proof for an unassigned shipment).

### 17. Trim API responses
Every query selects explicit columns; there is no `select('*')`. Public tracking returns a limited, PII-free view. Staff-only data (audit logs, other users' profiles, secrets) is never returned to other roles, and errors are sanitized (item 15).

### 18. Add security headers
- Content-Security-Policy with a fresh nonce per request. Scripts run only with the nonce or when loaded by a nonced script (`strict-dynamic`). No `unsafe-inline` or `unsafe-eval` for scripts in production. Only the exact Supabase project is allowed, not all of `*.supabase.co`. Framing, plugins and `<base>` hijacking are blocked.
- Also sent: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, and a `Permissions-Policy` allowing only camera and geolocation (needed by drivers). `X-Powered-By` is removed.

**Verified:** response headers were checked on the production build. Every rendered script carries the header's nonce, and the nonce differs per request. In a headless browser, all public pages load with **zero** CSP violations and fully hydrate. That check found Zod's `eval` feature probe tripping the CSP, which was fixed with Zod's `jitless` mode rather than by allowing `unsafe-eval`.

### 19. Force HTTPS
In production, HTTP requests get a `308` redirect to HTTPS (for hosts that don't already redirect at the edge). HSTS (2 years, `includeSubDomains`, `preload`) keeps browsers on HTTPS, and the CSP adds `upgrade-insecure-requests`. Session cookies are `Secure`.
**Verified:** the production server returned `308` to `https://` for a plain-HTTP request.

### 20. Scan dependencies
`npm run security:audit` (production dependencies) — **0 vulnerabilities** at this phase, including dev dependencies.
**Your action:** run it before each release; enabling Dependabot or Renovate on the repo will surface new advisories between releases.

## Known limitations

- **Supabase Realtime and Storage** couldn't run in the local test harness. Their access rules are the RLS and storage policies tested above, but end-to-end behavior needs a real Supabase project.
- **Rate limiting by IP** trusts `x-forwarded-for` as set by the hosting platform. On a self-hosted proxy, make sure it overwrites that header. Per-account limits apply regardless.
- **Session cookies aren't `httpOnly`** (item 9) — an accepted tradeoff of Supabase's browser client, mitigated by the CSP.
- **SMS and payment providers** are not connected. OTPs go to the in-app notification feed, and card bookings stay pending until a payment provider is implemented.
