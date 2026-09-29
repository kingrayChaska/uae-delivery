import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Building2, CircleCheckBig, Clock, Hourglass, PackagePlus, Truck, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import ShipmentListItem from '@/components/shipment/shipment-list-item';
import MyShipmentLookup from '@/components/shipment/my-shipment-lookup';
import MerchantStatusBadge from '@/components/merchant/merchant-status-badge';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getCustomerDashboardSummary } from '@/services/shipments/list-shipments';
import { getOwnMerchantApplication } from '@/services/merchant/applications';
import { getFormat } from '@/i18n/server';

const CustomerDashboardPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  // New accounts first answer "How will you use ParcelLink?".
  if (!profile.accountTypeSelectedAt) redirect('/dashboard/customer/onboarding');

  const [summary, application, t, format] = await Promise.all([
    getCustomerDashboardSummary(profile.id),
    profile.accountType === 'individual' ? getOwnMerchantApplication(profile.id) : Promise.resolve(null),
    getTranslations('customer.home'),
    getFormat(),
  ]);
  const firstName = profile.fullName.split(' ')[0] || profile.fullName;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('welcome', { name: firstName })}</h1>
          <p className="text-muted-foreground">{profile.accountType === 'merchant' ? t('subtitleMerchant') : t('subtitle')}</p>
        </div>
        <Button asChild size="lg">
          <Link href="/dashboard/customer/book">
            <PackagePlus aria-hidden />
            {t('book')}
          </Link>
        </Button>
      </div>

      {application && application.status !== 'approved' ? (
        <Link
          href="/dashboard/customer/merchant"
          className="flex flex-wrap items-center gap-3 rounded-2xl border bg-secondary/40 p-4 transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {application.status === 'pending' ? (
            <Hourglass className="size-5 text-primary" aria-hidden />
          ) : (
            <Building2 className="size-5 text-primary" aria-hidden />
          )}
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{t('application', { company: application.companyName })}</span>
            <span className="block text-muted-foreground">
              {application.status === 'pending' ? t('applicationPending') : t('applicationAttention')}
            </span>
          </span>
          <MerchantStatusBadge status={application.status} />
          <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('stats.active')} value={format.number(summary.active)} icon={Truck} />
        <StatCard label={t('stats.pending')} value={format.number(summary.pending)} icon={Clock} />
        <StatCard label={t('stats.completed')} value={format.number(summary.completed)} icon={CircleCheckBig} />
        <StatCard label={t('stats.spent')} value={format.money(summary.totalSpent, summary.currency)} icon={Wallet} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="recent-heading" className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 id="recent-heading" className="text-lg font-medium">
              {t('recent')}
            </h2>
            <Link href="/dashboard/customer/deliveries" className="text-sm font-medium text-primary hover:underline">
              {t('viewAll')}
            </Link>
          </div>

          {summary.recent.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
              <p className="font-medium">{t('emptyTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/customer/book">{t('emptyCta')}</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.recent.map((shipment) => (
                <ShipmentListItem key={shipment.id} shipment={shipment} />
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <h2 className="font-medium">{t('trackTitle')}</h2>
              <MyShipmentLookup />
              <Link href="/dashboard/customer/track" className="text-sm font-medium text-primary hover:underline">
                {t('trackAll')}
              </Link>
            </CardContent>
          </Card>
          {profile.accountType === 'individual' && !application ? (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-6">
                <h2 className="flex items-center gap-2 font-medium">
                  <Building2 className="size-4 text-primary" aria-hidden />
                  {t('businessTitle')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('businessBody')}</p>
                <Button asChild variant="outline" size="sm" className="self-start">
                  <Link href="/dashboard/customer/merchant/apply">{t('businessCta')}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
};

export default CustomerDashboardPage;
