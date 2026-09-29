import { INTL_LOCALES } from '@/i18n/config';

import type { Locale } from '@/i18n/config';

// Locale-aware display formatting. Display only — stored values, prices and
// calculations are never touched. Money always keeps its ISO code
// ("AED 25.00"), in both languages, as on receipts.

const TIME_ZONE = 'Asia/Dubai';

type DateInput = string | number | Date;

export const createFormatters = (locale: Locale) => {
  const intl = INTL_LOCALES[locale];
  const number = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(intl, options).format(value);
  const fixed = (value: number, digits: number) =>
    number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const unit = (value: number, unitName: string, digits?: number) =>
    number(value, {
      style: 'unit',
      unit: unitName,
      ...(digits === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    });
  const dateTimeFormat = (options: Intl.DateTimeFormatOptions) => (value: DateInput) =>
    new Intl.DateTimeFormat(intl, { timeZone: TIME_ZONE, ...options }).format(new Date(value));

  return {
    locale,
    number,
    // "AED 25.00"
    money: (amount: number, currency = 'AED') => `${currency} ${fixed(amount, 2)}`,
    // "18.4 km" / "18.4 كم"
    km: (value: number, digits = 1) => unit(value, 'kilometer', digits),
    kg: (value: number, digits?: number) => unit(value, 'kilogram', digits),
    cm: (value: number) => unit(value, 'centimeter'),
    // "5 min" / "1 hr, 20 min" style durations, from minutes.
    duration: (minutes: number) => {
      const rounded = Math.max(0, Math.round(minutes));
      const hours = Math.floor(rounded / 60);
      const rest = rounded % 60;
      const parts = [
        hours ? unit(hours, 'hour') : null,
        rest || !hours ? number(rest, { style: 'unit', unit: 'minute', unitDisplay: 'short' }) : null,
      ].filter(Boolean);
      return parts.join(locale === 'ar' ? ' و' : ' ');
    },
    // "29 Sep 2026, 5:59 AM" / "29 سبتمبر 2026، 5:59 ص"
    dateTime: dateTimeFormat({ day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    dateTimeLong: dateTimeFormat({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    date: dateTimeFormat({ day: 'numeric', month: 'short', year: 'numeric' }),
    time: dateTimeFormat({ hour: 'numeric', minute: '2-digit' }),
    // For a calendar date stored as "YYYY-MM-DD" (no time, no zone).
    calendarDate: (isoDate: string) =>
      new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${isoDate}T00:00:00Z`),
      ),
  };
};

export type Formatters = ReturnType<typeof createFormatters>;
