import 'server-only';

import QRCode from 'qrcode';

import { createClient } from '@/lib/supabase/server';

export type ShipmentLabelData = {
  trackingNumber: string;
  pickupAddress: string;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupBuilding: string | null;
  pickupUnit: string | null;
  pickupFloor: string | null;
  pickupInstructions: string | null;
  dropoffAddress: string;
  dropoffContactName: string;
  dropoffContactPhone: string;
  dropoffBuilding: string | null;
  dropoffUnit: string | null;
  dropoffFloor: string | null;
  dropoffInstructions: string | null;
  deliveryType: 'same_day' | 'next_day';
  deliveryDate: string | null;
  // Null on a merchant's label: the parcel goes to the merchant's own
  // customer, who must not see what the merchant pays ParcelLink. The fee
  // itself is unchanged (shipments.price) and shown everywhere else.
  deliveryFee: number | null;
  currency: string;
  paymentMethod: 'card' | 'cod';
  recipientPaymentType: 'prepaid' | 'postpaid';
  codAmount: number;
  packageType: 'document' | 'parcel' | 'fragile' | 'bulk';
  packageDescription: string;
  packageQuantity: number;
  packageWeightKg: number | null;
  packageLengthCm: number | null;
  packageWidthCm: number | null;
  packageHeightCm: number | null;
  isFragile: boolean;
  qrSvg: string;
};

// get_shipment_qr_token (migration 0017) does the authorization check —
// customer, assigned driver, or staff. Everything else here is ordinary
// shipment data already covered by the standard shipments_select policy.
//
// A merchant shipment is one booked by a merchant account or under a
// business account. The account type is embedded from the booking
// customer's profile (readable by that customer and by staff);
// business_account_id covers callers who can't read the profile.
type LabelCustomer = { account_type: string } | { account_type: string }[] | null;

const isMerchantShipment = (businessAccountId: string | null, customer: LabelCustomer) => {
  const profile = Array.isArray(customer) ? customer[0] : customer;
  return businessAccountId !== null || profile?.account_type === 'merchant';
};

export const getShipmentLabelData = async (shipmentId: string): Promise<ShipmentLabelData | null> => {
  const supabase = await createClient();

  const [{ data: shipment }, { data: token, error: tokenError }] = await Promise.all([
    supabase
      .from('shipments')
      .select('tracking_number, pickup_address, pickup_contact_name, pickup_contact_phone, pickup_building, pickup_unit, pickup_floor, pickup_instructions, dropoff_address, dropoff_contact_name, dropoff_contact_phone, dropoff_building, dropoff_unit, dropoff_floor, dropoff_instructions, delivery_type, delivery_date, price, currency, business_account_id, customer:profiles!shipments_customer_id_fkey(account_type), payment_method, recipient_payment_type, cod_amount, package_type, package_description, package_quantity, package_weight_kg, package_length_cm, package_width_cm, package_height_cm, is_fragile')
      .eq('id', shipmentId)
      .maybeSingle(),
    supabase.rpc('get_shipment_qr_token', { p_shipment_id: shipmentId }),
  ]);

  if (!shipment || tokenError || !token) return null;

  const qrSvg = await QRCode.toString(token, { type: 'svg', margin: 1, width: 160 });

  return {
    trackingNumber: shipment.tracking_number,
    pickupAddress: shipment.pickup_address,
    pickupContactName: shipment.pickup_contact_name,
    pickupContactPhone: shipment.pickup_contact_phone,
    pickupBuilding: shipment.pickup_building,
    pickupUnit: shipment.pickup_unit,
    pickupFloor: shipment.pickup_floor,
    pickupInstructions: shipment.pickup_instructions,
    dropoffAddress: shipment.dropoff_address,
    dropoffContactName: shipment.dropoff_contact_name,
    dropoffContactPhone: shipment.dropoff_contact_phone,
    dropoffBuilding: shipment.dropoff_building,
    dropoffUnit: shipment.dropoff_unit,
    dropoffFloor: shipment.dropoff_floor,
    dropoffInstructions: shipment.dropoff_instructions,
    deliveryType: shipment.delivery_type,
    deliveryDate: shipment.delivery_date,
    deliveryFee: isMerchantShipment(shipment.business_account_id, shipment.customer as LabelCustomer) ? null : Number(shipment.price),
    currency: shipment.currency,
    paymentMethod: shipment.payment_method,
    recipientPaymentType: shipment.recipient_payment_type,
    codAmount: Number(shipment.cod_amount),
    packageType: shipment.package_type,
    packageDescription: shipment.package_description,
    packageQuantity: shipment.package_quantity,
    packageWeightKg: shipment.package_weight_kg === null ? null : Number(shipment.package_weight_kg),
    packageLengthCm: shipment.package_length_cm === null ? null : Number(shipment.package_length_cm),
    packageWidthCm: shipment.package_width_cm === null ? null : Number(shipment.package_width_cm),
    packageHeightCm: shipment.package_height_cm === null ? null : Number(shipment.package_height_cm),
    isFragile: shipment.is_fragile,
    qrSvg,
  };
};
