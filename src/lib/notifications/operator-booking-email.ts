import { BRAND, COMPANY } from '@/lib/brand';
import { isUuid } from '@/lib/security/validate';

// The "new booking" email to the operations inbox (migration 0043,
// services/notifications/operator-booking-emails.ts). Pure rendering: the
// caller loads the booking with the service-role client and passes plain
// values in. Every value is escaped; a missing one leaves its row out
// rather than printing "undefined". English only — it goes to staff.

export type BookingAccountType = 'individual' | 'merchant';

type Customer = {
  accountType: BookingAccountType;
  name: string | null;
  companyName: string | null;
  phone: string | null;
};

export type OperatorShipmentEmailData = {
  id: string;
  trackingNumber: string;
  customer: Customer;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
  deliveryType: string | null;
  deliveryDate: string | null;
  pickupAddress: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  dropoffAddress: string | null;
  packageType: string | null;
  packageDescription: string | null;
  packageQuantity: number | null;
  isFragile: boolean;
  createdAt: string;
};

export type OperatorBatchShipment = {
  id: string;
  trackingNumber: string;
  dropoffAddress: string | null;
  deliveryType: string | null;
  status: string;
};

export type OperatorBatchEmailData = {
  id: string;
  reference: string;
  customer: Customer;
  pickupAddress: string | null;
  pickupDate: string | null;
  paymentMethod: string | null;
  createdAt: string;
  shipmentCount: number;
  rowsFailed: number;
  // The first few shipments; the rest are on the batch page.
  shipments: OperatorBatchShipment[];
};

export type RenderedEmail = { subject: string; text: string; html: string; actionUrl: string };

export const MAX_LISTED_BATCH_SHIPMENTS = 25;

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Header values can't carry line breaks.
const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

const present = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim() !== '';

// "pending_payment" → "Pending payment"
export const humanize = (value: string) => {
  const words = value.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const PAYMENT_METHOD_LABELS: Record<string, string> = { cod: 'Cash', card: 'Card' };
const paymentMethodLabel = (value: string) => PAYMENT_METHOD_LABELS[value] ?? humanize(value);

const accountTypeLabel = (type: BookingAccountType) => (type === 'merchant' ? 'Merchant' : 'Individual');

export const formatUaeDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' }).format(date)} (UAE)`;
};

const formatDate = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium' }).format(date);
};

// Only an id we generated, under the app's own origin: never a URL that
// came from data.
const dashboardUrl = (origin: string, path: 'shipments' | 'bulk', id: string) => {
  if (!isUuid(id)) throw new Error('Invalid id for an email link');
  return new URL(`/dashboard/operator/${path}/${id}`, origin).toString();
};

type Row = [label: string, value: string | null | undefined];

const customerName = (customer: Customer) =>
  customer.accountType === 'merchant' && present(customer.companyName)
    ? present(customer.name) && customer.name !== customer.companyName
      ? `${customer.companyName} (${customer.name})`
      : customer.companyName
    : customer.name;

const someone = (customer: Customer) => (customer.accountType === 'merchant' ? 'A merchant' : 'An individual customer');

const customerRows = (customer: Customer): Row[] => [
  ['Account type', accountTypeLabel(customer.accountType)],
  [customer.accountType === 'merchant' ? 'Merchant' : 'Customer', customerName(customer)],
  ['Customer phone', customer.phone],
];

const keep = (rows: Row[]) => rows.filter((row): row is [string, string] => present(row[1]));

// ── HTML ────────────────────────────────────────────────────────────────────

const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MUTED = '#6b6776';
const BORDER = '#e5e2ea';

