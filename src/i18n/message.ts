// Translatable messages made outside React: validation schemas, server
// actions, pricing and booking rules. They travel as plain strings — through
// zod issues, react-hook-form errors and server-action results — and are
// translated where they're shown (FieldError, alerts), in the reader's
// language:
//
//   msg('errors.rateLimited')                        → "errors.rateLimited"
//   msg('booking.errors.distanceLimit', { km: 52 })  → 'booking.errors.distanceLimit|{"km":52}'
//
// A value written as ref('some.key') ("@some.key") is itself translated
// first (an emirate or a status inside a sentence). A list of values
// becomes "A, B and C" in the reader's language.

export type MessageValue = string | number | string[];
export type MessageValues = Record<string, MessageValue>;

const SEPARATOR = '|';
const KEY_PATTERN = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]+)+$/;

export const msg = (key: string, values?: MessageValues) =>
  values && Object.keys(values).length > 0 ? `${key}${SEPARATOR}${JSON.stringify(values)}` : key;

// A reference to another message, for use as a value: ref('serviceAreas.emirates.dubai').
export const ref = (key: string) => `@${key}`;

export const parseMsg = (text: string): { key: string; values: MessageValues } | null => {
  const at = text.indexOf(SEPARATOR);
  const key = at === -1 ? text : text.slice(0, at);
  if (!KEY_PATTERN.test(key)) return null;
  if (at === -1) return { key, values: {} };
  try {
    const values = JSON.parse(text.slice(at + 1)) as unknown;
    return values && typeof values === 'object' && !Array.isArray(values) ? { key, values: values as MessageValues } : null;
  } catch {
    return null;
  }
};

// The minimum of next-intl's translator this needs (server or client).
export type Translator = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

// Translates a message made by msg(); anything else (text from Supabase, an
// already-translated string) is shown as it is. intlLocale formats lists.
export const translateMessage = (t: Translator, text: string | null | undefined, intlLocale = 'en'): string => {
  if (!text) return '';
  const parsed = parseMsg(text);
  if (!parsed || !t.has(parsed.key)) return text;
  const resolve = (value: string | number): string | number => {
    if (typeof value !== 'string') return value;
    if (value.startsWith('@')) return t.has(value.slice(1)) ? t(value.slice(1)) : value;
    // A whole message nested as a value ("Shipment 2: {message}").
    const nested = parseMsg(value);
    return nested && t.has(nested.key) ? translateMessage(t, value, intlLocale) : value;
  };
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(parsed.values)) {
    values[name] = Array.isArray(value)
      ? new Intl.ListFormat(intlLocale, { type: 'conjunction' }).format(value.map((item) => String(resolve(item))))
      : resolve(value);
  }
  return t(parsed.key, values);
};
