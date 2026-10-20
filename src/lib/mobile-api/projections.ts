import { cashCollection } from '@/lib/shipment/collection';

import type { Shipment } from '@/lib/types';

// What a driver's screens need from a shipment: where, who, what, and the
// cash to handle — computed here by the website's own rules
// (lib/shipment/collection.ts), never by the app. Pricing internals, the
// customer's account id, product value and payment state are left out.
export const toDriverShipment = (shipment: Shipment) => ({
  id: shipment.id,
  trackingNumber: shipment.trackingNumber,
  status: shipment.status,
  pickup: shipment.pickup,
  dropoff: shipment.dropoff,
  distanceKm: shipment.distanceKm,
  durationMinutes: shipment.durationMinutes,
  currency: shipment.currency,
  packageType: shipment.packageType,
  packageDescription: shipment.packageDescription,
  packageQuantity: shipment.packageQuantity,
  packageWeightKg: shipment.packageWeightKg,
  isFragile: shipment.isFragile,
  deliveryDate: shipment.deliveryDate,
  cancelledReason: shipment.cancelledReason,
  deliveryFailedReason: shipment.deliveryFailedReason,
  createdAt: shipment.createdAt,
  updatedAt: shipment.updatedAt,
  collection: cashCollection(shipment),
});

export type DriverShipment = ReturnType<typeof toDriverShipment>;
