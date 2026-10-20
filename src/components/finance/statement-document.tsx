import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { BRAND, COMPANY } from '@/lib/brand';
import { balanceLabel, statementSummary, statementTotal } from '@/lib/finance/statements';
import { useFormat } from '@/i18n/hooks';

import type { ReactNode } from 'react';
import type { Statement } from '@/lib/finance/statements';

// The printable merchant account statement. Everything on it is the
// statement's stored snapshot (migration 0044); the summary and the final
// figure are arranged by statementSummary()/statementTotal() — the same
// functions the PDF uses — so preview, portal and PDF always agree.

type Format = ReturnType<typeof useFormat>;

const Money = ({ amount, currency, format, sign = '' }: { amount: number; currency: string; format: Format; sign?: '' | '+' | '-' }) => (
  <span dir="ltr" className="font-brand-mono tabular-nums whitespace-nowrap">
    {sign === '-' && amount > 0 ? '− ' : sign === '+' && amount > 0 ? '+ ' : ''}
    {format.money(amount, currency)}
  </span>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0" data-print-keep>
    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
    <dd className="mt-0.5 wrap-break-word">{children}</dd>
  </div>
);

const percent = (rate: number) => `${Math.round(rate * 10000) / 100}%`;

const MerchantBlock = ({ statement }: { statement: Statement }) => {
  const t = useTranslations('finance.document');
  const m = statement.merchant;
  const place = [m.address, m.city, m.country].filter(Boolean).join(', ');
  return (
    <div className="min-w-0" data-print-keep>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('statementFor')}</h2>
      <p className="mt-1 text-base font-semibold wrap-break-word">{m.name}</p>
      {m.contactPerson ? <p>{t('contactPerson', { name: m.contactPerson })}</p> : null}
      {place ? <p className="wrap-break-word">{place}</p> : null}
      {m.email ? <p dir="ltr" className="wrap-anywhere rtl:text-right">{m.email}</p> : null}
      {m.phone ? <p dir="ltr" className="rtl:text-right">{m.phone}</p> : null}
      {m.trn ? <p>{t('trn', { trn: m.trn })}</p> : null}
      {m.licenseNumber ? <p>{t('license', { number: m.licenseNumber })}</p> : null}
      <p className="text-neutral-600">
        {t('accountId')}{' '}
        <span dir="ltr" className="font-brand-mono">
          {statement.businessAccountId.slice(0, 8).toUpperCase()}
        </span>
      </p>
    </div>
  );
};

