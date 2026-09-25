# End-to-end tests

Real browser tests (Playwright) of the finished app against a **local Supabase stack** built from the actual Supabase server components — not mocks of them:

| Piece | What it is |
|---|---|
| Postgres | Your local Postgres, set up like a Supabase project (roles, default grants), then all of `database/migrations/` and the seed |
| Supabase Auth | The real `supabase/auth` (GoTrue) server binary, which runs its own `auth` schema migrations |
| PostgREST | The real PostgREST binary — the same REST layer supabase-js talks to |
| Gateway | `stack/gateway.mjs` — routes `/auth/v1` and `/rest/v1` on one origin, like `https://<project>.supabase.co` |
| Mapbox | `stack/fake-mapbox.mjs` — returns real Mapbox response shapes for a few UAE landmarks; road distance = 1.3 × straight line |
| Email | `stack/smtp-sink.py` — captures the Auth server's emails so tests follow the real invite links |
| HTTPS | `stack/tls-proxy.mjs` — TLS-terminating proxy in front of the app, like Vercel's edge, so Secure cookies, HSTS and the HTTP→HTTPS redirect behave as in production |

Not included: Supabase **Storage** and **Realtime** (their access rules are covered by `database/test/attacks.sql`; live behaviour needs a real project), and Cloudflare **Turnstile** (disabled via `TURNSTILE_DISABLED=true`; its logic is unit tested).

## Run

Requires Linux x86-64, Node 22+, a local Postgres 16 (`sudo apt install postgresql`), `openssl`, and Python 3 with `pip install aiosmtpd`.

```bash
npm run test:e2e
```

That downloads the pinned server binaries on first run (`stack/install.sh`), rebuilds the database from scratch, builds the app wired to the stack, starts everything, runs the suite, and stops the stack. Logs land in `e2e/.logs/`, failure screenshots and the responsive screenshots in `e2e/.results/`.

## What the suite covers

- **01 Customer:** landing page first (not login) · signed-out redirect keeps `redirectTo` · registration through the real Auth server · a customer can't open any other role's dashboard · same pickup/destination rejected · a trip priced exactly as expected · double-clicking "Confirm & Book" creates one shipment · public tracking.
- **02 Manager:** the first manager created per the README procedure · operator and driver onboarding with a temporary password · duplicate employee ID refused with no half-created account · **email invitation**: the real invite email's link (in the format the README tells you to configure) sets a password and signs the operator in.
- **03 Dispatch & delivery:** operator assigns from the dispatch board · driver walks every status · OTP stored only as a hash · a wrong OTP is refused · the code from the customer's own inbox completes the delivery · the customer sees it delivered with the full notification trail.
- **04 Pricing, access, responsive:** a manager's new pricing rule prices the next booking, and the database accepts it · a deactivated driver is locked out with no redirect loop · the 6th wrong password in a row locks the account, even against the right password · **no page scrolls sideways** at phone, tablet or desktop widths.

## Bugs this suite found (all fixed)

Each of these passed typechecking, lint, unit tests and the database attack battery, and only showed up when real users clicked through the real stack:

1. **Nearly every booking was rejected.** The app priced the unrounded route distance but stored it rounded to 1 decimal, so the database's price re-check disagreed (e.g. AED 31.76 vs 31.80). Fixed by pricing the exact stored 2-decimal distance with exact decimal arithmetic. `database/test/price-consistency.sh` now checks 5,000 random bookings against the database's own function.
2. **Leaving the optional weight empty blocked booking** ("expected number, received NaN").
3. **Five pages scrolled sideways on phones/tablets**, the worst by 433px, and the phone nav squeezed its links into a sliver.
4. **The test proxy could crash on an aborted connection.** Test infrastructure, but found and fixed the same way.

The route-access logic also got a redirect-loop fix for deactivated accounts. That one was found by reading the code; the suite now proves it in the browser.
