import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { BRAND, COMPANY } from '@/lib/brand';
import { useFormat } from '@/i18n/hooks';

import type { ReactNode } from 'react';
import type { Invoice, InvoiceLine } from '@/lib/invoices/types';
import type { DeliveryType } from '@/lib/types';

// The printable invoice. Everything on it comes from the invoice's stored
// snapshot (migration 0031) — nothing is recalculated here. The bulk
// summary below only groups the stored lines for reading; the totals are
// the invoice's own.

type Format = ReturnType<typeof useFormat>;

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0" data-print-keep>
    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
    <dd className="mt-0.5 wrap-break-word">{children}</dd>
  </div>
);

const Money = ({ amount, currency, format }: { amount: number; currency: string; format: Format }) => (
  <span dir="ltr" className="font-brand-mono tabular-nums">
    {format.money(amount, currency)}
  </span>
);

const BilledToBlock = ({ invoice }: { invoice: Invoice }) => {
  const t = useTranslations('invoices');
  const b = invoice.billedTo;
  const place = [b.address, b.city, b.country].filter(Boolean).join(', ');
  return (
    <div className="min-w-0" data-print-keep>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('billedTo')}</h2>
      <p className="mt-1 text-base font-semibold wrap-break-word">{b.name}</p>
      {b.contactPerson && b.contactPerson !== b.name ? <p>{t('contactPerson', { name: b.contactPerson })}</p> : null}
      {place ? <p className="wrap-break-word">{place}</p> : null}
      {b.email ? <p dir="ltr" className="wrap-anywhere rtl:text-right">{b.email}</p> : null}
      {b.phone ? <p dir="ltr" className="rtl:text-right">{b.phone}</p> : null}
      {b.trn ? <p>{t('trn', { trn: b.trn })}</p> : null}
      {b.registrationNumber ? <p>{t('registration', { number: b.registrationNumber })}</p> : null}
      {b.licenseNumber ? <p>{t('license', { number: b.licenseNumber })}</p> : null}
      {b.accountHolder && b.accountHolder !== b.name && b.accountHolder !== b.contactPerson ? (
        <p className="text-neutral-600">{t('accountHolder', { name: b.accountHolder })}</p>
      ) : null}
    </div>
  );
};

const ShipmentDetails = ({ line, format }: { line: InvoiceLine; format: Format }) => {
  const t = useTranslations('invoices.shipment');
  const tShipments = useTranslations('shipments');
  return (
    <section aria-labelledby="invoice-shipment" className="flex flex-col gap-3">
      <h2 id="invoice-shipment" className="text-sm font-semibold uppercase tracking-wide">
        {t('heading')}
      </h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 print:grid-cols-3 print:gap-y-2 print:text-[9.5pt]">
        <Field label={t('tracking')}>
          <span dir="ltr" className="font-brand-mono font-semibold">
            {line.trackingNumber}
          </span>
        </Field>
        <Field label={t('booked')}>{format.dateTime(line.bookedAt)}</Field>
        <Field label={t('pickup')}>{line.pickupAddress}</Field>
        <Field label={t('delivery')}>
          {line.dropoffAddress}
          <span className="block text-neutral-600">{t('recipient')}: {line.recipientName}</span>
        </Field>
        <Field label={t('deliveryType')}>{line.deliveryType ? tShipments(`deliveryType.${line.deliveryType}.label`) : '—'}</Field>
        <Field label={t('parcelType')}>{tShipments(`packageType.${line.packageType}`)}</Field>
        <Field label={t('contents')}>{line.description || '—'}</Field>
        <Field label={t('quantity')}>{format.number(line.quantity)}</Field>
        <Field label={t('weight')}>{line.weightKg !== null ? format.kg(line.weightKg) : '—'}</Field>
        <Field label={t('distance')}>{format.km(line.distanceKm)}</Field>
        <Field label={t('payment')}>{tShipments(`paymentMethod.${line.paymentMethod}`)}</Field>
      </dl>
    </section>
  );
};

