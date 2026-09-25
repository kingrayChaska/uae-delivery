import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Shipment, ShipmentStatus } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

export type ShipmentHistoryEntry = { status: ShipmentStatus; createdAt: string };

export type ShipmentDetail = {
  shipment: Shipment;
  history: ShipmentHistoryEntry[];
  packageImageUrl: string | null;
};

// Ownership is enforced by RLS (shipments_select / shipment_status_history_select)
// — this returns null for a shipment the caller can't see, exactly the same
// as if it didn't exist, rather than distinguishing "not found" from
// "not yours" (which would leak which IDs are valid).
export const getShipmentDetail = async (shipmentId: string): Promise<ShipmentDetail | null> => {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('id', shipmentId)
    .maybeSingle();

  if (!row) return null;

  const shipment = mapRowToShipment(row as ShipmentRow);

  const { data: historyRows } = await supabase
    .from('shipment_status_history')
    .select('status, created_at')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });

  let packageImageUrl: string | null = null;
  const packageImagePath = (row as { package_image_url: string | null }).package_image_url;
  if (packageImagePath) {
    const { data: signed } = await supabase.storage
      .from('package-images')
      .createSignedUrl(packageImagePath, 3600);
    packageImageUrl = signed?.signedUrl ?? null;
  }

  return {
    shipment,
    history: (historyRows ?? []).map((entry) => ({
      status: entry.status as ShipmentStatus,
      createdAt: entry.created_at as string,
    })),
    packageImageUrl,
  };
};
