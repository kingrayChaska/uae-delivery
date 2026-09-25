'use client';

import { useEffect } from 'react';

import { recordDriverLocationAction } from '@/lib/driver/actions';

const PING_INTERVAL_MS = 30_000;

// Starts a geolocation watch only while this hook is mounted — i.e. only
// while the driver has this specific shipment's workflow screen open, and
// only for statuses the caller decides count as "actively handling it"
// (see the `enabled` prop passed from ShipmentWorkflow). Stops immediately
// on unmount. This is deliberately NOT a background/global tracker — spec
// section 20 is explicit that off-duty drivers should never be tracked.
export const useDriverLocationTracking = (shipmentId: string, enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const ping = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          recordDriverLocationAction(shipmentId, position.coords.latitude, position.coords.longitude);
        },
        () => {
          // Permission denied or unavailable — fail silently rather than
          // blocking the delivery workflow over a location error.
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
      );
    };

    ping();
    const interval = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [shipmentId, enabled]);
};
