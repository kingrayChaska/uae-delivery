import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { ShipmentStatus } from '@/lib/types';

export type PublicTrackingResult = {
  trackingNumber: string;
  status: ShipmentStatus;
  createdAt: string;
  distanceKm: number;
  estimatedDurationMinutes: number;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationUpdatedAt: string | null;
};

export type TrackingHistoryEntry = {
  status: ShipmentStatus;
  createdAt: string;
};

// Calls the SECURITY DEFINER functions from database/migrations/0011 —
// these return only PII-free fields, so this is safe to call for an
// unauthenticated visitor (the anon key alone is enough; no session
// required). Returns null for an unknown tracking number rather than
// throwing, since "not found" is an expected, ordinary outcome here.
export const getShipmentTracking = async (
  trackingNumber: string,
): Promise<{ tracking: PublicTrackingResult; history: TrackingHistoryEntry[] } | null> => {
  const supabase = await createClient();

  const [{ data: tracking, error: trackingError }, { data: history }] = await Promise.all([
    supabase.rpc('get_shipment_tracking', { p_tracking_number: trackingNumber }).single(),
    supabase.rpc('get_shipment_tracking_history', { p_tracking_number: trackingNumber }),
  ]);

  const trackingRow = tracking as {
    tracking_number: string;
    status: ShipmentStatus;
    created_at: string;
    distance_km: number;
    estimated_duration_minutes: number;
    driver_lat: number | null;
    driver_lng: number | null;
    driver_location_updated_at: string | null;
  } | null;

  const historyRows = (history ?? []) as { status: ShipmentStatus; created_at: string }[];

  if (trackingError || !trackingRow || !trackingRow.tracking_number) return null;

  return {
    tracking: {
      trackingNumber: trackingRow.tracking_number,
      status: trackingRow.status,
      createdAt: trackingRow.created_at,
      distanceKm: trackingRow.distance_km,
      estimatedDurationMinutes: trackingRow.estimated_duration_minutes,
      driverLat: trackingRow.driver_lat,
      driverLng: trackingRow.driver_lng,
      driverLocationUpdatedAt: trackingRow.driver_location_updated_at,
    },
    history: historyRows.map((entry) => ({
      status: entry.status,
      createdAt: entry.created_at,
    })),
  };
};
