// pickup_date is a plain calendar date (no time/zone), shown as a
// weekday + date in the reader's language. Only the date parts are used, so
// it can't shift a day across time zones.
import { INTL_LOCALES } from '@/i18n/config';

import type { Locale } from '@/i18n/config';

export const formatPickupDate = (date: string, locale: Locale = 'en') =>
  new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

// Bookings of several shipments are stored as "Booking of 3 shipments"
// (services/shipments/create-booking.ts); returns the count, or null for a
// name someone typed.
export const bookingNameCount = (name: string) => {
  const match = name.match(/^Booking of (\d+) shipments$/);
  return match ? Number(match[1]) : null;
};
