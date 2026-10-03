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
  pickup_building: string | null;
  pickup_unit: string | null;
  pickup_floor: string | null;
  pickup_instructions: string | null;
  pickup_place: { source?: string } | null;
  dropoff_building: string | null;
  dropoff_unit: string | null;
  dropoff_floor: string | null;
  dropoff_instructions: string | null;
  dropoff_place: { source?: string } | null;
  distance_km: number;
  duration_minutes: number;
  price: number;
  currency: string;
  payment_method: Shipment['paymentMethod'];
  payment_status: Shipment['paymentStatus'];
  delivery_type: Shipment['deliveryType'];
  recipient_payment_type: Shipment['recipientPaymentType'];
  cod_amount: number | string;
  product_value: number | string | null;
  base_charge: number | string | null;
  distance_charge: number | string | null;
  weight_charge: number | string | null;
  cod_charge: number | string | null;
  business_account_id: string | null;
  batch_id: string | null;
  delivery_date: string | null;
  // Embedded shipment_batches row; null when there's none or RLS hides it
  // (drivers don't read batches).
  batch?: { reference: string } | { reference: string }[] | null;
  package_type: Shipment['packageType'];
  package_description: string;
  package_quantity: number;
  package_weight_kg: number | null;
  package_length_cm: number | string | null;
  package_width_cm: number | string | null;
  package_height_cm: number | string | null;
  is_fragile: boolean;
  package_image_url: string | null;
  created_at: string;
  updated_at: string;
};

// PostgREST returns numeric columns as numbers, but be strict about it.
const num = (value: number | string) => Number(value);
const numOrNull = (value: number | string | null) => (value === null ? null : Number(value));

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
    building: row.pickup_building,
    unit: row.pickup_unit,
    floor: row.pickup_floor,
    instructions: row.pickup_instructions,
    locationSource: row.pickup_place?.source ?? null,
  },
  dropoff: {
    formattedAddress: row.dropoff_address,
    coordinates: { lat: row.dropoff_lat, lng: row.dropoff_lng },
    contactName: row.dropoff_contact_name,
    contactPhone: row.dropoff_contact_phone,
    building: row.dropoff_building,
    unit: row.dropoff_unit,
    floor: row.dropoff_floor,
    instructions: row.dropoff_instructions,
    locationSource: row.dropoff_place?.source ?? null,
  },
  distanceKm: row.distance_km,
  durationMinutes: row.duration_minutes,
  price: row.price,
  currency: row.currency,
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status,
  deliveryType: row.delivery_type,
  recipientPaymentType: row.recipient_payment_type,
  codAmount: num(row.cod_amount),
  productValue: numOrNull(row.product_value),
  baseCharge: numOrNull(row.base_charge),
  distanceCharge: numOrNull(row.distance_charge),
  weightCharge: numOrNull(row.weight_charge),
  codCharge: numOrNull(row.cod_charge),
  businessAccountId: row.business_account_id,
  batchId: row.batch_id,
  batchReference: (Array.isArray(row.batch) ? row.batch[0]?.reference : row.batch?.reference) ?? null,
  deliveryDate: row.delivery_date ?? null,
  packageType: row.package_type,
  packageDescription: row.package_description,
  packageQuantity: row.package_quantity,
  packageWeightKg: row.package_weight_kg,
  packageLengthCm: numOrNull(row.package_length_cm),
  packageWidthCm: numOrNull(row.package_width_cm),
  packageHeightCm: numOrNull(row.package_height_cm),
  isFragile: row.is_fragile,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const SHIPMENT_SELECT_COLUMNS =
  'id, tracking_number, customer_id, driver_id, status, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone, pickup_building, pickup_unit, pickup_floor, pickup_instructions, pickup_place, dropoff_building, dropoff_unit, dropoff_floor, dropoff_instructions, dropoff_place, distance_km, duration_minutes, price, currency, payment_method, payment_status, delivery_type, recipient_payment_type, cod_amount, product_value, base_charge, distance_charge, weight_charge, cod_charge, business_account_id, batch_id, delivery_date, batch:shipment_batches(reference), package_type, package_description, package_quantity, package_weight_kg, package_length_cm, package_width_cm, package_height_cm, is_fragile, package_image_url, created_at, updated_at';
