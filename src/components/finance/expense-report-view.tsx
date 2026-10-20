import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import ExpenseReportStatusBadge from '@/components/finance/expense-report-status-badge';
import { getFormat } from '@/i18n/server';

import type { ReactNode } from 'react';
import type { ExpenseReportDetail, ReportEntry } from '@/services/finance/expense-reports';

type ExpenseReportViewProps = {
  detail: ExpenseReportDetail;
  backHref: string;
  backLabel: string;
  // The step buttons for whoever is looking (operator or manager).
  actions?: ReactNode;
  // Per-entry controls (a manager's correction on an approved report).
  entryAction?: (entry: ReportEntry) => ReactNode;
};

// One operator expense report as both its operator and a manager see it:
// period and status, the totals (now, as submitted, as approved), the
// category breakdown, every expense with its receipt and corrections, and
// the history with the manager's feedback. Totals come from the database.
const ExpenseReportView = async ({ detail, backHref, backLabel, actions, entryAction }: ExpenseReportViewProps) => {
  const [t, tHistory, format] = await Promise.all([
    getTranslations('finance.reports'),
    getTranslations('finance.reports.history'),
    getFormat(),
  ]);
  const { report, categories, entries, history } = detail;
  const aed = (amount: number) => format.money(amount);
  const returned = report.status === 'returned' ? history.filter((h) => h.action === 'returned').at(-1) : null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {backLabel}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 dir="ltr" className="font-brand-mono text-2xl font-semibold">
              {report.number}
            </h1>
            <ExpenseReportStatusBadge status={report.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t(`kind.${report.kind}`)} · {format.calendarDate(report.periodStart)} – {format.calendarDate(report.periodEnd)} ·{' '}
            {report.operatorName}
          </p>
          {report.submittedAt ? (
            <p className="text-xs text-muted-foreground">{t('submittedOn', { date: format.dateTime(report.submittedAt), count: report.submissionCount })}</p>
          ) : null}
        </div>
        {actions}
      </div>

      {returned ? (
        <div role="status" className="rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
          <p className="font-medium">{t('returnedHeading', { name: returned.actorName ?? '—' })}</p>
          <p className="wrap-break-word">{returned.note}</p>
        </div>
      ) : null}
      {report.status === 'approved' && report.decisionNote ? (
        <p className="rounded-xl border bg-secondary/30 p-3 text-sm">{t('approvedNote', { name: report.decidedByName ?? '—', note: report.decisionNote })}</p>
      ) : null}

      <section aria-labelledby="report-totals" className="flex flex-col gap-3">
        <h2 id="report-totals" className="text-lg font-medium">
          {t('totalsHeading')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-primary/40 bg-secondary/40 p-4">
            <p className="text-sm font-medium">{t('total')}</p>
            <p dir="ltr" className="font-brand-mono text-xl font-bold rtl:text-right">{aed(report.total)}</p>
            <p className="text-xs text-muted-foreground">{t('expenseCount', { count: report.expenseCount, receipts: report.receiptCount })}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t('submittedTotal')}</p>
            <p dir="ltr" className="font-brand-mono text-lg font-semibold rtl:text-right">{report.submittedTotal === null ? '—' : aed(report.submittedTotal)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t('approvedTotal')}</p>
            <p dir="ltr" className="font-brand-mono text-lg font-semibold rtl:text-right">{report.approvedTotal === null ? '—' : aed(report.approvedTotal)}</p>
          </div>
        </div>
        {categories.length > 0 ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => (
              <div key={c.categoryId} className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2">
                <dt className="truncate">
                  {c.name}
                  <span className="ms-1 text-xs text-muted-foreground">({c.count})</span>
                </dt>
                <dd dir="ltr" className="font-brand-mono">{aed(c.total)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <section aria-labelledby="report-entries" className="flex flex-col gap-3">
        <h2 id="report-entries" className="text-lg font-medium">
          {t('entriesHeading')}
        </h2>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('noEntries')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => {
              const isVoid = entry.status === 'void';
              return (
                <li key={entry.id} className={`flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between ${isVoid ? 'opacity-70' : ''}`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium wrap-break-word ${isVoid ? 'line-through' : ''}`}>{entry.description}</span>
                      <Badge variant="secondary">{entry.categoryName}</Badge>
                      {isVoid ? <Badge variant="destructive">{t('void')}</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format.calendarDate(entry.incurredOn)}
                      {entry.vendor ? ` · ${entry.vendor}` : ''}
                      {entry.reference ? ` · ${entry.reference}` : ''}
                    </p>
                    {entry.notes ? <p className="text-sm wrap-break-word">{entry.notes}</p> : null}
                    {entry.receiptUrl ? (
                      <a href={entry.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline">
                        <FileText className="size-4" aria-hidden />
                        {t('viewReceipt')}
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t('noReceipt')}</p>
                    )}
                    {entry.corrections.map((c) => (
                      <p key={c.createdAt} className="text-xs text-muted-foreground">
                        {t('corrected', { from: aed(c.originalAmount), to: aed(c.correctedAmount), reason: c.reason, date: format.date(c.createdAt) })}
                      </p>
                    ))}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span dir="ltr" className="font-brand-mono text-base font-semibold">
                      {format.money(entry.amount, entry.currency)}
                    </span>
                    {!isVoid && entryAction ? entryAction(entry) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="report-history" className="flex flex-col gap-3">
        <h2 id="report-history" className="text-lg font-medium">
          {t('historyHeading')}
        </h2>
        <ol className="flex flex-col gap-2 border-s ps-4">
          {history.map((h, index) => (
            <li key={`${h.createdAt}-${index}`} className="text-sm">
              <p>
                <span className="font-medium">{tHistory(h.action as 'created')}</span>
                {' · '}
                {h.actorName ?? '—'}
                {' · '}
                <time dateTime={h.createdAt} className="text-muted-foreground">
                  {format.dateTime(h.createdAt)}
                </time>
                {h.total !== null ? <span dir="ltr" className="ms-2 font-brand-mono text-xs">{aed(h.total)}</span> : null}
              </p>
              {h.note ? <p className="text-muted-foreground wrap-break-word">{h.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
};

export default ExpenseReportView;
