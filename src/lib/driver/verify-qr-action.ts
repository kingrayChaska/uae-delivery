'use server';

import { requireRole } from '@/lib/auth/guards';
import { isUuid } from '@/lib/security/validate';
import { createClient } from '@/lib/supabase/server';

// Read-only — verify_shipment_qr (migration 0017) makes no state change,
// so a wrong scan just shows "doesn't match" without needing to distinguish
// "not authorized" from "wrong code" in the UI (both look the same to the driver).
export const verifyShipmentQrAction = async (shipmentId: string, token: string): Promise<boolean> => {
  if (!isUuid(shipmentId)) return false;
  await requireRole('driver');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('verify_shipment_qr', { p_shipment_id: shipmentId, p_token: token });
  return !error && data === true;
};
