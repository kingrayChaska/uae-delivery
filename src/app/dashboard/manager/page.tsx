import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import StatCard from '@/components/dashboard/stat-card';
import BatchList from '@/components/bulk/batch-list';
import { getCurrentProfile } from '@/lib/auth/session';
import { getManagerSummary } from '@/services/shipments/get-manager-summary';
import { listAuditLogs } from '@/services/audit/list-audit-logs';
import { listRecentBatches } from '@/services/bulk/list-batches';
import { countMerchantApplicationsByStatus } from '@/services/merchant/applications';
import { getFormat } from '@/i18n/server';

const ManagerDashboardPage = async () => {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const [summary, activity, recentBatches, merchantCounts, t, format] = await Promise.all([
    getManagerSummary(),
    listAuditLogs(8),
    listRecentBatches(5),
    countMerchantApplicationsByStatus(),
    getTranslations('manager.home'),
    getFormat(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('signedInAs', { name: profile.fullName })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/manager/reports">{t('reports')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/manager/drivers/new">{t('addDriver')}</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/manager/operators/new">{t('addOperator')}</Link>
          </Button>
        </div>
      </div>

      {merchantCounts.pending > 0 ? (
        <Link
          href="/dashboard/manager/merchants?status=pending"
          className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-secondary/50 p-4 text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span>
            {t.rich('pendingApplications', {
              count: merchantCounts.pending,
              strong: (chunks) => <span className="font-semibold">{chunks}</span>,
            })}
          </span>
          <span className="flex items-center gap-1 font-medium text-primary">
            {t('review')}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </span>
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('stats.bookedToday')} value={format.number(summary.shipmentsToday)} />
        <StatCard label={t('stats.inProgress')} value={format.number(summary.inProgress)} />
        <StatCard label={t('stats.awaitingDispatch')} value={format.number(summary.awaitingDispatch)} />
        <StatCard label={t('stats.failed')} value={format.number(summary.failedNeedingAction)} />
        <StatCard label={t('stats.deliveredMonth')} value={format.number(summary.deliveredThisMonth)} />
        <StatCard label={t('stats.codOutstanding')} value={format.money(summary.codOutstanding)} />
        <StatCard label={t('stats.activeDrivers')} value={format.number(summary.activeDrivers)} />
        <StatCard label={t('stats.activeOperators')} value={format.number(summary.activeOperators)} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{t('recentLists')}</h2>
          <Link href="/dashboard/manager/bulk" className="text-sm text-muted-foreground hover:underline">
            {t('viewAll')}
          </Link>
        </div>
        <BatchList batches={recentBatches} hrefBase="/dashboard/manager/bulk" showSender emptyMessage={t('noLists')} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{t('recentActivity')}</h2>
          <Link href="/dashboard/manager/activity" className="text-sm text-muted-foreground hover:underline">
            {t('viewAll')}
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noActivity')}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {activity.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-4 px-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{log.actorName ?? t('system')}</span>{' '}
                  <span dir="ltr" className="font-brand-mono text-xs text-muted-foreground">
                    {log.action}
                  </span>
                </span>
                <span className="shrink-0 font-brand-mono text-xs text-muted-foreground">{format.dateTime(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
};

export default ManagerDashboardPage;
