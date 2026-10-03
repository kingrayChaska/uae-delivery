import 'server-only';

import { createHash } from 'node:crypto';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeErrorMessage } from '@/lib/security/errors';
import { parseCsvRecords } from '@/lib/csv/parse';
import { googleMapsProvider } from '@/lib/maps/google-provider';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';
import { isFallbackRule } from '@/lib/pricing/config';
import { calculateShipmentPrice, sumPrices } from '@/lib/pricing/calculate';
import { bookingSchema } from '@/lib/shipment/schemas';
import { distanceLimitMessage } from '@/lib/shipment/booking-guards';
import { EMIRATE_COVERAGE, classifyServiceArea, serviceAreaError } from '@/lib/service-areas/config';
import { todayInUae } from '@/lib/bulk/schemas';
import {
  MERCHANT_BULK_MAX_FILE_BYTES,
  MERCHANT_BULK_MAX_ROWS,
  fieldForBookingPath,
  isBookableStatus,
  missingMerchantColumns,
  normalizedRowKey,
  parseMerchantRow,
  rowStatusFor,
  toMerchantRowInput,
} from '@/lib/bulk/merchant-csv';
import { finalizeBatch } from '@/services/bulk/create-batch';
import { getBookingCustomer, quoteShipment, shipmentInsertValues } from '@/services/shipments/create-shipment';

import { msg, parseMsg } from '@/i18n/message';

import type { BookingInput } from '@/lib/shipment/schemas';
import type { AddressResolution } from '@/lib/maps/types';
import type { Emirate, ServiceArea } from '@/lib/service-areas/config';
import type { BulkRowResult } from '@/lib/bulk/schemas';
import type { MerchantRowInput, RowIssue, RowStatus } from '@/lib/bulk/merchant-csv';
import type { PaymentMethod, PriceBreakdown, PricingRuleSet, Profile } from '@/lib/types';
import type { BookingCustomer, ShipmentQuote } from '@/services/shipments/create-shipment';
import type { SupabaseClient } from '@supabase/supabase-js';

// Merchant bulk shipments (migration 0026). A CSV becomes a DRAFT batch of
// shipment_batch_rows; each row is validated, resolved, coverage-checked,
// routed and priced here — by the same bookingSchema and quoteShipment() a
// single booking uses — and the merchant reviews and fixes rows before
// booking. Booking inserts every bookable row in ONE statement, so it is
// all or nothing, and builds each shipment from the quote this server
// stored, never from the browser.
//
// shipment_batch_rows has no client write policies: every write below uses
// the service-role client, and only after the batch has been matched to the
// signed-in merchant (customer_id = merchant.id).

// ── Merchant ────────────────────────────────────────────────────────────────

export type MerchantContext = BookingCustomer & {
  businessAccountId: string;
  // Defaults for each shipment's pickup contact when the CSV leaves it out.
  pickupContactName: string;
  pickupContactPhone: string;
};

// Account type and business are read from the database, never the request.
// `client` is the merchant's own session — or, for the background worker
// (which has no session), the service-role client.
const loadMerchantContext = async (customerId: string, client: SupabaseClient): Promise<MerchantContext> => {
  const customer = await getBookingCustomer(customerId, client);
  if (customer.accountType !== 'merchant' || !customer.merchantBusinessAccountId) throw new Error('bulk.errors.notMerchant');

  const [{ data: business }, { data: profile }] = await Promise.all([
    client.from('business_accounts').select('contact_person, contact_phone').eq('id', customer.merchantBusinessAccountId).maybeSingle(),
    client.from('profiles').select('full_name, phone, active').eq('id', customerId).maybeSingle(),
  ]);
  if (!profile?.active) throw new Error('bulk.errors.notMerchant');

  return {
    ...customer,
    businessAccountId: customer.merchantBusinessAccountId,
    pickupContactName: business?.contact_person || profile.full_name,
    pickupContactPhone: business?.contact_phone || profile.phone,
  };
};

export const getMerchantContext = async (profile: Profile): Promise<MerchantContext> => loadMerchantContext(profile.id, await createClient());

// ── Rows ────────────────────────────────────────────────────────────────────

export type Coverage = ServiceArea['status'];

// What this server worked out for a row (shipment_batch_rows.quote).
export type StoredQuote = {
  pickupAddress?: string;
  deliveryAddress?: string;
  // Present when the row can be booked.
  booking?: {
    input: BookingInput;
    ruleId: string;
    breakdown: PriceBreakdown;
    emirates: { pickup: Emirate; dropoff: Emirate };
    deliveryDate: string;
  };
};

type RowRecord = {
  id: string;
  batch_id: string;
  row_number: number;
  input: MerchantRowInput;
  input_hash: string;
  status: RowStatus;
  issues: RowIssue[];
  quote: StoredQuote | null;
  distance_km: number | string | null;
  delivery_fee: number | string | null;
  cod_amount: number | string | null;
  coverage: Coverage | null;
};

const ROW_COLUMNS = 'id, batch_id, row_number, input, input_hash, status, issues, quote, distance_km, delivery_fee, cod_amount, coverage';

// What the review screen needs per row (the full quote stays on the server).
export type BulkReviewRow = {
  id: string;
  rowNumber: number;
  input: MerchantRowInput;
  status: RowStatus;
  issues: RowIssue[];
  pickupAddress: string | null;
  deliveryAddress: string | null;
  distanceKm: number | null;
  deliveryFee: number | null;
  codAmount: number | null;
  coverage: Coverage | null;
};

