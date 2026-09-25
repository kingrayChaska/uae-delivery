import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

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

export const listBusinessAccounts = async (): Promise<BusinessAccountSummary[]> => {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from('business_accounts')
    .select('id, company_name, contact_person, contact_email, contact_phone, active')
    .order('company_name');
  if (!accounts || accounts.length === 0) return [];

  const ids = accounts.map((a) => a.id);
  const [{ data: members }, { data: shipments }] = await Promise.all([
    supabase.from('business_account_members').select('business_account_id').in('business_account_id', ids),
    supabase.from('shipments').select('business_account_id').in('business_account_id', ids),
  ]);

  const count = (rows: { business_account_id: string | null }[] | null, id: string) =>
    (rows ?? []).filter((r) => r.business_account_id === id).length;

  return accounts.map((account) => ({
    id: account.id,
    companyName: account.company_name,
    contactPerson: account.contact_person,
    contactEmail: account.contact_email,
    contactPhone: account.contact_phone,
    active: account.active,
    memberCount: count(members, account.id),
    shipmentCount: count(shipments, account.id),
  }));
};

export type BusinessAccountDetail = {
  account: BusinessAccountSummary & { billingAddress: string; trn: string };
  members: { id: string; fullName: string; email: string }[];
  shipments: Shipment[];
  totals: { billed: number; outstanding: number; cod: number };
};

export const getBusinessAccountDetail = async (businessId: string): Promise<BusinessAccountDetail | null> => {
  const supabase = await createClient();

  const { data: account } = await supabase
    .from('business_accounts')
    .select('id, company_name, contact_person, contact_email, contact_phone, active, billing_info')
    .eq('id', businessId)
    .maybeSingle();
  if (!account) return null;

  const [{ data: memberRows }, { data: shipmentRows }] = await Promise.all([
    supabase
      .from('business_account_members')
      .select('profile_id, profiles(full_name, email)')
      .eq('business_account_id', businessId),
    supabase
      .from('shipments')
      .select(SHIPMENT_SELECT_COLUMNS)
      .eq('business_account_id', businessId)
      .order('created_at', { ascending: false }),
  ]);

  const members = (memberRows ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string; email: string } | null;
    return { id: row.profile_id, fullName: profile?.full_name ?? '—', email: profile?.email ?? '—' };
  });

  const shipments = ((shipmentRows ?? []) as ShipmentRow[]).map(mapRowToShipment);
  const active = shipments.filter((s) => s.status !== 'cancelled');
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
      shipmentCount: shipments.length,
      billingAddress: billing.address ?? '',
      trn: billing.trn ?? '',
    },
    members,
    shipments,
    totals: {
      billed: active.reduce((sum, s) => sum + s.price, 0),
      outstanding: active
        .filter((s) => s.paymentStatus !== 'paid' && !(s.paymentMethod === 'cod' && s.status === 'delivered'))
        .reduce((sum, s) => sum + s.price, 0),
      cod: active.filter((s) => s.paymentMethod === 'cod').reduce((sum, s) => sum + s.price, 0),
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
