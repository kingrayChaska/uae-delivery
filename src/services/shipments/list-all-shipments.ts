import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Shipment, ShipmentStatus } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

// RLS (shipments_select) grants staff unrestricted read on this table —
// that's what makes this "all shipments" rather than "my shipments".
export const listAllShipments = async (statusFilter?: ShipmentStatus): Promise<Shipment[]> => {
  const supabase = await createClient();

  let query = supabase.from('shipments').select(SHIPMENT_SELECT_COLUMNS).order('created_at', { ascending: false });
  if (statusFilter) query = query.eq('status', statusFilter);

  const { data } = await query;
  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
};

export const listUnassignedShipments = async (): Promise<Shipment[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('status', 'confirmed')
    .is('driver_id', null)
    .order('created_at', { ascending: true });

  return ((data ?? []) as ShipmentRow[]).map(mapRowToShipment);
};