const toReviewRow = (row: RowRecord): BulkReviewRow => ({
  id: row.id,
  rowNumber: row.row_number,
  input: row.input,
  status: row.status,
  issues: row.issues ?? [],
  pickupAddress: row.quote?.pickupAddress ?? null,
  deliveryAddress: row.quote?.deliveryAddress ?? null,
  distanceKm: row.distance_km === null ? null : Number(row.distance_km),
  deliveryFee: row.delivery_fee === null ? null : Number(row.delivery_fee),
  codAmount: row.cod_amount === null ? null : Number(row.cod_amount),
  coverage: row.coverage,
});

const hashInput = (input: MerchantRowInput) => createHash('sha256').update(normalizedRowKey(input)).digest('hex');

// PostgREST returns at most 1,000 rows per read; a batch can't be bigger
// than MERCHANT_BULK_MAX_ROWS, but page anyway rather than truncate silently.
const READ_PAGE = 1000;

const loadRows = async (batchId: string, client: 'admin' | 'session'): Promise<RowRecord[]> => {
  const supabase = client === 'admin' ? createAdminClient() : await createClient();
  const rows: RowRecord[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await supabase
      .from('shipment_batch_rows')
      .select(ROW_COLUMNS)
      .eq('batch_id', batchId)
      .order('row_number', { ascending: true })
      .range(from, from + READ_PAGE - 1);
    if (error) throw new Error(safeErrorMessage(error, 'bulk.errors.loadFailed'));
    rows.push(...((data ?? []) as RowRecord[]));
    if (!data || data.length < READ_PAGE) return rows;
  }
};

// Readable by the merchant (and their business's members) and staff — RLS
// decides, using the caller's own session.
export const listBatchRows = async (batchId: string): Promise<BulkReviewRow[]> => (await loadRows(batchId, 'session')).map(toReviewRow);

// ── Batches ─────────────────────────────────────────────────────────────────

type OwnedBatch = { id: string; reference: string; status: string; updated_at: string; rows_submitted: number };

// The batch, only if the signed-in merchant uploaded it.
const getOwnedBatch = async (merchantId: string, batchId: string): Promise<OwnedBatch | null> => {
  const { data } = await createAdminClient()
    .from('shipment_batches')
    .select('id, reference, status, updated_at, rows_submitted')
    .eq('id', batchId)
    .eq('customer_id', merchantId)
    .maybeSingle();
  return data as OwnedBatch | null;
};

const requireDraft = async (merchantId: string, batchId: string) => {
  const batch = await getOwnedBatch(merchantId, batchId);
  if (!batch) throw new Error('bulk.errors.notFound');
  if (batch.status !== 'draft') throw new Error('bulk.errors.notDraft');
  return batch;
};

const batchName = (fileName: string) => {
  const name = fileName.replace(/\.csv$/i, '').replace(/[^\p{L}\p{N} ._()-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return name.length >= 2 ? name : 'Bulk upload';
};

// A quote character left open swallows the rest of the file into one cell.
const hasUnclosedQuote = (text: string) => (text.match(/"/g)?.length ?? 0) % 2 === 1;

export type CreatedDraft = { id: string; reference: string; rows: number };

// Parses the CSV (again — the browser's parse is only a preview) and stores
// every row as 'pending'. Nothing is resolved or priced yet.
export const createMerchantDraft = async (
  merchant: MerchantContext,
  { fileName, csvText }: { fileName: string; csvText: string },
): Promise<CreatedDraft> => {
  if (new TextEncoder().encode(csvText).length > MERCHANT_BULK_MAX_FILE_BYTES) throw new Error('bulk.errors.tooLarge');
  if (hasUnclosedQuote(csvText)) throw new Error('bulk.errors.unclosedQuote');

  const [headerRecord, ...dataRows] = parseCsvRecords(csvText);
  const headers = (headerRecord?.cells ?? []).map((header) => header.trim().toLowerCase());
  if (headers.length === 0) throw new Error('bulk.errors.empty');
  const missing = missingMerchantColumns(headers);
  if (missing.length > 0) throw new Error(msg('bulk.errors.missingColumns', { columns: missing.join(', ') }));
  if (dataRows.length === 0) throw new Error('bulk.errors.empty');
  if (dataRows.length > MERCHANT_BULK_MAX_ROWS) {
    throw new Error(msg('bulk.errors.tooMany', { max: MERCHANT_BULK_MAX_ROWS, count: dataRows.length }));
  }

  // Inserted with the merchant's own session: shipment_batches_insert
  // (migration 0026) checks they own it and belong to the business.
  const supabase = await createClient();
  const { data: batch, error } = await supabase
    .from('shipment_batches')
    .insert({
      customer_id: merchant.id,
      created_by: merchant.id,
      business_account_id: merchant.businessAccountId,
      name: batchName(fileName),
      file_name: fileName.slice(0, 200),
      status: 'draft',
      notes: '',
    })
    .select('id, reference')
    .single();
  if (error || !batch) throw new Error(safeErrorMessage(error, 'bulk.errors.uploadFailed'));

  const admin = createAdminClient();
  const rows = dataRows.map(({ cells, row: rowNumber }) => {
    const input = toMerchantRowInput(Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ''])));
    // More cells than headers: an address with an unquoted comma has
    // shifted every value after it.
    const extraCells = cells.slice(headers.length).some((cell) => cell.trim() !== '');
    return {
      batch_id: batch.id,
      // The row as numbered in the merchant's spreadsheet (blank rows count).
      row_number: rowNumber,
      input,
      input_hash: hashInput(input),
      ...(extraCells
        ? { status: 'invalid', issues: [{ field: 'row', message: 'bulk.validation.extraCells', severity: 'error' }], processed_at: new Date().toISOString() }
        : { status: 'pending' }),
    };
  });

  // Same keys in every object (PostgREST bulk insert), so split by shape.
  const pending = rows.filter((row) => row.status === 'pending');
  const flagged = rows.filter((row) => row.status !== 'pending');
  for (const group of [pending, flagged]) {
    for (let i = 0; i < group.length; i += 500) {
      const { error: rowsError } = await admin.from('shipment_batch_rows').insert(group.slice(i, i + 500));
      if (rowsError) {
        console.error('Bulk upload: storing rows failed', rowsError.message);
        await admin.from('shipment_batches').update({ status: 'cancelled' }).eq('id', batch.id);
        throw new Error('bulk.errors.uploadFailed');
      }
    }
  }
  await admin.from('shipment_batches').update({ rows_submitted: rows.length }).eq('id', batch.id);

  return { id: batch.id, reference: batch.reference, rows: rows.length };
};

// ── Validation (one row) ────────────────────────────────────────────────────

type RowUpdate = {
  status: RowStatus;
  issues: RowIssue[];
  quote: StoredQuote | null;
  distance_km: number | null;
  delivery_fee: number | null;
  cod_amount: number | null;
  coverage: Coverage | null;
  processed_at: string;
};

type ValidationContext = {
  merchant: MerchantContext;
  rules: PricingRuleSet;
  today: string;
  // The first row number holding each input hash, for duplicate warnings.
  firstByHash: Map<string, number>;
  // One resolution per distinct address per request (on top of the
  // provider's own cache).
  resolutions: Map<string, Promise<AddressResolution | null>>;
};

const DUPLICATE_KEY = 'bulk.issues.duplicate';

const duplicateIssue = (row: number): RowIssue => ({ field: 'row', message: msg(DUPLICATE_KEY, { row }), severity: 'warning' });

const resolve = (context: ValidationContext, address: string) => {
  const key = address.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!context.resolutions.has(key)) {
    context.resolutions.set(
      key,
      googleMapsProvider.resolveAddress(address).catch((error) => {
        console.error('Bulk upload: address lookup failed', error instanceof Error ? error.message : error);
        return null;
      }),
    );
  }
  return context.resolutions.get(key)!;
};

