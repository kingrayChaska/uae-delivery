import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Paginated } from '@/lib/pagination';
import type { AccountType, Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

export type CustomerSummary = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  active: boolean;
  shipmentCount: number;
  totalSpent: number;
};

type StatsRow = { customer_id: string; shipment_count: number; total_paid: number };

// Counts and totals come from customer_shipment_stats (migration 0021),
// computed in the database for just this page of customers — not by
// downloading every shipment of every customer.
export const listCustomers = async (page: number): Promise<Paginated<CustomerSummary>> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const { data: profiles, count } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, active', { count: 'exact' })
    .eq('role', 'customer')
    .order('full_name', { ascending: true })
    .range(from, to);

  if (!profiles || profiles.length === 0) return toPaginated([], count ?? 0, page);

  const { data: stats } = await supabase
    .from('customer_shipment_stats')
    .select('customer_id, shipment_count, total_paid')
    .in(
      'customer_id',
      profiles.map((p) => p.id),
    );
  const byCustomer = new Map(((stats ?? []) as StatsRow[]).map((row) => [row.customer_id, row]));

  const items = profiles.map((profile) => {
    const row = byCustomer.get(profile.id);
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      active: profile.active,
      shipmentCount: row?.shipment_count ?? 0,
      totalSpent: Number(row?.total_paid ?? 0),
    };
  });

  return toPaginated(items, count ?? 0, page);
};

// Just what the staff booking wizard's customer picker needs — no stats.
export const listCustomerOptions = async (): Promise<
  { id: string; fullName: string; email: string; accountType: AccountType }[]
> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, account_type')
    .eq('role', 'customer')
    .eq('active', true)
    .order('full_name', { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    accountType: row.account_type as AccountType,
  }));
};

export type CustomerDetail = {
  customer: CustomerSummary;
  shipments: Paginated<Shipment>;
};

// The profile, its totals and one page of shipments don't depend on each
// other, so all three run at once.
export const getCustomerDetail = async (customerId: string, page: number): Promise<CustomerDetail | null> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const [{ data: profile }, { data: stats }, { data: shipmentRows, count }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, active')
      .eq('id', customerId)
      .eq('role', 'customer')
      .maybeSingle(),
    supabase
      .from('customer_shipment_stats')
      .select('shipment_count, total_paid')
      .eq('customer_id', customerId)
      .maybeSingle(),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS, { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range(from, to),
  ]);

  if (!profile) return null;

  return {
    customer: {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      active: profile.active,
      shipmentCount: stats?.shipment_count ?? 0,
      totalSpent: Number(stats?.total_paid ?? 0),
    },
    shipments: toPaginated(((shipmentRows ?? []) as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page),
  };
};
