import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import StatCard from '@/components/dashboard/stat-card';
import RemittanceTable from '@/components/cash/remittance-table';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { parseRemittanceView } from '@/lib/cash/remittances';
import {
  getManagerCashTotals,
  listDriverRemittanceQueue,
  listOperatorCashBalances,
  listOperatorRemittanceHistory,
} from '@/services/cash/remittances';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';
import type { RemittanceView } from '@/lib/cash/remittances';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('cash.manager'))('meta'),
});

type Param = string | string[] | undefined;
type SearchParams = Promise<{ ov?: Param; op?: Param; dv?: Param; dp?: Param }>;

const PATH = '/dashboard/manager/remittances';

// Cash received from operators: their weekly submissions to count and
// confirm (or dispute), what each operator still holds, and where every
// dirham collected is right now (with drivers, with operators, with the
// manager) — the same cash counted once at each level.
const ManagerRemittancesPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  await requireRoleOrRedirect('manager');
  const params = await searchParams;
  const operatorView = parseRemittanceView(params.ov, 'pending');
  const driverView = parseRemittanceView(params.dv, 'pending');
  const operatorPage = parsePage(params.op);
  const driverPage = parsePage(params.dp);
  const [t, format, data] = await Promise.all([
    getTranslations('cash.manager'),
    getFormat(),
    Promise.all([
      getManagerCashTotals(),
      listOperatorRemittanceHistory(operatorView, operatorPage),
      listOperatorCashBalances(),
      listDriverRemittanceQueue(driverView, driverPage),
    ]).catch((error: unknown) => {
      console.error('Manager remittances failed', error);
      return null;
    }),
  ]);
  const aed = (amount: number) => format.money(amount);
  const href = (list: 'o' | 'd') => ({ view, page }: { view: RemittanceView; page?: number }) => {
    const query = new URLSearchParams();
    const ov = list === 'o' ? view : operatorView;
    const dv = list === 'd' ? view : driverView;
    if (ov !== 'pending') query.set('ov', ov);
    if (dv !== 'pending') query.set('dv', dv);
    if (list !== 'o' && operatorPage > 1) query.set('op', String(operatorPage));
    if (list !== 'd' && driverPage > 1) query.set('dp', String(driverPage));
    if (page && page > 1) query.set(list === 'o' ? 'op' : 'dp', String(page));
    const qs = query.toString();
    return qs ? `${PATH}?${qs}` : PATH;
  };

  if (!data || !data[0]) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <div className="rounded-md border border-destructive/40 p-6 text-center" role="alert">
          <p className="font-medium">{t('loadFailed')}</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={PATH}>{t('retry')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const [totals, operatorEntries, balances, driverEntries] = data;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      {totals.pendingCount > 0 ? (
        <p className="rounded-md border border-primary/30 bg-secondary/50 p-3 text-sm" role="status">
          {t('queueNote', { count: totals.pendingCount, amount: aed(totals.pendingFromOperators) })}
        </p>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="manager-cash">
        <h2 id="manager-cash" className="text-lg font-medium">
          {t('cashHeading')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label={t('cards.fromOperators')} value={aed(totals.fromOperators)} />
          <StatCard label={t('cards.directFromDrivers')} value={aed(totals.directFromDrivers)} />
          <StatCard label={t('cards.pending')} value={aed(totals.pendingFromOperators)} />
          <StatCard label={t('cards.heldByOperators')} value={aed(totals.heldByOperators)} />
          <StatCard label={t('cards.heldByDrivers')} value={aed(totals.heldByDrivers)} />
        </div>
        <p className="text-sm text-muted-foreground">
          {t('splitLine', { cod: aed(totals.fromOperatorsCod), fee: aed(totals.fromOperatorsFee) })}
        </p>
      </section>

      <RemittanceTable
        id="operator-remittances"
        title={t('queueHeading')}
        entries={operatorEntries}
        view={operatorView}
        href={href('o')}
        pageParam="op"
        showFrom
        reviewAs="operator"
        empty={t('queueEmpty')}
      />

      <section className="flex flex-col gap-3" aria-labelledby="operator-balances">
        <h2 id="operator-balances" className="text-lg font-medium">
          {t('balancesHeading')}
        </h2>
        {balances.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm">{t('balancesEmpty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('balancesHeading')}</caption>
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('balances.operator')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('balances.received')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('balances.remitted')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('balances.pending')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('balances.outstanding')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('balances.last')}</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr key={row.operatorId} className="border-t">
                    <th scope="row" className="px-3 py-2 text-start font-normal">{row.operatorName}</th>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{aed(row.received)}</td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{aed(row.remitted)}</td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{row.pending > 0 ? aed(row.pending) : '—'}</td>
                    <td className="px-3 py-2 text-end font-brand-mono font-semibold whitespace-nowrap">{aed(row.outstanding)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.lastRemittedAt ? format.dateTime(row.lastRemittedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RemittanceTable
        id="driver-submissions"
        title={t('driverHeading')}
        entries={driverEntries}
        view={driverView}
        href={href('d')}
        pageParam="dp"
        showFrom
        reviewAs="driver"
        empty={t('driverEmpty')}
      />
      <p className="-mt-3 text-xs text-muted-foreground">{t('driverNote')}</p>
    </main>
  );
};

export default ManagerRemittancesPage;