const COVERAGE_RANK: Record<Coverage, number> = { active: 0, unverified: 1, contact_support: 2, outside_uae: 3 };
const worst = (...areas: (Coverage | null)[]) =>
  areas.reduce<Coverage | null>((a, b) => (b === null ? a : a === null || COVERAGE_RANK[b] > COVERAGE_RANK[a] ? b : a), null);

// quoteShipment's refusal → the column to fix, and the coverage verdict
// when that's what refused it.
const fromQuoteError = (message: string): { issue: RowIssue; coverage: Coverage | null } => {
  const key = parseMsg(message)?.key ?? message;
  const coverage: Coverage | null = /OnRequest$/.test(key)
    ? 'contact_support'
    : /Unverified$/.test(key)
      ? 'unverified'
      : /OutsideUae$/.test(key)
        ? 'outside_uae'
        : null;
  if (key.startsWith('serviceAreas.errors.')) return { issue: { field: 'coverage', message, severity: 'error' }, coverage };
  if (key === 'booking.errors.distanceLimit' || key === 'booking.errors.routeFailed') {
    return { issue: { field: 'distance', message, severity: 'error' }, coverage: null };
  }
  if (key === 'booking.errors.sameLocation') return { issue: { field: 'delivery_address', message, severity: 'error' }, coverage: null };
  return { issue: { field: 'row', message, severity: 'error' }, coverage: null };
};

