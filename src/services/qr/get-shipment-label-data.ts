import 'server-only';

import QRCode from 'qrcode';

import { createClient } from '@/lib/supabase/server';

export type ShipmentLabelData = {
  trackingNumber: string;
  pickupAddress: string;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupBuilding: string | null;
  pickupUnit: string | null;
  pickupFloor: string | null;
  pickupInstructions: string | null;
  dropoffAddress: string;
  dropoffContactName: string;
  dropoffContactPhone: string;
  dropoffBuilding: string | null;
  dropoffUnit: string | null;
  dropoffFloor: string | null;
  dropoffInstructions: string | null;
  deliveryType: 'same_day' | 'next_day';
  deliveryDate: string | null;
  // Null on a merchant's label: the parcel goes to the merchant's own
  // customer, who must not see what the merchant pays ParcelLink. The fee
  // itself is unchanged (shipments.price) and shown everywhere else.
  deliveryFee: number | null;
  currency: string;
  paymentMethod: 'card' | 'cod';
  recipientPaymentType: 'prepaid' | 'postpaid';
  codAmount: number;
  packageType: 'document' | 'parcel' | 'fragile' | 'bulk';
  packageDescription: string;
  packageQuantity: number;
  packageWeightKg: number | null;
  packageLengthCm: number | null;
  packageWidthCm: number | null;
  packageHeightCm: number | null;
  isFragile: boolean;
  qrSvg: string;
};

// get_shipment_qr_token (migration 0017) does the authorization check —
// customer, assigned driver, or staff. Everything else here is ordinary
// shipment data already covered by the standard shipments_select policy.
//
// A merchant shipment never prints its delivery fee: the label goes to the
// merchant's own customer. It is one priced under a merchant pricing rule,
// booked by a merchant account, or booked under a business account — any
// one is enough, so a reader who can't see one of them (the rule or the
// booking customer's profile) still gets a label without the fee.
type AccountTypeEmbed = { account_type: string } | { account_type: string }[] | null;

const accountTypeOf = (embed: AccountTypeEmbed) => (Array.isArray(embed) ? embed[0] : embed)?.account_type;

const isMerchantShipment = (shipment: Pick<LabelRow, 'business_account_id' | 'customer' | 'rule'>) =>
  shipment.business_account_id !== null ||
  accountTypeOf(shipment.customer) === 'merchant' ||
  accountTypeOf(shipment.rule) === 'merchant';

// Everything a label prints — the same for one label or a whole batch.
const LABEL_COLUMNS =
  'id, tracking_number, pickup_address, pickup_contact_name, pickup_contact_phone, pickup_building, pickup_unit, pickup_floor, pickup_instructions, dropoff_address, dropoff_contact_name, dropoff_contact_phone, dropoff_building, dropoff_unit, dropoff_floor, dropoff_instructions, delivery_type, delivery_date, price, currency, business_account_id, customer:profiles!shipments_customer_id_fkey(account_type), rule:pricing_rules(account_type), payment_method, recipient_payment_type, cod_amount, package_type, package_description, package_quantity, package_weight_kg, package_length_cm, package_width_cm, package_height_cm, is_fragile';

type LabelRow = {
  id: string;
  tracking_number: string;
  pickup_address: string;
  pickup_contact_name: string;
  pickup_contact_phone: string;
  pickup_building: string | null;
  pickup_unit: string | null;
  pickup_floor: string | null;
  pickup_instructions: string | null;
  dropoff_address: string;
  dropoff_contact_name: string;
  dropoff_contact_phone: string;
  dropoff_building: string | null;
  dropoff_unit: string | null;
  dropoff_floor: string | null;
  dropoff_instructions: string | null;
  delivery_type: ShipmentLabelData['deliveryType'];
  delivery_date: string | null;
  price: number | string;
  currency: string;
  business_account_id: string | null;
  customer: AccountTypeEmbed;
  rule: AccountTypeEmbed;
  payment_method: ShipmentLabelData['paymentMethod'];
  recipient_payment_type: ShipmentLabelData['recipientPaymentType'];
  cod_amount: number | string;
  package_type: ShipmentLabelData['packageType'];
  package_description: string;
  package_quantity: number;
  package_weight_kg: number | string | null;
  package_length_cm: number | string | null;
  package_width_cm: number | string | null;
  package_height_cm: number | string | null;
  is_fragile: boolean;
};

const numOrNull = (value: number | string | null) => (value === null ? null : Number(value));

