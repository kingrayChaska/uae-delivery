'use server';

import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { safeErrorMessage } from '@/lib/security/errors';
import { isUuid } from '@/lib/security/validate';
import { RATE_LIMIT_MESSAGE, checkRateLimit } from '@/lib/security/rate-limit';
import { isInvoiceNumber } from '@/lib/invoices/types';

import type { Role } from '@/lib/types';

export type IssueInvoiceResult = { success: true; invoiceNumber: string } | { success: false; error: string };

// Both actions only pass an id along. The database functions
// (issue_shipment_invoice / issue_batch_invoice, migrations 0031, 0054) run
// with the caller's own session and decide everything that matters: that
// the caller booked the shipment or belongs to its business — or, for a
// guest booking (a customer with no account), is an active operator or
// manager — which kind of invoice it is, and every amount, copied from the
// stored, price-checked shipments, never from this request. Calling either
// again returns the invoice already issued, so retries and repeated
// downloads never bill twice.
const issue = async (
  fn: 'issue_shipment_invoice' | 'issue_batch_invoice',
  args: Record<string, string>,
  roles: Role[],
): Promise<IssueInvoiceResult> => {
  try {
    const profile = await requireRole(...roles);
    if (!(await checkRateLimit('invoicePerUser', profile.id))) return { success: false, error: RATE_LIMIT_MESSAGE };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error || !isInvoiceNumber(data)) {
      if (error) console.error('Invoice could not be issued', fn, error.code, error.message);
      return { success: false, error: safeErrorMessage(error, 'invoices.errors.generateFailed') };
    }
    return { success: true, invoiceNumber: data };
  } catch {
    return { success: false, error: 'invoices.errors.generateFailed' };
  }
};

export const issueShipmentInvoiceAction = async (shipmentId: string): Promise<IssueInvoiceResult> => {
  if (!isUuid(shipmentId)) return { success: false, error: 'errors.db.shipmentNotFound' };
  // Staff: guest bookings only — the database refuses any other shipment.
  return issue('issue_shipment_invoice', { p_shipment_id: shipmentId }, ['customer', 'operator', 'manager']);
};

export const issueBatchInvoiceAction = async (batchId: string): Promise<IssueInvoiceResult> => {
  if (!isUuid(batchId)) return { success: false, error: 'errors.db.bulkShipmentNotFound' };
  return issue('issue_batch_invoice', { p_batch_id: batchId }, ['customer']);
};
