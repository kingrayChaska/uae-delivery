import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { CancelBlock, PriceEditBlock, StaffActionContext } from '@/lib/shipment/staff-actions';
import type { ShipmentStatus } from '@/lib/types';

// What operations may do to this shipment right now, and the money already
// attached to it — from shipment_staff_actions() (migration 0046), the same
// rules the price change and cancellation enforce. Null for non-staff.
export const getStaffActionContext = async (shipmentId: string): Promise<StaffActionContext | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('shipment_staff_actions', { p_shipment_id: shipmentId });
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    priceEditBlock: (row.priceEditBlock as PriceEditBlock | null) ?? null,
    cancelBlock: (row.cancelBlock as CancelBlock | null) ?? null,
    serviceCharge: Number(row.serviceCharge ?? 0),
    feePaid: row.feePaid === true,
    cashCollected: Number(row.cashCollected ?? 0),
    cashExpected: Number(row.cashExpected ?? 0),
    invoiceNumber: (row.invoiceNumber as string | null) ?? null,
  };
};

export type StaffShipmentEvent =
  | {
      kind: 'price';
      createdAt: string;
      actorName: string | null;
      previousPrice: number;
      newPrice: number;
      reason: string;
      voidedInvoices: string[];
    }
  | {
      kind: 'cancel';
      createdAt: string;
      actorName: string | null;
      previousStatus: ShipmentStatus;
      reason: string;
      refundRequired: boolean;
      cashCollected: number;
    }
  | {
      kind: 'correction';
      createdAt: string;
      actorName: string | null;
      previousStatus: ShipmentStatus;
      newStatus: ShipmentStatus;
      reason: string;
      previousDriverId: string | null;
      newDriverId: string | null;
    };

// Operational changes by staff, newest first, from the audit log.
export const listStaffShipmentEvents = async (shipmentId: string): Promise<StaffShipmentEvent[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('audit_logs')
    .select('action, old_value, new_value, created_at, profiles(full_name)')
    .eq('entity_type', 'shipment')
    .eq('entity_id', shipmentId)
    .in('action', ['shipment.price_adjusted', 'shipment.cancelled_by_staff', 'shipment.status_correction'])
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((row) => {
    const before = (row.old_value ?? {}) as Record<string, unknown>;
    const after = (row.new_value ?? {}) as Record<string, unknown>;
    const actor = row.profiles as unknown as { full_name: string } | null;
    const base = { createdAt: row.created_at as string, actorName: actor?.full_name ?? null, reason: String(after.reason ?? '') };
    if (row.action === 'shipment.price_adjusted') {
      return {
        ...base,
        kind: 'price' as const,
        previousPrice: Number(before.price),
        newPrice: Number(after.price),
        voidedInvoices: Array.isArray(after.voidedInvoices) ? (after.voidedInvoices as string[]) : [],
      };
    }
    if (row.action === 'shipment.status_correction') {
      return {
        ...base,
        kind: 'correction' as const,
        previousStatus: before.status as ShipmentStatus,
        newStatus: after.status as ShipmentStatus,
        previousDriverId: typeof before.driverId === 'string' ? before.driverId : null,
        newDriverId: typeof after.driverId === 'string' ? after.driverId : null,
      };
    }
    return {
      ...base,
      kind: 'cancel' as const,
      previousStatus: before.status as ShipmentStatus,
      refundRequired: after.refundRequired === true,
      cashCollected: Number(after.cashCollected ?? 0),
    };
  });
};