const validateRow = async (context: ValidationContext, row: RowRecord): Promise<RowUpdate> => {
  const { row: parsed, issues } = parseMerchantRow(row.input, context.today);
  const first = context.firstByHash.get(row.input_hash);
  if (first !== undefined && first < row.row_number) issues.push(duplicateIssue(first));

  const done = (quote: StoredQuote | null, coverage: Coverage | null, extra: Partial<RowUpdate> = {}): RowUpdate => ({
    status: rowStatusFor(issues),
    issues,
    quote,
    distance_km: null,
    delivery_fee: null,
    cod_amount: null,
    coverage,
    processed_at: new Date().toISOString(),
    ...extra,
  });

  if (!parsed) return done(null, null);

  // ── Addresses (Google, server-side) ──
  const [pickup, dropoff] = await Promise.all([resolve(context, parsed.pickupAddress), resolve(context, parsed.deliveryAddress)]);
  const ends = [
    { field: 'pickup_address' as const, end: 'pickup' as const, resolution: pickup },
    { field: 'delivery_address' as const, end: 'dropoff' as const, resolution: dropoff },
  ];
  const areas: Coverage[] = [];
  for (const { field, end, resolution } of ends) {
    if (!resolution) {
      issues.push({ field, message: 'bulk.issues.addressNotFound', severity: 'error' });
      continue;
    }
    if (resolution.tooGeneral) {
      issues.push({ field, message: 'bulk.issues.addressTooGeneral', severity: 'error' });
      continue;
    }
    if (resolution.approximate) {
      issues.push({ field, message: msg('bulk.issues.addressApproximate', { address: resolution.location.formattedAddress }), severity: 'warning' });
    }
    // Coverage from Google's own address components. Only a definite "not
    // covered" stops the row here (saving the route call); an emirate
    // Google didn't name is settled by quoteShipment's own check below.
    const area = classifyServiceArea(resolution.location.place);
    areas.push(area.status);
    const refusal = area.status === 'contact_support' || area.status === 'outside_uae' ? serviceAreaError(area, end) : null;
    if (refusal) issues.push({ field: 'coverage', message: refusal, severity: 'error' });
  }

  const quote: StoredQuote = {
    pickupAddress: pickup?.location.formattedAddress,
    deliveryAddress: dropoff?.location.formattedAddress,
  };
  if (!pickup || !dropoff || issues.some((issue) => issue.severity === 'error')) return done(quote, worst(...areas));

  // ── The normal booking input, validated by the normal booking schema ──
  const location = (resolution: AddressResolution) => ({
    address: resolution.location.formattedAddress,
    lat: resolution.location.coordinates.lat,
    lng: resolution.location.coordinates.lng,
    place: { ...resolution.location.place, source: 'search' as const },
  });
  const candidate = {
    pickup: {
      ...location(pickup),
      contactName: parsed.pickupContactName || context.merchant.pickupContactName,
      contactPhone: parsed.pickupContactPhone || context.merchant.pickupContactPhone,
    },
    dropoff: {
      ...location(dropoff),
      instructions: parsed.notes || undefined,
      contactName: parsed.recipientName,
      contactPhone: parsed.recipientPhone,
    },
    deliveryType: parsed.deliveryType,
    packageType: parsed.packageType,
    packageDescription: parsed.packageDescription,
    packageQuantity: parsed.quantity,
    packageWeightKg: parsed.weightKg,
    isFragile: parsed.isFragile,
    packageImagePath: null,
    recipientPaymentType: parsed.recipientPaymentType,
    codAmount: parsed.codAmount,
    productValue: parsed.packageValue,
    // How the delivery fee is paid doesn't change the price; the merchant
    // picks it when booking.
    paymentMethod: 'cod' as const,
    clientRequestId: row.id,
  };
  const checked = bookingSchema.safeParse(candidate);
  if (!checked.success) {
    for (const issue of checked.error.issues) {
      issues.push({ field: fieldForBookingPath(issue.path), message: issue.message, severity: 'error' });
    }
    return done(quote, worst(...areas));
  }

  // ── Coverage, route, distance limit and price: exactly quoteShipment ──
  let shipmentQuote: ShipmentQuote;
  try {
    shipmentQuote = await quoteShipment(context.merchant, checked.data, context.rules);
  } catch (error) {
    const { issue, coverage } = fromQuoteError(error instanceof Error ? error.message : 'booking.errors.cannotBook');
    issues.push(issue);
    // The refused distance, for the review table.
    const distance = parseMsg(issue.message)?.key === 'booking.errors.distanceLimit' ? Number(parseMsg(issue.message)?.values.distance) : null;
    return done(quote, worst(...areas, coverage), { distance_km: Number.isFinite(distance) ? distance : null });
  }

  const { breakdown, rule, emirates } = shipmentQuote;
  quote.booking = { input: checked.data, ruleId: rule.id, breakdown, emirates, deliveryDate: parsed.deliveryDate };
  return done(quote, 'active', {
    distance_km: breakdown.distanceKm,
    delivery_fee: breakdown.totalPrice,
    cod_amount: checked.data.recipientPaymentType === 'postpaid' ? (checked.data.codAmount ?? 0) : 0,
  });
};

// A few rows at a time: quick enough for a request, gentle on Google's
// rate limits. Addresses repeat, so most lookups are cache hits.
const CONCURRENCY = 5;

const runPool = async <T>(items: T[], worker: (item: T) => Promise<void>) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
};

const firstRowsByHash = async (batchId: string, hashes: string[]) => {
  const firstByHash = new Map<string, number>();
  if (hashes.length === 0) return firstByHash;
  const { data } = await createAdminClient()
    .from('shipment_batch_rows')
    .select('row_number, input_hash')
    .eq('batch_id', batchId)
    .in('input_hash', [...new Set(hashes)]);
  for (const { row_number, input_hash } of (data ?? []) as { row_number: number; input_hash: string }[]) {
    const seen = firstByHash.get(input_hash);
    if (seen === undefined || row_number < seen) firstByHash.set(input_hash, row_number);
  }
  return firstByHash;
};

const validateAndStore = async (
  merchant: MerchantContext,
  batchId: string,
  rows: RowRecord[],
  rules: PricingRuleSet,
): Promise<RowRecord[]> => {
  if (rows.length === 0) return [];
  const context: ValidationContext = {
    merchant,
    rules,
    today: todayInUae(),
    firstByHash: await firstRowsByHash(batchId, rows.map((row) => row.input_hash)),
    resolutions: new Map(),
  };
  const admin = createAdminClient();
  const updated: RowRecord[] = [];
  await runPool(rows, async (row) => {
    let update: RowUpdate;
    try {
      update = await validateRow(context, row);
    } catch (error) {
      console.error('Bulk upload: row validation failed', row.id, error instanceof Error ? error.message : error);
      update = {
        status: 'invalid',
        issues: [{ field: 'row', message: 'bulk.issues.checkFailed', severity: 'error' }],
        quote: null,
        distance_km: null,
        delivery_fee: null,
        cod_amount: null,
        coverage: null,
        processed_at: new Date().toISOString(),
      };
    }
    // Only a row that is still in this batch (not deleted meanwhile).
    const { error } = await admin.from('shipment_batch_rows').update(update).eq('id', row.id).eq('batch_id', batchId);
    if (error) console.error('Bulk upload: saving a validated row failed', row.id, error.message);
    updated.push({ ...row, ...update });
  });
  return updated.sort((a, b) => a.row_number - b.row_number);
};

