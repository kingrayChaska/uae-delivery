import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { pageRange, toPaginated } from '@/lib/pagination';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Paginated } from '@/lib/pagination';
import type { Shipment } from '@/lib/types';
import type { ShipmentRow } from '@/services/shipments/shipment-mapper';

export type BusinessAccountSummary = {
  id: string;
  companyName: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  active: boolean;
  memberCount: number;
  shipmentCount: number;
};

// Shipment counts come from business_shipment_stats (migration 0021)
// rather than downloading every business shipment; all three reads are
// independent, so they run at once.
export const listBusinessAccounts = async (): Promise<BusinessAccountSummary[]> => {
  const supabase = await createClient();

  const [{ data: accounts }, { data: members }, { data: stats }] = await Promise.all([
    supabase
      .from('business_accounts')
      .select('id, company_name, contact_person, contact_email, contact_phone, active')
      .order('company_name'),
    supabase.from('business_account_members').select('business_account_id'),
    supabase.from('business_shipment_stats').select('business_account_id, shipment_count'),
  ]);
  if (!accounts || accounts.length === 0) return [];

  const memberCounts = new Map<string, number>();
  for (const member of members ?? []) {
    memberCounts.set(member.business_account_id, (memberCounts.get(member.business_account_id) ?? 0) + 1);
  }
  const shipmentCounts = new Map((stats ?? []).map((row) => [row.business_account_id, row.shipment_count as number]));

  return accounts.map((account) => ({
    id: account.id,
    companyName: account.company_name,
    contactPerson: account.contact_person,
    contactEmail: account.contact_email,
    contactPhone: account.contact_phone,
    active: account.active,
    memberCount: memberCounts.get(account.id) ?? 0,
    shipmentCount: shipmentCounts.get(account.id) ?? 0,
  }));
};

export type BusinessAccountDetail = {
  account: BusinessAccountSummary & { billingAddress: string; trn: string };
  members: { id: string; fullName: string; email: string }[];
  shipments: Paginated<Shipment>;
  totals: { billed: number; outstanding: number; cod: number };
};

export const getBusinessAccountDetail = async (
  businessId: string,
  page: number,
): Promise<BusinessAccountDetail | null> => {
  const supabase = await createClient();
  const { from, to } = pageRange(page);

  const [{ data: account }, { data: memberRows }, { data: stats }, { data: shipmentRows, count }] = await Promise.all([
    supabase
      .from('business_accounts')
      .select('id, company_name, contact_person, contact_email, contact_phone, active, billing_info')
      .eq('id', businessId)
      .maybeSingle(),
    supabase
      .from('business_account_members')
      .select('profile_id, profiles(full_name, email)')
      .eq('business_account_id', businessId),
    supabase
      .from('business_shipment_stats')
      .select('shipment_count, billed, outstanding, cod')
      .eq('business_account_id', businessId)
      .maybeSingle(),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS, { count: 'exact' })
      .eq('business_account_id', businessId)
      .order('created_at', { ascending: false })
      .range(from, to),
  ]);
  if (!account) return null;

  const members = (memberRows ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string; email: string } | null;
    return { id: row.profile_id, fullName: profile?.full_name ?? '—', email: profile?.email ?? '—' };
  });
  const billing = (account.billing_info ?? {}) as { address?: string; trn?: string };

  return {
    account: {
      id: account.id,
      companyName: account.company_name,
      contactPerson: account.contact_person,
      contactEmail: account.contact_email,
      contactPhone: account.contact_phone,
      active: account.active,
      memberCount: members.length,
      shipmentCount: stats?.shipment_count ?? 0,
      billingAddress: billing.address ?? '',
      trn: billing.trn ?? '',
    },
    members,
    shipments: toPaginated(((shipmentRows ?? []) as ShipmentRow[]).map(mapRowToShipment), count ?? 0, page),
    totals: {
      billed: Number(stats?.billed ?? 0),
      outstanding: Number(stats?.outstanding ?? 0),
      cod: Number(stats?.cod ?? 0),
    },
  };
};

// Active business accounts a customer belongs to — what they can book a
// bulk list under. RLS limits both tables to the caller's own memberships.
export const listMyBusinessAccounts = async (profileId: string): Promise<{ id: string; companyName: string }[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('business_account_members')
    .select('business_accounts(id, company_name, active)')
    .eq('profile_id', profileId);

  return (data ?? [])
    .flatMap((row) => {
      const account = row.business_accounts as
        | { id: string; company_name: string; active: boolean }
        | { id: string; company_name: string; active: boolean }[]
        | null;
      return Array.isArray(account) ? account : account ? [account] : [];
    })
    .filter((account) => account.active)
    .map((account) => ({ id: account.id, companyName: account.company_name }));
};
