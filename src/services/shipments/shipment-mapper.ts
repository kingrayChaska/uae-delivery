import type { Shipment } from '@/lib/types';

// Matches the shipments table columns (database/migrations/0006_shipments.sql).
export type ShipmentRow = {
  id: string;
  tracking_number: string;
  customer_id: string;
  driver_id: string | null;
  status: Shipment['status'];
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_contact_name: string;
  pickup_contact_phone: string;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_contact_name: string;
  dropoff_contact_phone: string;
  distance_km: number;
  duration_minutes: number;
  price: number;
  currency: string;
  payment_method: Shipment['paymentMethod'];
  payment_status: Shipment['paymentStatus'];
  package_type: Shipment['packageType'];
  package_description: string;
  package_quantity: number;
  package_weight_kg: number | null;
  is_fragile: boolean;
  package_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export const mapRowToShipment = (row: ShipmentRow): Shipment => ({
  id: row.id,
  trackingNumber: row.tracking_number,
  customerId: row.customer_id,
  driverId: row.driver_id,
  status: row.status,
  pickup: {
    formattedAddress: row.pickup_address,
    coordinates: { lat: row.pickup_lat, lng: row.pickup_lng },
    contactName: row.pickup_contact_name,
    contactPhone: row.pickup_contact_phone,
  },
  dropoff: {
    formattedAddress: row.dropoff_address,
    coordinates: { lat: row.dropoff_lat, lng: row.dropoff_lng },
    contactName: row.dropoff_contact_name,
    contactPhone: row.dropoff_contact_phone,
  },
  distanceKm: row.distance_km,
  durationMinutes: row.duration_minutes,
  price: row.price,
  currency: row.currency,
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status,
  packageType: row.package_type,
  packageDescription: row.package_description,
  packageQuantity: row.package_quantity,
  packageWeightKg: row.package_weight_kg,
  isFragile: row.is_fragile,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const SHIPMENT_SELECT_COLUMNS =
  'id, tracking_number, customer_id, driver_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone, distance_km, duration_minutes, price, currency, payment_method, payment_status, package_type, package_description, package_quantity, package_weight_kg, is_fragile, package_image_url, created_at, updated_at';
