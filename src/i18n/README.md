# Translations (English / Arabic)

ParcelLink uses [next-intl](https://next-intl.dev) without i18n routing. All
interface text lives in `messages/{en,ar}/<namespace>.json`; nothing is
machine-translated at runtime.

## How the language is chosen

- **One source of truth:** the `NEXT_LOCALE` cookie (1 year). No database column.
- `proxy.ts` resolves the request locale in this order: `/ar` URL prefix → cookie →
  `Accept-Language` → `en`. It passes it on in the `x-parcellink-locale` header,
  which `request.ts` reads.
- Public pages (`LOCALIZED_PATHS` in `config.ts`) have Arabic URLs under `/ar/…`,
  rewritten to the same page. English keeps the unprefixed URLs; `/en/…` redirects
  to them. Dashboards have no prefix — they follow the cookie.
- `LanguageSwitcher` sets the cookie, then reloads the page (moving to the other
  language's URL on public pages). A full load, so the router cache, client state
  and the Google Maps script never keep the old language. `LocaleSync` (root
  layout) reloads too if a client-side navigation lands in the other language.
- Only real page loads of `/ar/…` save the cookie; prefetches and RSC fetches don't.
- The language never affects authorization: role checks don't read it.

## Adding text

1. Add the key to **both** `messages/en/<ns>.json` and `messages/ar/<ns>.json`.
   Keys are semantic (`booking.errors.createOneFailed`), not English sentences.
2. Use ICU syntax for values and plurals: `"{count, plural, one {# parcel} other {# parcels}}"`.
   Arabic needs the `zero`/`two`/`few`/`many` branches too.
3. In components: `useTranslations('ns')` (client or server) or
   `getTranslations('ns')` (async server). Namespaces used by public pages must be
   in `PUBLIC_CLIENT_NAMESPACES` (`messages.ts`) to reach client components there;
   dashboards get every namespace.
4. `npx vitest run src/i18n` checks that both languages have the same keys and
   placeholders, and that every key literal in `src` exists.

## Messages from server code

Server actions, schemas and `lib/` return **keys**, not sentences, so the caller
renders them in the viewer's language:

- `msg('booking.errors.distance', { km: 62 })` → `booking.errors.distance|{"km":62}`
- `ref('serviceAreas.emirates.dubai')` → a value that is itself translated.
- Render with `useMessage()` (client/server components), `getMessageTranslator()`
  (async server) or `<FieldError>`. Text that isn't a key is shown as written.

Database errors (`safeErrorMessage`) and Supabase Auth errors (`lib/auth/errors.ts`)
are mapped to keys. Notifications are stored in English by database triggers and
translated on display by `lib/notifications/localize.ts`. Merchant decision
emails are sent in both languages, as the recipient's language isn't stored.

## Formatting

Use `useFormat()` / `getFormat()` (`format.ts`): money stays `AED 25.00` in both
languages; dates use the Asia/Dubai time zone; digits are Western Arabic
(`ar-AE-u-nu-latn`) so tracking numbers, prices and dates read the same everywhere.

## Right-to-left

`<html dir="rtl">` for Arabic. Use logical Tailwind classes (`ms-`/`me-`,
`ps-`/`pe-`, `start-`/`end-`, `text-start`, `border-s`), `rtl:rotate-180` on
directional icons and `rtl:` variants for slide animations. Keep technical values
(tracking IDs, phone numbers, emails, URLs, coordinates) in `dir="ltr"`.