export const BULK_CHUNK_SIZE = 20;

// The validation queue: hands out pending rows of draft batches, each to
// exactly one worker (claim_batch_rows, migration 0026). Which rows to
// check is decided here, so a client can't pick or skip rows.
const claimRows = async (batchId: string | null, limit: number): Promise<RowRecord[]> => {
  const { data, error } = await createAdminClient().rpc('claim_batch_rows', { p_batch_id: batchId, p_limit: limit });
  if (error) throw new Error(safeErrorMessage(error, 'bulk.errors.checkFailed'));
  return (data ?? []) as RowRecord[];
};

const countPending = async (batchId: string) => {
  const { count } = await createAdminClient()
    .from('shipment_batch_rows')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('status', 'pending');
  return count ?? 0;
};

// The merchant's open review screen: checks the next chunk itself (so
// progress shows even without the background worker), and returns every
// row finished since `since` — including rows the background worker
// checked meanwhile. Called repeatedly until `remaining` is 0.
export const processPendingRows = async (
  merchant: MerchantContext,
  batchId: string,
  since: string | null,
): Promise<{ rows: BulkReviewRow[]; remaining: number; syncedAt: string }> => {
  await requireDraft(merchant.id, batchId);
  // A worker stamps processed_at just before its write commits, so the next
  // sync starts a minute back: overlapping rows merge harmlessly, and none
  // slips between two syncs.
  const syncedAt = new Date(Date.now() - 60_000).toISOString();
  const claimed = await claimRows(batchId, BULK_CHUNK_SIZE);
  const mine = await validateAndStore(merchant, batchId, claimed, await getActivePricingRules());

  let others: RowRecord[] = [];
  if (since) {
    const { data } = await createAdminClient()
      .from('shipment_batch_rows')
      .select(ROW_COLUMNS)
      .eq('batch_id', batchId)
      .neq('status', 'pending')
      .gte('processed_at', since)
      .order('processed_at', { ascending: true })
      .limit(READ_PAGE);
    others = (data ?? []) as RowRecord[];
  }
  const mineIds = new Set(mine.map((row) => row.id));
  return {
    rows: [...mine, ...others.filter((row) => !mineIds.has(row.id))].map(toReviewRow),
    remaining: await countPending(batchId),
    syncedAt,
  };
};

// The background worker: keeps checking pending rows — of one batch, or of
// any draft batch — until it runs out of rows or time. It has no user
// session, so it reads the merchant and the pricing rules with the
// service-role client, for the batch's own owner (never from a request).
export const runBulkWorker = async ({
  batchId,
  budgetMs,
}: {
  batchId: string | null;
  budgetMs: number;
}): Promise<{ processed: number; remaining: number }> => {
  const admin = createAdminClient();
  const deadline = Date.now() + budgetMs;
  const merchants = new Map<string, Promise<MerchantContext | null>>();
  const rules = await getActivePricingRules(admin);
  let processed = 0;

  const merchantFor = (id: string) => {
    if (!merchants.has(id)) {
      merchants.set(
        id,
        (async () => {
          const { data: batch } = await admin.from('shipment_batches').select('customer_id').eq('id', id).maybeSingle();
          return batch ? loadMerchantContext(batch.customer_id, admin).catch(() => null) : null;
        })(),
      );
    }
    return merchants.get(id)!;
  };

  while (Date.now() < deadline) {
    const claimed = await claimRows(batchId, BULK_CHUNK_SIZE);
    if (claimed.length === 0) break;

    const byBatch = new Map<string, RowRecord[]>();
    for (const row of claimed) byBatch.set(row.batch_id, [...(byBatch.get(row.batch_id) ?? []), row]);

    for (const [id, rows] of byBatch) {
      const merchant = await merchantFor(id);
      if (merchant) {
        await validateAndStore(merchant, id, rows, rules);
      } else {
        // No longer an approved merchant: nothing in this batch can be booked.
        await admin
          .from('shipment_batch_rows')
          .update({
            status: 'invalid',
            issues: [{ field: 'row', message: 'bulk.errors.notMerchant', severity: 'error' }],
            processed_at: new Date().toISOString(),
          })
          .in('id', rows.map((row) => row.id));
      }
      processed += rows.length;
    }
  }

  return { processed, remaining: batchId ? await countPending(batchId) : 0 };
};

// After an edit or removal, rows that were (or now are) copies of each
// other get their duplicate warning added or dropped — no Google calls.
const refreshDuplicates = async (batchId: string, hashes: string[]) => {
  const admin = createAdminClient();
  const { data } = await admin
    .from('shipment_batch_rows')
    .select('id, row_number, input_hash, status, issues')
    .eq('batch_id', batchId)
    .in('input_hash', [...new Set(hashes)])
    .neq('status', 'pending');
  const rows = (data ?? []) as Pick<RowRecord, 'id' | 'row_number' | 'input_hash' | 'status' | 'issues'>[];
  const firstByHash = await firstRowsByHash(batchId, hashes);
  const changed: { id: string; row_number: number }[] = [];
  for (const row of rows) {
    const others = (row.issues ?? []).filter((issue) => parseMsg(issue.message)?.key !== DUPLICATE_KEY);
    const first = firstByHash.get(row.input_hash);
    const issues = first !== undefined && first < row.row_number ? [...others, duplicateIssue(first)] : others;
    if (JSON.stringify(issues) === JSON.stringify(row.issues)) continue;
    await admin.from('shipment_batch_rows').update({ issues, status: rowStatusFor(issues) }).eq('id', row.id);
    changed.push(row);
  }
  return changed;
};

