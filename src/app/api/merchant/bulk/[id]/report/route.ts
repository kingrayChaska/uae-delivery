import { NextResponse } from 'next/server';

import { getCurrentProfile } from '@/lib/auth/session';
import { isUuid } from '@/lib/security/validate';
import { toCsv } from '@/lib/csv/serialize';
import { getBatchReportRows, getMerchantBatch } from '@/services/bulk/merchant-bulk';

import type { NextRequest } from 'next/server';

// The merchant's shipment report for one bulk batch: tracking IDs next to
// what they uploaded, for reconciliation. Reads run with the caller's own
// session, so RLS returns only batches and shipments they may see; anyone
// else gets a 404 (the endpoint's existence isn't advertised).
export const GET = async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const profile = await getCurrentProfile();
  const { id } = await params;
  if (!profile || !profile.active || profile.role !== 'customer' || !isUuid(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const batch = await getMerchantBatch(id);
  if (!batch) return new NextResponse('Not found', { status: 404 });

  const rows = await getBatchReportRows(id);
  // Cells are escaped against spreadsheet formula injection (toCsv).
  const csv = toCsv(
    ['tracking_id', 'recipient_name', 'recipient_phone', 'pickup_address', 'delivery_address', 'distance_km', 'delivery_fee', 'currency', 'cod_type', 'cod_amount', 'delivery_date', 'status'],
    rows.map((row) => [
      row.trackingNumber,
      row.recipientName,
      row.recipientPhone,
      row.pickupAddress,
      row.deliveryAddress,
      row.distanceKm.toFixed(2),
      row.deliveryFee.toFixed(2),
      row.currency,
      row.recipientPaymentType === 'postpaid' ? 'Postpaid' : 'Prepaid',
      row.codAmount.toFixed(2),
      row.deliveryDate ?? '',
      row.status,
    ]),
  );

  return new NextResponse(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${batch.reference}-shipments.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