const Lines = ({ statement, format, shipmentHref }: { statement: Statement; format: Format; shipmentHref?: (id: string) => string }) => {
  const t = useTranslations('finance.document.lines');
  const tShipments = useTranslations('shipments');
  const cod = statement.kind === 'cod_remittance';
  // No cash-handling charge since migration 0051: its column appears only on
  // a statement issued before then that carries one.
  const handling = cod && statement.cashHandlingFee > 0;
  const secondary = 'hidden md:table-cell print:table-cell';
  const totals = statement.lines.reduce(
    (sum, line) => ({
      cod: sum.cod + Math.round(line.codCollected * 100),
      service: sum.service + Math.round(line.serviceCharge * 100),
      returns: sum.returns + Math.round(line.returnCharge * 100),
      handling: sum.handling + Math.round(line.cashHandlingFee * 100),
      paid: sum.paid + Math.round(line.paymentsReceived * 100),
    }),
    { cod: 0, service: 0, returns: 0, handling: 0, paid: 0 },
  );
  const money = (cents: number) => <Money amount={cents / 100} currency={statement.currency} format={format} />;

  return (
    <div className="-mx-1 overflow-x-auto px-1 print:overflow-visible">
      <table className="w-full min-w-xl text-xs sm:text-sm md:min-w-0 print:min-w-0 print:text-[8pt]">
        <caption className="mb-2 text-start text-sm font-semibold uppercase tracking-wide">{t('heading')}</caption>
        <thead>
          <tr className="border-b border-neutral-300 text-[0.6875rem] uppercase tracking-wide text-neutral-500">
            <th scope="col" className="py-2 pe-2 text-start font-medium">{t('col.no')}</th>
            <th scope="col" className="py-2 pe-2 text-start font-medium">{t('col.date')}</th>
            <th scope="col" className="py-2 pe-2 text-start font-medium">{t('col.tracking')}</th>
            <th scope="col" className={`py-2 pe-2 text-start font-medium ${secondary}`}>{t('col.recipient')}</th>
            <th scope="col" className={`py-2 pe-2 text-start font-medium ${secondary}`}>{t('col.type')}</th>
            <th scope="col" className="py-2 pe-2 text-start font-medium">{t('col.status')}</th>
            {cod ? <th scope="col" className="py-2 ps-2 text-end font-medium">{t('col.cod')}</th> : null}
            <th scope="col" className="py-2 ps-2 text-end font-medium">{t('col.service')}</th>
            <th scope="col" className="py-2 ps-2 text-end font-medium">{t('col.return')}</th>
            {handling ? <th scope="col" className="py-2 ps-2 text-end font-medium">{t('col.handling')}</th> : null}
            <th scope="col" className="py-2 ps-2 text-end font-medium">{t('col.paid')}</th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.map((line) => (
            <tr key={line.lineNumber} className="border-b border-neutral-200 align-top">
              <td className="py-1.5 pe-2 text-neutral-500 tabular-nums">{line.lineNumber}</td>
              <td className="py-1.5 pe-2 whitespace-nowrap">{format.date(line.eventAt)}</td>
              <td dir="ltr" className="py-1.5 pe-2 font-brand-mono rtl:text-right">
                {shipmentHref ? (
                  <Link href={shipmentHref(line.shipmentId)} className="underline-offset-2 hover:underline print:no-underline">
                    {line.trackingNumber}
                  </Link>
                ) : (
                  line.trackingNumber
                )}
              </td>
              <td className={`py-1.5 pe-2 wrap-break-word ${secondary}`}>{line.recipientName}</td>
              <td className={`py-1.5 pe-2 ${secondary}`}>{line.deliveryType ? tShipments(`deliveryType.${line.deliveryType}.label`) : '—'}</td>
              <td className="py-1.5 pe-2">
                {t(line.event)}
                {line.codUnverified > 0 || line.codUncollected > 0 ? (
                  <span className="block text-[0.6875rem] text-amber-700">{t('codFlag')}</span>
                ) : null}
              </td>
              {cod ? (
                <td className="py-1.5 ps-2 text-end">
                  <Money amount={line.codCollected} currency={line.currency} format={format} />
                </td>
              ) : null}
              <td className="py-1.5 ps-2 text-end">
                <Money amount={line.serviceCharge} currency={line.currency} format={format} />
              </td>
              <td className="py-1.5 ps-2 text-end">
                <Money amount={line.returnCharge} currency={line.currency} format={format} />
              </td>
              {handling ? (
                <td className="py-1.5 ps-2 text-end">
                  <Money amount={line.cashHandlingFee} currency={line.currency} format={format} />
                </td>
              ) : null}
              <td className="py-1.5 ps-2 text-end">
                <Money amount={line.paymentsReceived} currency={line.currency} format={format} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-900 font-semibold">
            {/* Recipient and service step aside on a phone: 4 leading columns there, 6 otherwise. */}
            <th scope="row" colSpan={4} className="py-2 text-start md:hidden print:hidden">
              {t('totals')}
            </th>
            <th scope="row" colSpan={6} className="hidden py-2 text-start md:table-cell print:table-cell">
              {t('totals')}
            </th>
            {cod ? <td className="py-2 ps-2 text-end">{money(totals.cod)}</td> : null}
            <td className="py-2 ps-2 text-end">{money(totals.service)}</td>
            <td className="py-2 ps-2 text-end">{money(totals.returns)}</td>
            {handling ? <td className="py-2 ps-2 text-end">{money(totals.handling)}</td> : null}
            <td className="py-2 ps-2 text-end">{money(totals.paid)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const Calculation = ({ statement, format }: { statement: Statement; format: Format }) => {
  const t = useTranslations('finance.document');
  const rows = statementSummary(statement);
  const total = statementTotal(statement);
  const label = (key: (typeof rows)[number]['key']) =>
    key === 'cashHandlingFee'
      ? t(statement.ratesVary ? 'summary.cashHandlingFeeVaried' : 'summary.cashHandlingFee', {
          rate: percent(statement.cashHandlingRate),
          base: format.money(statement.cashHandlingBase, statement.currency),
        })
      : t(`summary.${statement.kind === 'service_charges' && key === 'paymentsReceived' ? 'paymentsReceivedDeducted' : key}`);

  return (
    <section aria-labelledby="statement-calculation" className="flex flex-col items-end gap-3" data-print-keep>
      <h2 id="statement-calculation" className="w-full text-sm font-semibold uppercase tracking-wide">
        {t(`summary.heading.${statement.kind}`)}
      </h2>
      <dl className="w-full text-sm sm:w-[28rem]">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-6 border-b border-neutral-200 py-1.5">
            <dt>{label(row.key)}</dt>
            <dd>
              <Money amount={row.amount} currency={statement.currency} format={format} sign={row.sign} />
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-6 border-t-2 border-neutral-900 pt-2 text-base font-bold uppercase">
          <dt>{t(`total.${total.label}`)}</dt>
          <dd>
            <Money amount={total.amount} currency={statement.currency} format={format} />
          </dd>
        </div>
      </dl>
      <p className="w-full text-sm sm:w-[28rem]" data-testid="amount-in-words">
        <span className="font-semibold">{t('words')}</span> <span dir="ltr">{total.words}</span>
      </p>
    </section>
  );
};

// Money that has changed hands for this statement, and what is left. Not
// part of the frozen statement — it grows as payments are recorded — so it
// is dated. Payments recorded on a statement this one corrected count too.
const Settlements = ({ statement, format }: { statement: Statement; format: Format }) => {
  const t = useTranslations('finance.document.settlements');
  const label = balanceLabel(statement.balance);
  return (
    <section aria-labelledby="statement-settlements" className="flex flex-col gap-2" data-print-keep>
      <h2 id="statement-settlements" className="text-sm font-semibold uppercase tracking-wide">
        {t('heading', { date: format.date(new Date().toISOString()) })}
      </h2>
      {statement.settlements.length === 0 ? (
        <p className="text-neutral-600">{t('none')}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 print:overflow-visible">
          <table className="w-full min-w-md text-xs sm:text-sm print:min-w-0 print:text-[8pt]">
            <thead>
              <tr className="border-b border-neutral-300 text-[0.6875rem] uppercase tracking-wide text-neutral-500">
                <th scope="col" className="py-2 pe-2 text-start font-medium">{t('col.date')}</th>
                <th scope="col" className="py-2 pe-2 text-start font-medium">{t('col.direction')}</th>
                <th scope="col" className="py-2 pe-2 text-start font-medium">{t('col.method')}</th>
                <th scope="col" className="py-2 pe-2 text-start font-medium">{t('col.reference')}</th>
                <th scope="col" className="py-2 ps-2 text-end font-medium">{t('col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {statement.settlements.map((s) => (
                <tr key={s.id} className={`border-b border-neutral-200 align-top ${s.status === 'void' ? 'text-neutral-400 line-through' : ''}`}>
                  <td className="py-1.5 pe-2 whitespace-nowrap">{format.calendarDate(s.paidOn)}</td>
                  <td className="py-1.5 pe-2">
                    {t(s.direction === 'to_merchant' ? 'toMerchant' : 'fromMerchant')}
                    {s.status === 'void' ? <span className="ms-1 no-underline">({t('void')})</span> : null}
                    {s.statementId !== statement.id && s.statementNumber ? (
                      <span className="block text-[0.6875rem] text-neutral-500 no-underline">{t('recordedOn', { number: s.statementNumber })}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pe-2">{t(`methods.${s.method}`)}</td>
                  <td className="py-1.5 pe-2 wrap-anywhere">{s.reference ?? '—'}</td>
                  <td className="py-1.5 ps-2 text-end">
                    <Money amount={s.amount} currency={statement.currency} format={format} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-6 self-end text-sm font-semibold sm:w-[28rem]">
        <span>{t(`balance.${label}`)}</span>
        <Money amount={Math.abs(statement.balance.balance)} currency={statement.currency} format={format} />
      </div>
    </section>
  );
};

const Notes = ({ statement, format }: { statement: Statement; format: Format }) => {
  const t = useTranslations('finance.document.notes');
  const money = (amount: number) => format.money(amount, statement.currency);
  return (
    <section aria-labelledby="statement-notes" className="flex flex-col gap-1.5 text-xs text-neutral-600" data-print-keep>
      <h2 id="statement-notes" className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
        {t('heading')}
      </h2>
      <p>{t('basis')}</p>
      <p>{t('serviceRule')}</p>
      <p>{t('returnRule', { rate: percent(statement.returnChargeRate) })}</p>
      {statement.kind === 'cod_remittance' && statement.cashHandlingFee > 0 ? (
        <p>{t('handlingRule', { rate: percent(statement.cashHandlingRate) })}</p>
      ) : null}
      {statement.ratesVary ? <p>{t('ratesVary')}</p> : null}
      <p>{t('paidRule')}</p>
      {statement.codAlreadyRemitted > 0 ? <p>{t('remittedRule')}</p> : null}
      {statement.codUnverified > 0 ? <p className="text-amber-800">{t('unverified', { amount: money(statement.codUnverified) })}</p> : null}
      {statement.codUncollected > 0 ? <p className="text-amber-800">{t('uncollected', { amount: money(statement.codUncollected) })}</p> : null}
      {statement.feesUnverified > 0 ? <p className="text-amber-800">{t('feesUnverified', { amount: money(statement.feesUnverified) })}</p> : null}
    </section>
  );
};

const StatementDocument = ({ statement, shipmentHref }: { statement: Statement; shipmentHref?: (id: string) => string }) => {
  const t = useTranslations('finance.document');
  const format = useFormat();
  const isDraft = statement.status === 'draft';
  const isSuperseded = statement.status === 'superseded';

  return (
    <article
      data-print-document
      aria-label={`${t('title')} ${statement.statementNumber ?? t('draftNumber')}`}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 rounded-2xl border bg-white p-5 text-sm text-neutral-900 shadow-sm sm:p-10 print:gap-4 print:text-[9pt]"
    >
      <header className="flex flex-col gap-6 border-b-2 border-neutral-900 pb-6 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between print:pb-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Image src={BRAND.logoSrc} alt={BRAND.name} width={BRAND.logoWidth} height={BRAND.logoHeight} priority className="h-auto w-40 print:w-[42mm]" />
          <div>
            <p className="font-semibold">{COMPANY.name}</p>
            <p dir="ltr" className="text-neutral-600 rtl:text-right">
              {COMPANY.email} · {COMPANY.phone} · {COMPANY.website}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end sm:text-end print:items-end print:text-end">
          <p className="flex flex-wrap items-center gap-2 text-2xl font-bold uppercase tracking-wide sm:justify-end sm:text-3xl">
            {t('title')}
            {isDraft ? <span className="rounded-md border-2 border-amber-600 px-2 py-0.5 text-base text-amber-700">{t('draftBadge')}</span> : null}
            {isSuperseded ? (
              <span className="rounded-md border-2 border-red-700 px-2 py-0.5 text-base text-red-700">{t('supersededBadge')}</span>
            ) : null}
          </p>
          <p className="text-neutral-600">{t(`kind.${statement.kind}`)}</p>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-start">
            <dt className="text-neutral-500">{t('number')}</dt>
            <dd dir="ltr" className="font-brand-mono font-semibold rtl:text-right">
              {statement.statementNumber ?? t('draftNumber')}
            </dd>
            <dt className="text-neutral-500">{t('period')}</dt>
            <dd>
              {format.calendarDate(statement.periodStart)} – {format.calendarDate(statement.periodEnd)}
            </dd>
            <dt className="text-neutral-500">{statement.publishedAt ? t('published') : t('generated')}</dt>
            <dd>{format.date(statement.publishedAt ?? statement.generatedAt)}</dd>
            <dt className="text-neutral-500">{t('currency')}</dt>
            <dd>{statement.currency}</dd>
          </dl>
        </div>
      </header>

      {isDraft ? (
        <p role="note" className="rounded-lg border border-amber-600/40 bg-amber-50 p-3 text-amber-900 print:hidden">
          {t('draftNotice')}
        </p>
      ) : null}
      {isSuperseded ? (
        <p role="note" className="rounded-lg border border-red-700/40 bg-red-50 p-3 text-red-800">
          {t('supersededNotice', {
            number: statement.supersededByNumber ?? '—',
            date: statement.supersededAt ? format.date(statement.supersededAt) : '—',
          })}
        </p>
      ) : null}
      {statement.correctionReason ? (
        <p role="note" className="rounded-lg border border-neutral-300 bg-neutral-50 p-3">
          {t('correctionNotice', { number: statement.supersedesNumber ?? '—', reason: statement.correctionReason })}
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
        <MerchantBlock statement={statement} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 self-start text-sm sm:justify-self-end">
          <Field label={t('overview.delivered')}>{format.number(statement.deliveredCount)}</Field>
          <Field label={t('overview.returned')}>{format.number(statement.returnedCount)}</Field>
          {statement.kind === 'cod_remittance' ? (
            <Field label={t('overview.cod')}>
              <Money amount={statement.totalCod} currency={statement.currency} format={format} />
            </Field>
          ) : null}
          <Field label={t('overview.charges')}>
            <Money amount={statement.serviceCharges + statement.returnCharges} currency={statement.currency} format={format} />
          </Field>
        </dl>
      </div>

      <Lines statement={statement} format={format} shipmentHref={shipmentHref} />

      <Calculation statement={statement} format={format} />

      {isDraft ? null : <Settlements statement={statement} format={format} />}

      <Notes statement={statement} format={format} />

      <footer className="flex flex-col gap-1 border-t border-neutral-300 pt-4 text-xs text-neutral-600" data-print-keep>
        <p>{t('footer')}</p>
        <p>{t('questions', { email: COMPANY.email, phone: COMPANY.phone })}</p>
      </footer>
    </article>
  );
};

export default StatementDocument;