const getOwnedDraftRow = async (merchantId: string, rowId: string): Promise<RowRecord> => {
  const { data } = await createAdminClient().from('shipment_batch_rows').select(ROW_COLUMNS).eq('id', rowId).maybeSingle();
  const row = data as RowRecord | null;
  if (!row) throw new Error('bulk.errors.rowNotFound');
  await requireDraft(merchantId, row.batch_id);
  return row;
};

// The merchant corrected a row on the review screen: store the new values
// and check it again straight away (resolve, coverage, route, price).
export const updateDraftRow = async (
  merchant: MerchantContext,
  rowId: string,
  input: MerchantRowInput,
): Promise<{ row: BulkReviewRow; affected: BulkReviewRow[] }> => {
  const row = await getOwnedDraftRow(merchant.id, rowId);
  const cleaned = toMerchantRowInput(input);
  const inputHash = hashInput(cleaned);
  const admin = createAdminClient();
  await admin.from('shipment_batch_rows').update({ input: cleaned, input_hash: inputHash, status: 'pending' }).eq('id', row.id);

  const [validated] = await validateAndStore(
    merchant,
    row.batch_id,
    [{ ...row, input: cleaned, input_hash: inputHash, status: 'pending' }],
    await getActivePricingRules(),
  );
  await refreshDuplicates(row.batch_id, [row.input_hash, inputHash]);
  const rows = await loadRows(row.batch_id, 'admin');
  const affectedHashes = new Set([row.input_hash, inputHash]);
  return {
    row: toReviewRow(rows.find((r) => r.id === row.id) ?? validated),
    affected: rows.filter((r) => r.id !== row.id && affectedHashes.has(r.input_hash)).map(toReviewRow),
  };
};

// Leaves a row out of the batch altogether.
export const removeDraftRow = async (merchant: MerchantContext, rowId: string): Promise<{ affected: BulkReviewRow[] }> => {
  const row = await getOwnedDraftRow(merchant.id, rowId);
  const admin = createAdminClient();
  const { error } = await admin.from('shipment_batch_rows').delete().eq('id', row.id);
  if (error) throw new Error('bulk.errors.removeFailed');
  const { count } = await admin.from('shipment_batch_rows').select('id', { count: 'exact', head: true }).eq('batch_id', row.batch_id);
  await admin.from('shipment_batches').update({ rows_submitted: count ?? 0 }).eq('id', row.batch_id);
  await refreshDuplicates(row.batch_id, [row.input_hash]);
  const rows = await loadRows(row.batch_id, 'admin');
  return { affected: rows.filter((r) => r.input_hash === row.input_hash).map(toReviewRow) };
};

