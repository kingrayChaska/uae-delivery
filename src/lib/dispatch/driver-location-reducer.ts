import type { Coordinates } from '@/lib/types';

export type DriverLocationState = {
  driverId: string;
  coordinates: Coordinates;
  recordedAt: string;
};

export type DriverLocationEvent = {
  driver_id: string;
  shipment_id: string | null;
  lat: number;
  lng: number;
  recorded_at: string;
};

// Keeps only the latest ping per driver, and ignores an event that's
// older than what we already have (realtime delivery order isn't
// strictly guaranteed under reconnects).
export const mergeDriverLocation = (
  state: Record<string, DriverLocationState>,
  event: DriverLocationEvent,
): Record<string, DriverLocationState> => {
  const existing = state[event.driver_id];
  if (existing && new Date(existing.recordedAt) >= new Date(event.recorded_at)) {
    return state;
  }

  return {
    ...state,
    [event.driver_id]: {
      driverId: event.driver_id,
      coordinates: { lat: event.lat, lng: event.lng },
      recordedAt: event.recorded_at,
    },
  };
};