const htmlRows = (rows: [string, string][]) =>
  rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid ${BORDER};color:${MUTED};font-size:13px;vertical-align:top;width:38%">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-size:14px;vertical-align:top;word-break:break-word">${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');

const section = (title: string, rows: [string, string][]) =>
  rows.length === 0
    ? ''
    : `<h2 style="margin:28px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.purple}">${escapeHtml(title)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${htmlRows(rows)}</table>`;

const layout = ({
  preheader,
  badge,
  heading,
  intro,
  body,
  actionLabel,
  actionUrl,
}: {
  preheader: string;
  badge: string;
  heading: string;
  intro: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f2f8;${FONT};color:#1d1a24">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER}">
<tr><td style="background:${BRAND.purple};padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.01em">${escapeHtml(COMPANY.name)} <span style="font-weight:400;opacity:.85;font-size:13px">· Operations</span></td></tr>
<tr><td style="padding:28px">
<span style="display:inline-block;background:#efe6f6;color:${BRAND.purple};font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px">${escapeHtml(badge)}</span>
<h1 style="margin:14px 0 8px;font-size:22px;line-height:1.3">${escapeHtml(heading)}</h1>
<p style="margin:0;color:${MUTED};font-size:14px;line-height:1.6">${escapeHtml(intro)}</p>
${body}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 8px"><tr><td style="border-radius:8px;background:${BRAND.purple}"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(actionLabel)}</a></td></tr></table>
<p style="margin:12px 0 0;color:${MUTED};font-size:12px;line-height:1.5">Or open: <a href="${escapeHtml(actionUrl)}" style="color:${BRAND.teal};word-break:break-all">${escapeHtml(actionUrl)}</a><br>You'll need to sign in with an operator account.</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;line-height:1.5">Sent automatically to the ${escapeHtml(COMPANY.name)} operations notification address when a customer books. Replies are not monitored.</td></tr>
</table></td></tr></table></body></html>`;

const textBlock = (title: string, rows: [string, string][]) =>
  rows.length === 0 ? '' : `\n${title.toUpperCase()}\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n`;

// ── Single shipment ─────────────────────────────────────────────────────────

export const renderShipmentEmail = (data: OperatorShipmentEmailData, origin: string): RenderedEmail => {
  const type = accountTypeLabel(data.customer.accountType);
  const actionUrl = dashboardUrl(origin, 'shipments', data.id);
  const subject = oneLine(`New ${type} Shipment — ${data.trackingNumber}`);

  const shipment = keep([
    ['Tracking number', data.trackingNumber],
    ['Shipment ID', data.id],
    ['Status', humanize(data.status)],
    ['Booked at', formatUaeDateTime(data.createdAt)],
  ]);
  const customer = keep(customerRows(data.customer));
  const route = keep([
    ['Pickup', data.pickupAddress],
    ['Pickup contact', [data.pickupContactName, data.pickupContactPhone].filter(present).join(' · ')],
    ['Delivery', data.dropoffAddress],
    ['Delivery type', present(data.deliveryType) ? humanize(data.deliveryType) : null],
    ['Delivery date', present(data.deliveryDate) ? formatDate(data.deliveryDate) : null],
  ]);
  const parcel = keep([
    ['Parcel type', present(data.packageType) ? humanize(data.packageType) + (data.isFragile ? ' (fragile)' : '') : null],
    ['Description', data.packageDescription],
    ['Quantity', data.packageQuantity != null && data.packageQuantity > 0 ? String(data.packageQuantity) : null],
  ]);
  const payment = keep([
    ['Payment method', present(data.paymentMethod) ? paymentMethodLabel(data.paymentMethod) : null],
    ['Payment status', present(data.paymentStatus) ? humanize(data.paymentStatus) : null],
  ]);

  const intro = `${customerName(data.customer) ?? someone(data.customer)} booked a shipment.`;
  const html = layout({
    preheader: `${data.trackingNumber} · ${data.pickupAddress ?? ''} → ${data.dropoffAddress ?? ''}`,
    badge: `${type} shipment`,
    heading: `New shipment ${data.trackingNumber}`,
    intro,
    body: [
      section('Shipment', shipment),
      section('Customer', customer),
      section('Route', route),
      section('Parcel', parcel),
      section('Payment', payment),
    ].join(''),
    actionLabel: 'View Shipment',
    actionUrl,
  });
  const text = [
    `New ${type.toLowerCase()} shipment ${data.trackingNumber}`,
    intro,
    textBlock('Shipment', shipment) + textBlock('Customer', customer) + textBlock('Route', route) + textBlock('Parcel', parcel) + textBlock('Payment', payment),
    `View shipment: ${actionUrl}`,
  ].join('\n');

  return { subject, text, html, actionUrl };
};

// ── Batch (multi-shipment booking or merchant bulk list) ────────────────────

export const renderBatchEmail = (data: OperatorBatchEmailData, origin: string): RenderedEmail => {
  const type = accountTypeLabel(data.customer.accountType);
  const kind = data.customer.accountType === 'merchant' ? 'Bulk Booking' : 'Multi-shipment Booking';
  const count = `${data.shipmentCount} shipment${data.shipmentCount === 1 ? '' : 's'}`;
  const actionUrl = dashboardUrl(origin, 'bulk', data.id);
  const subject = oneLine(`New ${type} ${kind} — ${data.reference} (${count})`);

  const summary = keep([
    ['Booking reference', data.reference],
    ['Batch ID', data.id],
    ['Shipments booked', String(data.shipmentCount)],
    ['Rows not booked', data.rowsFailed > 0 ? String(data.rowsFailed) : null],
    ['Booked at', formatUaeDateTime(data.createdAt)],
    ['Pickup', data.pickupAddress],
    ['Pickup date', present(data.pickupDate) ? formatDate(data.pickupDate) : null],
    ['Payment method', present(data.paymentMethod) ? paymentMethodLabel(data.paymentMethod) : null],
  ]);
  const customer = keep(customerRows(data.customer));

  const listed = data.shipments.slice(0, MAX_LISTED_BATCH_SHIPMENTS);
  const more = data.shipmentCount - listed.length;
  const listHtml =
    listed.length === 0
      ? ''
      : `<h2 style="margin:28px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.purple}">Shipments</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${listed
          .map(
            (s) =>
              `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid ${BORDER};font-size:14px;white-space:nowrap;vertical-align:top"><a href="${escapeHtml(dashboardUrl(origin, 'shipments', s.id))}" style="color:${BRAND.teal};font-weight:600;text-decoration:none">${escapeHtml(s.trackingNumber)}</a></td><td style="padding:9px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${MUTED};vertical-align:top;word-break:break-word">${escapeHtml(
                [s.dropoffAddress, present(s.deliveryType) ? humanize(s.deliveryType) : null].filter(present).join(' · '),
              )}</td></tr>`,
          )
          .join('')}</table>${more > 0 ? `<p style="margin:10px 0 0;color:${MUTED};font-size:13px">…and ${more} more on the booking page.</p>` : ''}`;

  const intro = `${customerName(data.customer) ?? someone(data.customer)} booked ${count} in one ${data.customer.accountType === 'merchant' ? 'bulk list' : 'booking'}.`;
  const html = layout({
    preheader: `${data.reference} · ${count}`,
    badge: `${type} · ${count}`,
    heading: `New booking ${data.reference}`,
    intro,
    body: [section('Booking', summary), section('Customer', customer), listHtml].join(''),
    actionLabel: 'View Shipments',
    actionUrl,
  });
  const text = [
    `New ${type.toLowerCase()} booking ${data.reference} (${count})`,
    intro,
    textBlock('Booking', summary) + textBlock('Customer', customer),
    listed.length > 0
      ? `SHIPMENTS\n${listed.map((s) => `${s.trackingNumber}  ${dashboardUrl(origin, 'shipments', s.id)}`).join('\n')}${more > 0 ? `\n…and ${more} more` : ''}\n`
      : '',
    `View booking: ${actionUrl}`,
  ].join('\n');

  return { subject, text, html, actionUrl };
};