// Discards a draft. Its rows go; the batch stays as 'cancelled' history.
export const cancelDraft = async (merchant: MerchantContext, batchId: string) => {
  await requireDraft(merchant.id, batchId);
  const admin = createAdminClient();
  const { data } = await admin
    .from('shipment_batches')
    .update({ status: 'cancelled' })
    .eq('id', batchId)
    .eq('customer_id', merchant.id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();
  if (!data) throw new Error('bulk.errors.notDraft');
  await admin.from('shipment_batch_rows').delete().eq('batch_id', batchId);
};

// ── Booking ─────────────────────────────────────────────────────────────────

export type BookingResult = {
  reference: string;
  booked: number;
  skipped: number;
  total: number;
  // A retry of a booking that already went through.
  alreadyBooked: boolean;
};

const toFils = (amount: number) => Math.round(amount * 100);

const countBatchShipments = async (batchId: string) => {
  const { count } = await createAdminClient().from('shipments').select('id', { count: 'exact', head: true }).eq('batch_id', batchId);
  return count ?? 0;
};

const firstError = (row: RowRecord) =>
  (row.issues ?? []).find((issue) => issue.severity === 'error')?.message ?? (row.status === 'pending' ? 'bulk.issues.notChecked' : 'bulk.issues.notBooked');

// Closes a batch whose shipments now exist: booked rows succeeded, the rest
// are listed as not booked (so the batch reads "240 of 250 booked").
const finishBooking = async (batchId: string, rows: RowRecord[]) => {
  const bookable = rows.filter((row) => isBookableStatus(row.status) && row.quote?.booking);
  const dates = bookable.map((row) => row.quote!.booking!.deliveryDate).sort();
  const admin = createAdminClient();
  // pickup_date before the status change: the "booked" notification
  // (fired by that change) mentions it.
  await admin
    .from('shipment_batches')
    .update({ booked_at: new Date().toISOString(), pickup_date: dates[0] ?? null, booking_error: null })
    .eq('id', batchId);
  const bookableIds = new Set(bookable.map((row) => row.id));
  const results: BulkRowResult[] = rows.map((row) =>
    bookableIds.has(row.id) ? { rowNumber: row.row_number, ok: true, message: '' } : { rowNumber: row.row_number, ok: false, message: firstError(row) },
  );
  await finalizeBatch(batchId, results);
  return { booked: bookable.length, skipped: rows.length - bookable.length, total: sumPrices(bookable.map((row) => row.quote!.booking!.breakdown.totalPrice)) };
};

// Re-checks a stored quote against today's rules before it's booked.
// Returns null when it still stands, or the row's new state when not.
const recheck = (row: RowRecord, rules: PricingRuleSet, accountType: BookingCustomer['accountType'], today: string): Partial<RowUpdate> | null => {
  const booking = row.quote?.booking;
  if (!booking) return { status: 'pending' };
  const fail = (issue: RowIssue): Partial<RowUpdate> => ({ status: 'invalid', issues: [...(row.issues ?? []), issue] });

  if (booking.deliveryDate < today) return fail({ field: 'delivery_date', message: 'bulk.validation.datePast', severity: 'error' });
  for (const [end, emirate] of [['pickup', booking.emirates.pickup], ['dropoff', booking.emirates.dropoff]] as const) {
    if (EMIRATE_COVERAGE[emirate] !== 'active') {
      return fail({ field: 'coverage', message: serviceAreaError({ status: 'contact_support', emirate }, end) ?? 'serviceAreas.errors.cantBook', severity: 'error' });
    }
  }

  const rule = rules[accountType][booking.input.deliveryType];
  if (isFallbackRule(rule)) return fail({ field: 'row', message: 'booking.errors.pricingMissing', severity: 'error' });
  const breakdown = calculateShipmentPrice({
    rule,
    distanceKm: booking.breakdown.distanceKm,
    durationMinutes: booking.breakdown.durationMinutes,
    weightKg: booking.input.packageWeightKg,
    recipientPaymentType: booking.input.recipientPaymentType,
  });
  if (breakdown.exceedsDistanceLimit) {
    return fail({ field: 'distance', message: distanceLimitMessage(breakdown.distanceKm, breakdown.maxDistanceKm), severity: 'error' });
  }
  // Pricing changed since the merchant reviewed it: show the new price and
  // let them confirm it, rather than charge something they didn't see.
  if (rule.id !== booking.ruleId || toFils(breakdown.totalPrice) !== toFils(booking.breakdown.totalPrice)) {
    return {
      quote: { ...row.quote, booking: { ...booking, ruleId: rule.id, breakdown } },
      delivery_fee: breakdown.totalPrice,
    };
  }
  return null;
};

// Books every bookable row of a draft as ordinary shipments, all or none.
//
// Idempotent: the batch is moved draft → processing by a conditional
// update, so a second click (or a second tab) finds it already taken and
// gets the first booking's result instead of a second set of shipments.
// Each shipment also carries its row id as client_request_id, which the
// unique index of migration 0019 holds to one shipment per row.
export const bookMerchantDraft = async (
  merchant: MerchantContext,
  batchId: string,
  { paymentMethod, expectedCount, expectedTotal }: { paymentMethod: PaymentMethod; expectedCount: number; expectedTotal: number },
): Promise<BookingResult> => {
  const admin = createAdminClient();
  const { data: locked } = await admin
    .from('shipment_batches')
    .update({ status: 'processing', booking_error: null })
    .eq('id', batchId)
    .eq('customer_id', merchant.id)
    .eq('status', 'draft')
    .select('id, reference')
    .maybeSingle();

  if (!locked) {
    const batch = await getOwnedBatch(merchant.id, batchId);
    if (!batch) throw new Error('bulk.errors.notFound');
    if (batch.status === 'submitted' || batch.status === 'partially_failed') {
      const rows = await loadRows(batchId, 'admin');
      const booked = rows.filter((row) => isBookableStatus(row.status) && row.quote?.booking);
      return {
        reference: batch.reference,
        booked: booked.length,
        skipped: rows.length - booked.length,
        total: sumPrices(booked.map((row) => row.quote!.booking!.breakdown.totalPrice)),
        alreadyBooked: true,
      };
    }
    throw new Error(batch.status === 'processing' ? 'bulk.errors.bookingInProgress' : 'bulk.errors.notDraft');
  }

  let inserted = false;
  // Hands the batch back to the merchant to fix and try again.
  const release = async (reason: string): Promise<never> => {
    await admin.from('shipment_batches').update({ status: 'draft', booking_error: reason }).eq('id', batchId).eq('status', 'processing');
    throw new Error(reason);
  };

  try {
    const rows = await loadRows(batchId, 'admin');
    if (rows.some((row) => row.status === 'pending')) await release('bulk.errors.stillValidating');
    const bookable = rows.filter((row) => isBookableStatus(row.status));
    if (bookable.length === 0) await release('bulk.errors.nothingToBook');

    // Nothing from the browser is trusted: each stored quote is re-checked
    // against the current pricing rules, coverage and date.
    const [rules, today] = [await getActivePricingRules(), todayInUae()];
    const changes = bookable
      .map((row) => ({ row, change: recheck(row, rules, merchant.accountType, today) }))
      .filter((entry): entry is { row: RowRecord; change: Partial<RowUpdate> } => entry.change !== null);
    if (changes.length > 0) {
      for (const { row, change } of changes) await admin.from('shipment_batch_rows').update(change).eq('id', row.id);
      await release(msg('bulk.errors.changedSinceReview', { count: changes.length }));
    }

    // What the merchant confirmed must be exactly what gets booked.
    const total = sumPrices(bookable.map((row) => row.quote!.booking!.breakdown.totalPrice));
    if (bookable.length !== expectedCount || toFils(total) !== toFils(expectedTotal)) {
      await release(msg('bulk.errors.changedSinceReview', { count: Math.abs(bookable.length - expectedCount) || 1 }));
    }

    // recheck() has confirmed each stored price is the active rule's.
    const values = bookable.map((row) => {
      const { input, breakdown, emirates, deliveryDate } = row.quote!.booking!;
      return shipmentInsertValues(
        merchant,
        { input: { ...input, paymentMethod, clientRequestId: row.id }, rule: rules[merchant.accountType][input.deliveryType], breakdown, emirates },
        { batchId, deliveryDate },
      );
    });

    // ONE insert statement with the merchant's own session: Postgres
    // applies it atomically (every shipment or none), and RLS re-checks
    // each shipment's price against the active rule (shipments_insert),
    // the batch's ownership and the distance limit (triggers). Tracking
    // codes are assigned by the database as usual.
    const supabase = await createClient();
    const { error } = await supabase.from('shipments').insert(values);
    if (error) {
      // An earlier attempt that was interrupted after its insert
      // committed: the shipments are already there.
      if (error.code === '23505' && (await countBatchShipments(batchId)) === bookable.length) {
        inserted = true;
      } else {
        console.error('Bulk booking insert failed', { batchId, code: error.code, message: error.message, details: error.details });
        await release(safeErrorMessage(error, 'bulk.errors.bookingFailed'));
      }
    }
    inserted = true;

    const outcome = await finishBooking(batchId, rows);
    return { reference: locked.reference, ...outcome, alreadyBooked: false };
  } catch (error) {
    // Unexpected failure before anything was created: give the draft back.
    // After the insert, leave it 'processing' for reconcileStaleBooking.
    if (!inserted) {
      await admin.from('shipment_batches').update({ status: 'draft' }).eq('id', batchId).eq('status', 'processing');
    }
    throw error;
  }
};

// A booking interrupted mid-way (server restart, timeout) leaves its batch
// 'processing'. The insert is all-or-nothing, so it either created every
// shipment (finish it) or none (hand the draft back).
const STALE_BOOKING_MS = 3 * 60 * 1000;

export const reconcileStaleBooking = async (merchantId: string, batchId: string): Promise<boolean> => {
  const batch = await getOwnedBatch(merchantId, batchId);
  if (!batch || batch.status !== 'processing' || Date.now() - new Date(batch.updated_at).getTime() < STALE_BOOKING_MS) return false;
  const admin = createAdminClient();
  const { data: fileBatch } = await admin.from('shipment_batches').select('file_name').eq('id', batchId).maybeSingle();
  // Only merchant CSV batches have rows to reconcile against.
  if (!fileBatch?.file_name) return false;

  if ((await countBatchShipments(batchId)) > 0) {
    await finishBooking(batchId, await loadRows(batchId, 'admin'));
  } else {
    await admin
      .from('shipment_batches')
      .update({ status: 'draft', booking_error: 'bulk.errors.bookingInterrupted' })
      .eq('id', batchId)
      .eq('status', 'processing');
  }
  return true;
};

// ── Reading a merchant's batch ──────────────────────────────────────────────

export type MerchantBatch = {
  id: string;
  // Who uploaded it: only they can change or book a draft. Other members of
  // the same business see it read-only.
  customerId: string;
  uploaderName: string;
  reference: string;
  name: string;
  fileName: string | null;
  status: string;
  bookingError: string | null;
  createdAt: string;
  bookedAt: string | null;
  rowsSubmitted: number;
  rowsFailed: number;
};

// RLS (shipment_batches_select) limits this to the merchant's own batches
// (and their business's).
export const getMerchantBatch = async (batchId: string): Promise<MerchantBatch | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shipment_batches')
    .select(
      'id, customer_id, reference, name, file_name, status, booking_error, created_at, booked_at, rows_submitted, rows_failed, uploader:profiles!shipment_batches_customer_id_fkey(full_name)',
    )
    .eq('id', batchId)
    .maybeSingle();
  if (!data) return null;
  const uploader = data.uploader as { full_name: string } | { full_name: string }[] | null;
  return {
    id: data.id,
    customerId: data.customer_id,
    uploaderName: (Array.isArray(uploader) ? uploader[0]?.full_name : uploader?.full_name) ?? '',
    reference: data.reference,
    name: data.name,
    fileName: data.file_name,
    status: data.status,
    bookingError: data.booking_error,
    createdAt: data.created_at,
    bookedAt: data.booked_at,
    rowsSubmitted: data.rows_submitted,
    rowsFailed: data.rows_failed,
  };
};

