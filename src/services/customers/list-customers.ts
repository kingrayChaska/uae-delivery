import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, pageRange, toPaginated } from '@/lib/pagination';
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
  accountType: AccountType;
  // A merchant's company (their business account), else null.
  companyName: string | null;
  shipmentCount: number;
  totalSpent: number;
};

type StatsRow = { customer_id: string; shipment_count: number; total_paid: number };

type SearchRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  active: boolean;
  account_type: AccountType;
  company_name: string | null;
  total_count: number | string;
};

// One page of customers, optionally narrowed by a search on their name or
// their company's name — matched in the database (search_customers,
// migration 0030: partial, case-insensitive, wildcards escaped), so only
// the page on screen is ever downloaded. Counts and totals come from
// customer_shipment_stats (migration 0021) for just that page. Throws when
// the list can't be read, so the page can say so.
export const listCustomers = async (page: number, query: string | null = null): Promise<Paginated<CustomerSummary>> => {
  const supabase = await createClient();
  const { from } = pageRange(page);

  const { data, error } = await supabase.rpc('search_customers', { p_query: query, p_limit: PAGE_SIZE, p_offset: from });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SearchRow[];
  // total_count rides on every row; an empty page past the end has none.
  const total = rows.length ? Number(rows[0].total_count) : 0;
  if (rows.length === 0) return toPaginated([], total, page);

  const { data: stats, error: statsError } = await supabase
    .from('customer_shipment_stats')
    .select('customer_id, shipment_count, total_paid')
    .in(
      'customer_id',
      rows.map((row) => row.id),
    );
  if (statsError) throw new Error(statsError.message);
  const byCustomer = new Map(((stats ?? []) as StatsRow[]).map((row) => [row.customer_id, row]));

  const items = rows.map((row) => {
    const stat = byCustomer.get(row.id);
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      active: row.active,
      accountType: row.account_type,
      companyName: row.company_name,
      shipmentCount: stat?.shipment_count ?? 0,
      totalSpent: Number(stat?.total_paid ?? 0),
    };
  });

  return toPaginated(items, total, page);
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
  // Null when the shipment activity couldn't be loaded (the page says so).
  shipments: Paginated<Shipment> | null;
};

type DetailProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  active: boolean;
  account_type: AccountType;
  memberships: { business: { company_name: string; active: boolean } | { company_name: string; active: boolean }[] | null }[] | null;
};

// The profile (with a merchant's company), its totals and one page of its
// shipments don't depend on each other, so all three run at once. Every
// read is the operator's own session, so RLS decides what they may see.
export const getCustomerDetail = async (customerId: string, page: number): Promise<CustomerDetail | null> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const [{ data: profile, error: profileError }, { data: stats }, { data: shipmentRows, count, error: shipmentsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, active, account_type, memberships:business_account_members(business:business_accounts(company_name, active))')
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

  if (profileError) throw new Error(profileError.message);
  if (!profile) return null;
  if (shipmentsError) console.error('Customer shipment activity failed', shipmentsError.message);

  const row = profile as unknown as DetailProfileRow;
  const businesses = (row.memberships ?? []).flatMap((m) => (Array.isArray(m.business) ? m.business : m.business ? [m.business] : []));
  const company = businesses.find((b) => b.active) ?? businesses[0] ?? null;

  return {
    customer: {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      active: row.active,
      accountType: row.account_type,
      companyName: company?.company_name ?? null,
      shipmentCount: stats?.shipment_count ?? 0,
      totalSpent: Number(stats?.total_paid ?? 0),
    },
    shipments: shipmentsError ? null : toPaginated(((shipmentRows ?? []) as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page),
  };
};
