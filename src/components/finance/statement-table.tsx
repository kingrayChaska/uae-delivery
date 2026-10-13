import Link from 'next/link';
import { useTranslations } from 'next-intl';

import StatementStatusBadge from '@/components/finance/statement-status-badge';
import { useFormat } from '@/i18n/hooks';

import type { StatementSummaryRecord } from '@/lib/finance/statements';

type StatementTableProps = {
  rows: StatementSummaryRecord[];
  href: (id: string) => string;
  // The manager's list names the merchant; a merchant's own list doesn't.
  showMerchant: boolean;
};

// A list of statements. On a phone it's a stack of cards; from md up, a table.
const StatementTable = ({ rows, href, showMerchant }: StatementTableProps) => {
  const t = useTranslations('finance.statements');
  const format = useFormat();
  const period = (row: StatementSummaryRecord) => `${format.calendarDate(row.periodStart)} – ${format.calendarDate(row.periodEnd)}`;
  const amount = (row: StatementSummaryRecord) => (
    <span className="flex flex-col items-end">
      <span dir="ltr" className="font-brand-mono whitespace-nowrap">
        {format.money(Math.abs(row.netAmount), row.currency)}
      </span>
      <span className="text-xs text-muted-foreground">{t(`outcome.${row.outcome}`)}</span>
    </span>
  );
  const number = (row: StatementSummaryRecord) => (
    <Link href={href(row.id)} className="font-brand-mono font-medium text-primary underline-offset-2 hover:underline" dir="ltr">
      {row.statementNumber ?? t('list.draft')}
      {row.version > 1 ? <span className="ms-1 text-xs text-muted-foreground">{t('list.version', { version: row.version })}</span> : null}
    </Link>
  );

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {number(row)}
                {showMerchant ? <p className="truncate text-sm">{row.merchantName}</p> : null}
                <p className="text-xs text-muted-foreground">{period(row)}</p>
              </div>
              <StatementStatusBadge status={row.status} />
            </div>
            <div className="flex justify-end text-sm">{amount(row)}</div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t('list.col.number')}</th>
              {showMerchant ? <th scope="col" className="px-3 py-2 text-start font-medium">{t('list.col.merchant')}</th> : null}
              <th scope="col" className="px-3 py-2 text-start font-medium">{t('list.col.period')}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t('list.col.type')}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t('list.col.date')}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t('list.col.status')}</th>
              <th scope="col" className="px-3 py-2 text-end font-medium">{t('list.col.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="px-3 py-2">{number(row)}</td>
                {showMerchant ? <td className="px-3 py-2">{row.merchantName}</td> : null}
                <td className="px-3 py-2 whitespace-nowrap">{period(row)}</td>
                <td className="px-3 py-2">{t(`kind.${row.kind}`)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{format.date(row.publishedAt ?? row.generatedAt)}</td>
                <td className="px-3 py-2">
                  <StatementStatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 text-end">{amount(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default StatementTable;