export type BatchReportRow = {
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  distanceKm: number;
  deliveryFee: number;
  currency: string;
  recipientPaymentType: string;
  codAmount: number;
  deliveryDate: string | null;
  status: string;
};

// Every shipment in a batch, for the merchant's reconciliation CSV. Read
// with the caller's session, so RLS limits it to shipments they may see.
export const getBatchReportRows = async (batchId: string): Promise<BatchReportRow[]> => {
  const supabase = await createClient();
  const rows: BatchReportRow[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const { data } = await supabase
      .from('shipments')
      .select('tracking_number, dropoff_contact_name, dropoff_contact_phone, pickup_address, dropoff_address, distance_km, price, currency, recipient_payment_type, cod_amount, delivery_date, status')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + READ_PAGE - 1);
    for (const row of data ?? []) {
      rows.push({
        trackingNumber: row.tracking_number,
        recipientName: row.dropoff_contact_name,
        recipientPhone: row.dropoff_contact_phone,
        pickupAddress: row.pickup_address,
        deliveryAddress: row.dropoff_address,
        distanceKm: Number(row.distance_km),
        deliveryFee: Number(row.price),
        currency: row.currency,
        recipientPaymentType: row.recipient_payment_type,
        codAmount: Number(row.cod_amount),
        deliveryDate: row.delivery_date,
        status: row.status,
      });
    }
    if (!data || data.length < READ_PAGE) return rows;
  }
};