const toLabelData = async (shipment: LabelRow, token: string): Promise<ShipmentLabelData> => ({
  trackingNumber: shipment.tracking_number,
  pickupAddress: shipment.pickup_address,
  pickupContactName: shipment.pickup_contact_name,
  pickupContactPhone: shipment.pickup_contact_phone,
  pickupBuilding: shipment.pickup_building,
  pickupUnit: shipment.pickup_unit,
  pickupFloor: shipment.pickup_floor,
  pickupInstructions: shipment.pickup_instructions,
  dropoffAddress: shipment.dropoff_address,
  dropoffContactName: shipment.dropoff_contact_name,
  dropoffContactPhone: shipment.dropoff_contact_phone,
  dropoffBuilding: shipment.dropoff_building,
  dropoffUnit: shipment.dropoff_unit,
  dropoffFloor: shipment.dropoff_floor,
  dropoffInstructions: shipment.dropoff_instructions,
  deliveryType: shipment.delivery_type,
  deliveryDate: shipment.delivery_date,
  deliveryFee: isMerchantShipment(shipment) ? null : Number(shipment.price),
  currency: shipment.currency,
  paymentMethod: shipment.payment_method,
  recipientPaymentType: shipment.recipient_payment_type,
  codAmount: Number(shipment.cod_amount),
  packageType: shipment.package_type,
  packageDescription: shipment.package_description,
  packageQuantity: shipment.package_quantity,
  packageWeightKg: numOrNull(shipment.package_weight_kg),
  packageLengthCm: numOrNull(shipment.package_length_cm),
  packageWidthCm: numOrNull(shipment.package_width_cm),
  packageHeightCm: numOrNull(shipment.package_height_cm),
  isFragile: shipment.is_fragile,
  qrSvg: await QRCode.toString(token, { type: 'svg', margin: 1, width: 160 }),
});

export const getShipmentLabelData = async (shipmentId: string): Promise<ShipmentLabelData | null> => {
  const supabase = await createClient();

  const [{ data: shipment }, { data: token, error: tokenError }] = await Promise.all([
    supabase.from('shipments').select(LABEL_COLUMNS).eq('id', shipmentId).maybeSingle(),
    supabase.rpc('get_shipment_qr_token', { p_shipment_id: shipmentId }),
  ]);

  if (!shipment || tokenError || !token) return null;

  return toLabelData(shipment as unknown as LabelRow, token);
};

// ── All of a bulk shipment's labels ─────────────────────────────────────────

// Labels per printable part. A batch holds up to 1,000 shipments
// (MERCHANT_BULK_MAX_ROWS); one page with all of them would be ~15 MB of
// HTML and a print job browsers stall on, so a large batch prints in parts
// of this many. Most batches fit in one.
export const LABELS_PER_PART = 200;

export type BatchLabels =
  | { status: 'ready'; reference: string; labels: ShipmentLabelData[]; total: number; part: number; parts: number; first: number }
  | { status: 'empty'; reference: string }
  // Some labels couldn't be made: nothing is printed, and these are named.
  | { status: 'incomplete'; reference: string; failed: string[]; total: number };

export const labelPartCount = (total: number) => Math.max(1, Math.ceil(total / LABELS_PER_PART));

// Null when the batch isn't the signed-in customer's own: only the
// customer who booked a batch can print its labels, as with single labels
// (get_shipment_qr_token). The batch, its shipments and their QR tokens
// are all read with the caller's own session, so RLS and
// get_batch_qr_tokens (migration 0032) check ownership again — the browser
// supplies nothing but the batch id and a part number.
export const getBatchLabels = async (batchId: string, customerId: string, part: number): Promise<BatchLabels | null> => {
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from('shipment_batches')
    .select('id, reference')
    .eq('id', batchId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (!batch) return null;

  const { count, error: countError } = await supabase
    .from('shipments')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('customer_id', customerId);
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  if (total === 0) return { status: 'empty', reference: batch.reference };

  const parts = labelPartCount(total);
  const current = Math.min(Math.max(1, part), parts);
  const from = (current - 1) * LABELS_PER_PART;

  const { data: rows, error } = await supabase
    .from('shipments')
    .select(LABEL_COLUMNS)
    .eq('batch_id', batchId)
    .eq('customer_id', customerId)
    // The batch page's order.
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + LABELS_PER_PART - 1);
  if (error) throw new Error(error.message);
  const shipments = (rows ?? []) as unknown as LabelRow[];

  // The whole batch's tokens in one call — at most MERCHANT_BULK_MAX_ROWS
  // (1,000) short rows, within one PostgREST response. Filtering by this
  // part's ids would put up to 200 UUIDs in the request URL.
  const { data: tokenRows, error: tokenError } = await supabase.rpc('get_batch_qr_tokens', { p_batch_id: batchId });
  if (tokenError) throw new Error(tokenError.message);
  const tokens = new Map(((tokenRows ?? []) as { shipment_id: string; qr_token: string | null }[]).map((row) => [row.shipment_id, row.qr_token]));

  const failed: string[] = [];
  const labels: ShipmentLabelData[] = [];
  for (const shipment of shipments) {
    const token = tokens.get(shipment.id);
    if (!token) {
      failed.push(shipment.tracking_number);
      continue;
    }
    try {
      labels.push(await toLabelData(shipment, token));
    } catch (labelError) {
      console.error('Bulk label failed', shipment.tracking_number, labelError instanceof Error ? labelError.message : labelError);
      failed.push(shipment.tracking_number);
    }
  }

  // Never a partial set: a missing label is a parcel without one.
  if (failed.length > 0 || labels.length === 0) return { status: 'incomplete', reference: batch.reference, failed, total };
  return { status: 'ready', reference: batch.reference, labels, total, part: current, parts, first: from + 1 };
};
