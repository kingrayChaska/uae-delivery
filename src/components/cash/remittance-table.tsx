import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import Pagination from '@/components/dashboard/pagination';
import RemittanceReview from '@/components/cash/remittance-review';
import { REMITTANCE_VIEWS } from '@/lib/cash/remittances';
import { getFormat } from '@/i18n/server';
import { cn } from '@/lib/utils';

import type { Paginated } from '@/lib/pagination';
import type { RemittanceView } from '@/lib/cash/remittances';
import type { RemittanceEntry } from '@/services/cash/remittances';

const STATUS_VARIANT: Record<RemittanceEntry['status'], 'default' | 'secondary' | 'success' | 'destructive'> = {
  pending: 'secondary',
  confirmed: 'success',
  rejected: 'destructive',
  disputed: 'destructive',
};

type RemittanceTableProps = {
  id: string;
  title: string;
  entries: Paginated<RemittanceEntry>;
  view: RemittanceView;
  // The list's own URL (keeps other query parameters), and its query keys.
  href: (params: { view: RemittanceView; page?: number }) => string;
  // A "from" column (who submitted it): queues and manager views.
  showFrom?: boolean;
  // Confirm / dispute on pending rows, as this kind of reviewer.
  reviewAs?: 'driver' | 'operator' | null;
  empty: string;
  // Its page parameter, when a page shows two lists.
  pageParam?: string;
};

// Every remittance as recorded: submitted and counted amounts, the split,
// who decided and when, and why. Nothing here is ever edited or removed.
const RemittanceTable = async ({ id, title, entries, view, href, showFrom = false, reviewAs = null, empty, pageParam = 'page' }: RemittanceTableProps) => {
  const [t, format] = await Promise.all([getTranslations('cash.table'), getFormat()]);
  const week = (date: string) => format.date(`${date}T00:00:00+04:00`);

  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-medium">
          {title}
        </h2>
        <nav aria-label={t('filterLabel')} className="flex flex-wrap gap-1">
          {REMITTANCE_VIEWS.map((option) => (
            <Link
              key={option}
              href={href({ view: option })}
              aria-current={option === view ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                option === view ? 'border-primary bg-secondary font-medium' : 'text-muted-foreground hover:border-primary/40',
              )}
            >
              {t(`views.${option}`)}
            </Link>
          ))}
        </nav>
      </div>

      {entries.items.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('reference')}</th>
                {showFrom ? <th scope="col" className="px-3 py-2 text-start font-medium">{t('from')}</th> : null}
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('week')}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">{t('submitted')}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">{t('confirmedAmount')}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('statusColumn')}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('decided')}</th>
                {reviewAs ? (
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    <span className="sr-only">{t('action')}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {entries.items.map((entry) => {
                // What this row puts on the books: a confirmed row its amount;
                // a disputed submission only what was counted from it.
                const confirmed = entry.status === 'confirmed' ? entry.amount : entry.status === 'disputed' ? (entry.countedAmount ?? 0) : null;
                return (
                  <tr key={entry.id} className="border-t align-top">
                    <th scope="row" className="px-3 py-2 text-start font-normal">
                      <span dir="ltr" className="font-brand-mono">{entry.number}</span>
                      <span className="block text-xs text-muted-foreground">{format.dateTime(entry.createdAt)}</span>
                      {entry.discrepancyOf ? (
                        <span className="block text-xs text-muted-foreground">{t('countedFor', { number: entry.discrepancyOf })}</span>
                      ) : null}
                      {entry.source === 'staff' ? <span className="block text-xs text-muted-foreground">{t('recordedByStaff')}</span> : null}
                    </th>
                    {showFrom ? (
                      <td className="px-3 py-2">
                        {entry.fromName ?? '—'}
                        {entry.fromPhone ? (
                          <span dir="ltr" className="block font-brand-mono text-xs text-muted-foreground rtl:text-right">{entry.fromPhone}</span>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 whitespace-nowrap">{t('weekOf', { date: week(entry.periodStart) })}</td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">
                      {format.money(entry.amount)}
                      {entry.codAmount !== null && entry.feeAmount !== null ? (
                        <span className="block text-xs text-muted-foreground">
                          {t('split', { cod: format.money(entry.codAmount), fee: format.money(entry.feeAmount) })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{confirmed === null ? '—' : format.money(confirmed)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[entry.status]}>{t(`status.${entry.status}`)}</Badge>
                      {entry.notes ? <span className="block text-xs text-muted-foreground wrap-break-word">{entry.notes}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {entry.decidedAt ? t('decidedBy', { name: entry.decidedBy ?? '—', date: format.dateTime(entry.decidedAt) }) : t('awaiting')}
                      {entry.decisionNote ? <span className="block wrap-break-word text-foreground">{entry.decisionNote}</span> : null}
                    </td>
                    {reviewAs ? (
                      <td className="px-3 py-2 text-end">
                        {entry.status === 'pending' && entry.codAmount !== null && entry.feeAmount !== null ? (
                          <RemittanceReview
                            kind={reviewAs}
                            remittanceId={entry.id}
                            number={entry.number}
                            fromName={entry.fromName ?? '—'}
                            codAmount={entry.codAmount}
                            feeAmount={entry.feeAmount}
                          />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={entries.page} totalPages={entries.totalPages} href={href({ view })} param={pageParam} />
    </section>
  );
};

export default RemittanceTable;
