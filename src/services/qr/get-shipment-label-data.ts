import 'server-only';

import QRCode from 'qrcode';

import { createClient } from '@/lib/supabase/server';

export type ShipmentLabelData = {
  trackingNumber: string;
  pickupAddress: string;
  dropoffAddress: string;
  dropoffContactName: string;
  dropoffContactPhone: string;
  packageDescription: string;
  isFragile: boolean;
  qrSvg: string;
};

// get_shipment_qr_token (migration 0017) does the authorization check —
// customer, assigned driver, or staff. Everything else here is ordinary
// shipment data already covered by the standard shipments_select policy.
export const getShipmentLabelData = async (shipmentId: string): Promise<ShipmentLabelData | null> => {
  const supabase = await createClient();

  const [{ data: shipment }, { data: token, error: tokenError }] = await Promise.all([
    supabase
      .from('shipments')
      .select('tracking_number, pickup_address, dropoff_address, dropoff_contact_name, dropoff_contact_phone, package_description, is_fragile')
      .eq('id', shipmentId)
      .maybeSingle(),
    supabase.rpc('get_shipment_qr_token', { p_shipment_id: shipmentId }),
  ]);

  if (!shipment || tokenError || !token) return null;

  const qrSvg = await QRCode.toString(token, { type: 'svg', margin: 1, width: 160 });

  return {
    trackingNumber: shipment.tracking_number,
    pickupAddress: shipment.pickup_address,
    dropoffAddress: shipment.dropoff_address,
    dropoffContactName: shipment.dropoff_contact_name,
    dropoffContactPhone: shipment.dropoff_contact_phone,
    packageDescription: shipment.package_description,
    isFragile: shipment.is_fragile,
    qrSvg,
  };
};
