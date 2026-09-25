import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mapRowToShipment, SHIPMENT_SELECT_COLUMNS } from '@/services/shipments/shipment-mapper';

import type { Shipment } from '@/lib/types';
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

export const listCustomers = async (): Promise<CustomerSummary[]> => {
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, active')
    .eq('role', 'customer')
    .order('full_name', { ascending: true });

  if (!profiles || profiles.length === 0) return [];

  const { data: shipmentRows } = await supabase
    .from('shipments')
    .select('customer_id, price, payment_status')
    .in(
      'customer_id',
      profiles.map((p) => p.id),
    );

  return profiles.map((profile) => {
    const shipments = (shipmentRows ?? []).filter((s) => s.customer_id === profile.id);
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      active: profile.active,
      shipmentCount: shipments.length,
      totalSpent: shipments.filter((s) => s.payment_status === 'paid').reduce((sum, s) => sum + s.price, 0),
    };
  });
};

export type CustomerDetail = {
  customer: CustomerSummary;
  shipments: Shipment[];
};

export const getCustomerDetail = async (customerId: string): Promise<CustomerDetail | null> => {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, active')
    .eq('id', customerId)
    .eq('role', 'customer')
    .maybeSingle();

  if (!profile) return null;

  const { data: shipmentRows } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT_COLUMNS)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  const shipments = ((shipmentRows ?? []) as ShipmentRow[]).map(mapRowToShipment);

  return {
    customer: {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      active: profile.active,
      shipmentCount: shipments.length,
      totalSpent: shipments.filter((s) => s.paymentStatus === 'paid').reduce((sum, s) => sum + s.price, 0),
    },
    shipments,
  };
};
