import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { statusesForDriverFilter } from '@/lib/drivers/detail-filters';

import type { Paginated } from '@/lib/pagination';
import type { DriverDetailFilter, StatusCounts } from '@/lib/drivers/detail-filters';
import type { DeliveryType, DriverAvailability, PaymentMethod, PaymentStatus, RecipientPaymentType, ShipmentStatus } from '@/lib/types';

// One driver, for staff (migration 0049). Every count and amount comes from
// the database's own functions — counted and summed there, never here — and
// each one returns nothing unless the caller is staff.

type Range = { from: string | null; to: string | null };

const money = (value: unknown) => Number(value ?? 0);
const moneyOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export type DriverDetailOverview = {
  driver: {
    id: string;
    name: string;
    phone: string;
    active: boolean;
    code: string;
    availability: DriverAvailability;
    vehicle: string | null;
  };
  // Shipments booked in the period (charges), and cash collected in the
  // period (by collection date).
  period: {
    codCollected: number;
    feeCollected: number;
    collectedShipments: number;
    charges: number;
    cashCharges: number;
    codDue: number;
  };
  // Now, whatever the period.
  now: {
    outstanding: number;
    outstandingCod: number;
    outstandingFee: number;
    confirmed: number;
    pending: number;
    expectedCod: number;
    expectedFee: number;
    unverified: number;
  };
};

// null: not a driver, or not visible to the caller. Throws when the
// database can't be read, so the page says so instead of showing zeros.
export const getDriverDetailOverview = async (driverId: string, range: Range): Promise<DriverDetailOverview | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('staff_driver_overview', { p_driver_id: driverId, p_from: range.from, p_to: range.to });
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, Record<string, unknown>>;
  const { driver, period, now } = row;
  return {
    driver: {
      id: String(driver.id),
      name: String(driver.name ?? ''),
      phone: String(driver.phone ?? ''),
      active: driver.active === true,
      code: String(driver.code ?? ''),
      availability: driver.availability as DriverAvailability,
      vehicle: (driver.vehicle as string | null) ?? null,
    },
    period: {
      codCollected: money(period.codCollected),
      feeCollected: money(period.feeCollected),
      collectedShipments: Number(period.collectedShipments ?? 0),
      charges: money(period.charges),
      cashCharges: money(period.cashCharges),
      codDue: money(period.codDue),
    },
    now: {
      outstanding: money(now.outstanding),
      outstandingCod: money(now.outstandingCod),
      outstandingFee: money(now.outstandingFee),
      confirmed: money(now.confirmed),
      pending: money(now.pending),
      expectedCod: money(now.expectedCod),
      expectedFee: money(now.expectedFee),
      unverified: money(now.unverified),
    },
  };
};

// Shipments per stored status, for the same driver, search and period as
// the list — so each filter's count is the number of rows it shows.
export const getDriverShipmentCounts = async (driverId: string, q: string, range: Range): Promise<StatusCounts> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('staff_driver_shipment_counts', {
    p_driver_id: driverId,
    p_query: q || null,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) throw error;
  const counts: StatusCounts = {};
  for (const row of (data ?? []) as { status: ShipmentStatus; shipments: number | string }[]) {
    counts[row.status] = Number(row.shipments);
  }
  return counts;
};

export type DriverShipmentRow = {
  id: string;
  trackingNumber: string;
  status: ShipmentStatus;
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  createdAt: string;
  // Scheduled delivery day (next-day bookings); null when none was set.
  deliveryDate: string | null;
  // When it reached its current, final status; null while it's active.
  completedAt: string | null;
  deliveryType: DeliveryType;
  price: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  recipientPaymentType: RecipientPaymentType;
  codAmount: number;
  // This driver's cash record for it; null = no cash to collect.
  cashStatus: string | null;
  codCollected: number | null;
  feeCollected: number | null;
  cashExpected: number | null;
  collectedAt: string | null;
  unverified: boolean;
};

const PAGE_SIZE = 25;

export const listDriverShipments = async (
  driverId: string,
  page: number,
  state: { q: string; status: DriverDetailFilter },
  range: Range,
): Promise<Paginated<DriverShipmentRow>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page, PAGE_SIZE);
  const { data, count, error } = await supabase
    .rpc(
      'staff_driver_shipments',
      {
        p_driver_id: driverId,
        p_query: state.q || null,
        p_statuses: statusesForDriverFilter(state.status),
        p_from: range.from,
        p_to: range.to,
      },
      { count: 'exact' },
    )
    .range(from, to);
  // A page past the last match (an old link): no rows, so the page can go
  // back to page 1.
  if (error?.code === 'PGRST103') return toPaginated([], 0, page, PAGE_SIZE);
  if (error) throw error;

  const items = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    trackingNumber: String(row.tracking_number),
    status: row.status as ShipmentStatus,
    senderName: String(row.sender_name ?? ''),
    senderPhone: String(row.sender_phone ?? ''),
    recipientName: String(row.recipient_name ?? ''),
    recipientPhone: String(row.recipient_phone ?? ''),
    pickupAddress: String(row.pickup_address ?? ''),
    dropoffAddress: String(row.dropoff_address ?? ''),
    createdAt: String(row.created_at),
    deliveryDate: (row.delivery_date as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    deliveryType: row.delivery_type as DeliveryType,
    price: money(row.price),
    currency: String(row.currency ?? 'AED'),
    paymentMethod: row.payment_method as PaymentMethod,
    paymentStatus: row.payment_status as PaymentStatus,
    recipientPaymentType: row.recipient_payment_type as RecipientPaymentType,
    codAmount: money(row.cod_amount),
    cashStatus: (row.cash_status as string | null) ?? null,
    codCollected: moneyOrNull(row.cod_collected),
    feeCollected: moneyOrNull(row.fee_collected),
    cashExpected: moneyOrNull(row.cash_expected),
    collectedAt: (row.collected_at as string | null) ?? null,
    unverified: row.unverified === true,
  }));

  return toPaginated(items, count ?? 0, page, PAGE_SIZE);
};

export { PAGE_SIZE as DRIVER_SHIPMENTS_PAGE_SIZE };
