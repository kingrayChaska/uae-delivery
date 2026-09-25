import { describe, expect, it } from 'vitest';

import { haversineDistanceKm } from '@/lib/maps/haversine';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceKm({ lat: 25.2048, lng: 55.2708 }, { lat: 25.2048, lng: 55.2708 })).toBe(0);
  });

  it('is symmetric', () => {
    const a = { lat: 25.0772, lng: 55.1409 };
    const b = { lat: 25.2048, lng: 55.2708 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 10);
  });

  it('approximates 1 degree of latitude as ~111km', () => {
    const distance = haversineDistanceKm({ lat: 25, lng: 55 }, { lat: 26, lng: 55 });
    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(112);
  });

  it('matches the known approximate distance between Dubai Marina and Downtown Dubai', () => {
    const marina = { lat: 25.0772, lng: 55.1409 };
    const downtown = { lat: 25.1972, lng: 55.2744 };
    const distance = haversineDistanceKm(marina, downtown);
    // Straight-line distance is roughly 17-18km — well under the ~20+km
    // road route, which is the whole point of it being display-only.
    expect(distance).toBeGreaterThan(15);
    expect(distance).toBeLessThan(20);
  });
});
