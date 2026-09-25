import { describe, expect, it } from 'vitest';

import { BOOKING_ERRORS, isInsideUae, validateBookingLocations, validateRoute } from '@/lib/shipment/booking-guards';

const MARINA = { lat: 25.0772, lng: 55.1409 };
const DOWNTOWN = { lat: 25.1972, lng: 55.2744 };
const ABU_DHABI = { lat: 24.4539, lng: 54.3773 };
const RAK = { lat: 25.7895, lng: 55.9432 };
const MUSCAT = { lat: 23.588, lng: 58.3829 };
const LONDON = { lat: 51.5072, lng: -0.1276 };

describe('validateBookingLocations (spec section 45: booking tests)', () => {
  it('accepts an ordinary Dubai trip', () => {
    expect(validateBookingLocations(MARINA, DOWNTOWN)).toBeNull();
  });

  it('accepts long intra-UAE trips (Abu Dhabi -> Ras Al Khaimah)', () => {
    expect(validateBookingLocations(ABU_DHABI, RAK)).toBeNull();
  });

  it('rejects the same pickup and destination', () => {
    expect(validateBookingLocations(MARINA, MARINA)).toBe(BOOKING_ERRORS.sameLocation);
  });

  it('rejects points a few metres apart (the same building)', () => {
    expect(validateBookingLocations(MARINA, { lat: 25.0773, lng: 55.141 })).toBe(BOOKING_ERRORS.sameLocation);
  });

  it('rejects addresses outside the UAE, in either position', () => {
    expect(validateBookingLocations(MUSCAT, DOWNTOWN)).toBe(BOOKING_ERRORS.outsideUae);
    expect(validateBookingLocations(MARINA, LONDON)).toBe(BOOKING_ERRORS.outsideUae);
  });

  it('rejects non-finite coordinates', () => {
    expect(isInsideUae({ lat: Number.NaN, lng: 55 })).toBe(false);
    expect(validateBookingLocations({ lat: Number.POSITIVE_INFINITY, lng: 55 }, DOWNTOWN)).toBe(BOOKING_ERRORS.outsideUae);
  });
});

describe('validateRoute', () => {
  it('accepts real routes including decimal distances', () => {
    expect(validateRoute({ distanceKm: 14.6, durationMinutes: 22.4 })).toBeNull();
  });

  it('refuses zero-length and broken routes', () => {
    expect(validateRoute({ distanceKm: 0, durationMinutes: 0 })).toBe(BOOKING_ERRORS.sameLocation);
    expect(validateRoute({ distanceKm: Number.NaN, durationMinutes: 5 })).toBe(BOOKING_ERRORS.routeFailed);
  });
});
