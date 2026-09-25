import { describe, expect, it } from 'vitest';

import { mergeDriverLocation } from '@/lib/dispatch/driver-location-reducer';

const baseEvent = {
  driver_id: 'driver-1',
  shipment_id: 'shipment-1',
  lat: 25.2,
  lng: 55.27,
  recorded_at: '2026-01-01T10:00:00.000Z',
};

describe('mergeDriverLocation', () => {
  it('adds a new driver location into empty state', () => {
    const result = mergeDriverLocation({}, baseEvent);
    expect(result['driver-1'].coordinates).toEqual({ lat: 25.2, lng: 55.27 });
  });

  it('updates an existing driver with a newer ping', () => {
    const state = mergeDriverLocation({}, baseEvent);
    const newer = { ...baseEvent, lat: 25.3, recorded_at: '2026-01-01T10:00:30.000Z' };

    const result = mergeDriverLocation(state, newer);
    expect(result['driver-1'].coordinates.lat).toBe(25.3);
  });

  it('ignores a stale/out-of-order ping older than what is already stored', () => {
    const state = mergeDriverLocation({}, baseEvent);
    const stale = { ...baseEvent, lat: 25.9, recorded_at: '2026-01-01T09:59:00.000Z' };

    const result = mergeDriverLocation(state, stale);
    expect(result['driver-1'].coordinates.lat).toBe(25.2);
  });

  it('keeps other drivers untouched when one driver updates', () => {
    const state = mergeDriverLocation({}, baseEvent);
    const other = { ...baseEvent, driver_id: 'driver-2', lat: 26 };

    const result = mergeDriverLocation(state, other);
    expect(Object.keys(result).sort()).toEqual(['driver-1', 'driver-2']);
    expect(result['driver-1'].coordinates.lat).toBe(25.2);
  });
});
