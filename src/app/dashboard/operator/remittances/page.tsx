import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import RemittanceSubmitForm from '@/components/cash/remittance-submit-form';
import RemittanceTable from '@/components/cash/remittance-table';
import CashWeeksTable from '@/components/cash/cash-weeks-table';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { addAed, parseRemittanceView } from '@/lib/cash/remittances';
import {
  getOperatorCashOverview,
  listDriverRemittanceQueue,
  listOperatorCashWeeks,
  listOperatorRemittanceHistory,
} from '@/services/cash/remittances';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';
import type { RemittanceView } from '@/lib/cash/remittances';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('cash.operator'))('meta'),
});

type Param = string | string[] | undefined;
type SearchParams = Promise<{ dv?: Param; dp?: Param; mv?: Param; mp?: Param }>;

const PATH = '/dashboard/operator/remittances';

// Cash Remittances for an operator: drivers' submissions to count and
// confirm (or dispute), the cash this operator now holds because they
// confirmed it, and their own weekly remittance to the manager.
const OperatorRemittancesPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  await requireRoleOrRedirect('operator');
  const params = await searchParams;
  const driverView = parseRemittanceView(params.dv, 'pending');
  const myView = parseRemittanceView(params.mv);
  const driverPage = parsePage(params.dp);
  const myPage = parsePage(params.mp);
  const [t, format, data] = await Promise.all([
    getTranslations('cash.operator'),
    getFormat(),
    Promise.all([
      getOperatorCashOverview(),
      listDriverRemittanceQueue(driverView, driverPage),
      listOperatorCashWeeks(undefined, 8),
      listOperatorRemittanceHistory(myView, myPage),
    ]).catch((error: unknown) => {
      console.error('Operator remittances failed', error);
      return null;
    }),
  ]);
  const aed = (amount: number) => format.money(amount);
  // Each list keeps the other's view and page.
  const href = (list: 'd' | 'm') => ({ view, page }: { view: RemittanceView; page?: number }) => {
    const query = new URLSearchParams();
    const dv = list === 'd' ? view : driverView;
    const mv = list === 'm' ? view : myView;
    if (dv !== 'pending') query.set('dv', dv);
    if (mv !== 'all') query.set('mv', mv);
    if (list !== 'd' && driverPage > 1) query.set('dp', String(driverPage));
    if (list !== 'm' && myPage > 1) query.set('mp', String(myPage));
    if (page && page > 1) query.set(list === 'd' ? 'dp' : 'mp', String(page));
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

  const [overview, queue, weeks, history] = data;
  const received = addAed(overview.receivedCod, overview.receivedFee);
  const confirmed = addAed(overview.confirmedCod, overview.confirmedFee);
  const pending = addAed(overview.pendingCod, overview.pendingFee);
  const period = t('period', {
    from: format.date(`${overview.weekStart}T00:00:00+04:00`),
    to: format.date(`${overview.weekEnd}T00:00:00+04:00`),
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      {overview.driverQueue > 0 ? (
        <p className="rounded-md border border-primary/30 bg-secondary/50 p-3 text-sm" role="status">
          {t('queueNote', { count: overview.driverQueue })}
        </p>
      ) : null}

      <RemittanceTable
        id="driver-queue"
        title={t('queueHeading')}
        entries={queue}
        view={driverView}
        href={href('d')}
        pageParam="dp"
        showFrom
        reviewAs="driver"
        empty={t('queueEmpty')}
      />

      <section className="flex flex-col gap-3" aria-labelledby="operator-cash">
        <h2 id="operator-cash" className="text-lg font-medium">
          {t('cashHeading')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('cards.received')} value={aed(received)} />
          <StatCard label={t('cards.receivedFee')} value={aed(overview.receivedFee)} />
          <StatCard label={t('cards.receivedCod')} value={aed(overview.receivedCod)} />
          <StatCard label={t('cards.other')} value={aed(overview.other)} />
          <StatCard label={t('cards.accountable')} value={aed(addAed(received, overview.other))} />
          <StatCard label={t('cards.submitted')} value={aed(pending)} />
          <StatCard label={t('cards.confirmed')} value={aed(confirmed)} />
          <StatCard label={t('cards.outstanding')} value={aed(overview.outstanding)} />
        </div>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          <li>{t('weekLine', { period, received: aed(overview.week.received), confirmed: aed(overview.week.confirmed) })}</li>
          <li>{t('outstandingSplit', { cod: aed(overview.outstandingCod), fee: aed(overview.outstandingFee) })}</li>
          {overview.openingOutstanding > 0 ? <li>{t('carried', { amount: aed(overview.openingOutstanding) })}</li> : null}
          {overview.pendingCount > 0 ? <li>{t('pendingNote', { count: overview.pendingCount, amount: aed(pending) })}</li> : null}
          {overview.disputedCount > 0 ? <li className="text-destructive">{t('disputedNote', { count: overview.disputedCount })}</li> : null}
          <li>{t('otherNote')}</li>
        </ul>
      </section>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="text-lg font-medium">{t('submitHeading')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('availableLine', { cod: aed(overview.availableCod), fee: aed(overview.availableFee) })}
          </p>
          <RemittanceSubmitForm kind="operator" availableCod={overview.availableCod} availableFee={overview.availableFee} />
        </CardContent>
      </Card>

      <CashWeeksTable id="operator-weeks" title={t('weeksHeading')} weeks={weeks} />

      <RemittanceTable
        id="operator-history"
        title={t('historyHeading')}
        entries={history}
        view={myView}
        href={href('m')}
        pageParam="mp"
        empty={t('historyEmpty')}
      />
    </main>
  );
};

export default OperatorRemittancesPage;