const ShipmentCharges = ({ line, format }: { line: InvoiceLine; format: Format }) => {
  const t = useTranslations('invoices.charges');
  // The stored breakdown when the shipment has one; older shipments only
  // stored their total, billed as one service charge.
  const rows: [string, number][] =
    line.baseCharge !== null && line.distanceCharge !== null
      ? [
          [t('base'), line.baseCharge],
          [t('distance'), line.distanceCharge],
        ]
      : [[t('service'), line.serviceCharge]];
  if (line.weightCharge > 0) rows.push([t('weight'), line.weightCharge]);
  if (line.codCharge > 0) rows.push([t('cod'), line.codCharge]);

  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-start text-sm font-semibold uppercase tracking-wide">{t('heading')}</caption>
      <thead>
        <tr className="border-b border-neutral-300 text-xs uppercase tracking-wide text-neutral-500">
          <th scope="col" className="py-2 text-start font-medium">
            {t('description')}
          </th>
          <th scope="col" className="py-2 text-end font-medium">
            {t('amount')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, amount]) => (
          <tr key={label} className="border-b border-neutral-200">
            <td className="py-2">{label}</td>
            <td className="py-2 text-end">
              <Money amount={amount} currency={line.currency} format={format} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const BulkDetails = ({ invoice, format }: { invoice: Invoice; format: Format }) => {
  const t = useTranslations('invoices.bulk');
  const tShipments = useTranslations('shipments');
  const booked = invoice.lines.map((line) => line.bookedAt).sort();
  const first = booked[0];
  const last = booked[booked.length - 1];
  // Lines grouped by service, for reading only.
  const byService = new Map<DeliveryType | 'other', { count: number; amount: number }>();
  for (const line of invoice.lines) {
    const key = line.deliveryType ?? 'other';
    const entry = byService.get(key) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount = Math.round((entry.amount + line.amount) * 100) / 100;
    byService.set(key, entry);
  }

  return (
    <section aria-labelledby="invoice-bulk" className="flex flex-col gap-3">
      <h2 id="invoice-bulk" className="text-sm font-semibold uppercase tracking-wide">
        {t('heading')}
      </h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 print:grid-cols-3 print:gap-y-2 print:text-[9.5pt]">
        <Field label={t('reference')}>
          <span dir="ltr" className="font-brand-mono font-semibold">
            {invoice.reference}
          </span>
        </Field>
        {invoice.batchName ? <Field label={t('name')}>{invoice.batchName}</Field> : null}
        <Field label={t('shipments')}>{t('shipmentsCount', { count: invoice.shipmentCount })}</Field>
        {first ? (
          <Field label={t('period')}>
            {format.date(first) === format.date(last) ? format.date(first) : `${format.date(first)} – ${format.date(last)}`}
          </Field>
        ) : null}
        {invoice.pickupAddress ? <Field label={t('pickup')}>{invoice.pickupAddress}</Field> : null}
        <Field label={t('summary')}>
          <ul>
            {[...byService].map(([service, { count, amount }]) => (
              <li key={service}>
                {t('summaryLine', {
                  service: service === 'other' ? '—' : tShipments(`deliveryType.${service}.label`),
                  count,
                })}{' '}
                · <Money amount={amount} currency={invoice.currency} format={format} />
              </li>
            ))}
          </ul>
        </Field>
      </dl>
    </section>
  );
};

// One compact row per shipment. On a phone the less important columns
// step aside (they're all on the printed copy), so the table never needs
// sideways scrolling.
const BulkLines = ({ invoice, format }: { invoice: Invoice; format: Format }) => {
  const t = useTranslations('invoices.bulk');
  const tShipments = useTranslations('shipments');
  const secondary = 'hidden md:table-cell print:table-cell';
  return (
    <table className="w-full table-fixed text-xs sm:text-sm print:text-[8.5pt]">
      <caption className="mb-2 text-start text-sm font-semibold uppercase tracking-wide">{t('lines')}</caption>
      <thead>
        <tr className="border-b border-neutral-300 text-[0.6875rem] uppercase tracking-wide text-neutral-500">
          <th scope="col" className="w-8 py-2 text-start font-medium">
            {t('col.line')}
          </th>
          <th scope="col" className="w-24 py-2 text-start font-medium sm:w-28">
            {t('col.tracking')}
          </th>
          <th scope="col" className={`w-24 py-2 text-start font-medium ${secondary}`}>
            {t('col.booked')}
          </th>
          <th scope="col" className="py-2 text-start font-medium">
            {t('col.deliverTo')}
          </th>
          <th scope="col" className={`w-20 py-2 text-start font-medium ${secondary}`}>
            {t('col.service')}
          </th>
          <th scope="col" className={`w-16 py-2 text-end font-medium ${secondary}`}>
            {t('col.weight')}
          </th>
          <th scope="col" className={`w-16 py-2 text-end font-medium ${secondary}`}>
            {t('col.distance')}
          </th>
          <th scope="col" className="w-20 py-2 text-end font-medium sm:w-24">
            {t('col.amount')}
          </th>
        </tr>
      </thead>
      <tbody>
        {invoice.lines.map((line) => (
          <tr key={line.lineNumber} className="border-b border-neutral-200 align-top">
            <td className="py-1.5 text-neutral-500 tabular-nums">{line.lineNumber}</td>
            <td dir="ltr" className="py-1.5 font-brand-mono rtl:text-right">
              {line.trackingNumber}
            </td>
            <td className={`py-1.5 ${secondary}`}>{format.date(line.bookedAt)}</td>
            <td className="py-1.5 pe-2">
              <span className="block font-medium wrap-break-word">{line.recipientName}</span>
              <span className="block text-neutral-600 wrap-break-word">{line.dropoffAddress}</span>
            </td>
            <td className={`py-1.5 ${secondary}`}>{line.deliveryType ? tShipments(`deliveryType.${line.deliveryType}.label`) : '—'}</td>
            <td className={`py-1.5 text-end ${secondary}`}>{line.weightKg !== null ? format.kg(line.weightKg) : '—'}</td>
            <td className={`py-1.5 text-end ${secondary}`}>{format.km(line.distanceKm)}</td>
            <td className="py-1.5 text-end">
              <Money amount={line.amount} currency={line.currency} format={format} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const Totals = ({ invoice, format }: { invoice: Invoice; format: Format }) => {
  const t = useTranslations('invoices.totals');
  const row = (label: string, amount: number, strong = false) => (
    <div className={`flex items-baseline justify-between gap-6 py-1.5 ${strong ? 'border-t-2 border-neutral-900 pt-2 text-base font-bold' : ''}`}>
      <dt>{label}</dt>
      <dd>
        <Money amount={amount} currency={invoice.currency} format={format} />
      </dd>
    </div>
  );
  return (
    <div className="flex flex-col items-end gap-2" data-print-keep>
      <dl className="w-full text-sm sm:w-80">
        {row(t('subtotal'), invoice.subtotal)}
        {invoice.additionalCharges > 0 ? row(t('additional'), invoice.additionalCharges) : null}
        {invoice.discountTotal > 0 ? row(t('discount'), -invoice.discountTotal) : null}
        {row(t('total'), invoice.total, true)}
      </dl>
      <p className="text-xs text-neutral-500">{t('currency', { currency: invoice.currency })}</p>
    </div>
  );
};

const InvoiceDocument = ({ invoice }: { invoice: Invoice }) => {
  const t = useTranslations('invoices');
  const format = useFormat();
  const isBulk = invoice.type === 'bulk_shipment';
  const isVoid = invoice.status === 'void';
  const [line] = invoice.lines;

  return (
    <article
      data-print-document
      aria-label={`${t('title')} ${invoice.invoiceNumber}`}
      className="mx-auto flex w-full max-w-4xl flex-col gap-8 rounded-2xl border bg-white p-5 text-sm text-neutral-900 shadow-sm sm:p-10 print:gap-4 print:text-[9.5pt]"
    >
      <header className="flex flex-col gap-6 border-b-2 border-neutral-900 pb-6 print:pb-3 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Image src={BRAND.logoSrc} alt={BRAND.name} width={BRAND.logoWidth} height={BRAND.logoHeight} priority className="h-auto w-40 print:w-[42mm]" />
          <div>
            <p className="font-semibold">{COMPANY.name}</p>
            <p className="text-neutral-600">{t('companyTagline')}</p>
            <p dir="ltr" className="text-neutral-600 rtl:text-right">
              {COMPANY.email} · {COMPANY.phone} · {COMPANY.website}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end sm:text-end print:items-end print:text-end">
          <p className="flex items-center gap-2 text-3xl font-bold uppercase tracking-wide">
            {t('title')}
            {isVoid ? (
              <span className="rounded-md border-2 border-red-700 px-2 py-0.5 text-base text-red-700">{t('voidBadge')}</span>
            ) : null}
          </p>
          <p className="text-neutral-600">{t(`types.${invoice.type}`)}</p>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-start">
            <dt className="text-neutral-500">{t('number')}</dt>
            <dd dir="ltr" className="font-brand-mono font-semibold rtl:text-right">
              {invoice.invoiceNumber}
            </dd>
            <dt className="text-neutral-500">{t('issued')}</dt>
            <dd>{format.date(invoice.issuedAt)}</dd>
          </dl>
        </div>
      </header>

      {isVoid && invoice.voidedAt ? (
        <p role="note" className="rounded-lg border border-red-700/40 bg-red-50 p-3 text-red-800">
          {t('voidNotice', { date: format.date(invoice.voidedAt) })}
        </p>
      ) : null}

      <BilledToBlock invoice={invoice} />

      {isBulk ? <BulkDetails invoice={invoice} format={format} /> : line ? <ShipmentDetails line={line} format={format} /> : null}

      {isBulk ? <BulkLines invoice={invoice} format={format} /> : line ? <ShipmentCharges line={line} format={format} /> : null}

      <Totals invoice={invoice} format={format} />

      <footer className="flex flex-col gap-1 border-t border-neutral-300 pt-4 text-xs text-neutral-600" data-print-keep>
        <p>{t('footer')}</p>
        <p>{t('questions', { email: COMPANY.email, phone: COMPANY.phone })}</p>
      </footer>
    </article>
  );
};

export default InvoiceDocument;
