import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CircleAlert,
  ClipboardList,
  Hourglass,
  PackagePlus,
  Pencil,
  Send,
  Truck,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import MerchantStatusBadge from '@/components/merchant/merchant-status-badge';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { createClient } from '@/lib/supabase/server';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';
import { isFlatRate } from '@/lib/pricing/config';
import { EDITABLE_MERCHANT_STATUSES } from '@/lib/merchant/schemas';
import { getOwnMerchantApplication } from '@/services/merchant/applications';
import { DELIVERY_TYPES } from '@/lib/types';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';
import type { MerchantApplication } from '@/services/merchant/applications';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('merchant.page'))('meta'),
});

const NEXT_STEP_KEYS = ['one', 'two', 'three'] as const;

const ApplicationLobby = async ({ application, submitted }: { application: MerchantApplication; submitted: boolean }) => {
  const [t, format] = await Promise.all([getTranslations('merchant.page.lobby'), getFormat()]);
  const editable = EDITABLE_MERCHANT_STATUSES.includes(application.status);
  const needsAttention = application.status === 'rejected' || application.status === 'requires_changes';
  const steps = [
    { key: 'submitted', label: t('steps.submitted'), done: true, icon: Send },
    { key: 'review', label: t('steps.review'), done: application.status !== 'pending', current: application.status === 'pending', icon: Hourglass },
    {
      key: 'decision',
      label: needsAttention ? t('steps.action') : t('steps.decision'),
      done: false,
      current: needsAttention,
      icon: needsAttention ? CircleAlert : BadgeCheck,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {submitted ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/50 bg-success/10 p-4 text-sm animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none">
          <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            <span className="font-medium">{t('sentTitle')}</span> {t('sentBody')}
          </p>
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{t('statusLabel')}</p>
              <h2 className="text-xl font-semibold">
                {application.status === 'pending' ? t('pendingHeadline') : t('attentionHeadline')}
              </h2>
            </div>
            <MerchantStatusBadge status={application.status} />
          </div>

          <ol className="grid gap-3 sm:grid-cols-3" aria-label={t('progressLabel')}>
            {steps.map(({ key, label, done, current, icon: Icon }) => (
              <li
                key={key}
                aria-current={current ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${
                  current ? 'border-primary bg-secondary/60 font-medium' : done ? 'bg-muted/40' : 'text-muted-foreground'
                }`}
              >
                <Icon className={`size-5 shrink-0 ${done || current ? 'text-primary' : ''} ${current && application.status === 'pending' ? 'animate-pulse motion-reduce:animate-none' : ''}`} aria-hidden />
                {label}
              </li>
            ))}
          </ol>

          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t('company')}</dt>
              <dd className="font-medium">{application.companyName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('accountType')}</dt>
              <dd className="font-medium">{t('applied')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('submitted')}</dt>
              <dd className="font-medium">{format.dateTime(application.submittedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('status')}</dt>
              <dd className="font-medium">
                <MerchantStatusBadge status={application.status} />
              </dd>
            </div>
          </dl>

          {application.reviewNote ? (
            <div className="rounded-xl border border-warning/60 bg-warning/10 p-4 text-sm">
              <p className="font-medium">{t('teamMessage')}</p>
              <p>{application.reviewNote}</p>
            </div>
          ) : null}

          {application.status !== 'approved' ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('nextSteps')}</h3>
              <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm text-muted-foreground">
                {NEXT_STEP_KEYS.map((step) => (
                  <li key={step}>{t(`next.${application.status as 'pending' | 'requires_changes' | 'rejected'}.${step}`)}</li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {editable ? (
              <Button asChild>
                <Link href="/dashboard/customer/merchant/apply">
                  <Pencil aria-hidden />
                  {t('update')}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/dashboard/customer/book">
                <PackagePlus aria-hidden />
                {t('bookIndividual')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const MerchantHub = async ({ application }: { application: MerchantApplication | null }) => {
  const [rules, stats, t, tShipments, format] = await Promise.all([
    getActivePricingRules(),
    (async () => {
      if (!application?.businessAccountId) return null;
      const supabase = await createClient();
      const { data } = await supabase
        .from('business_shipment_stats')
        .select('shipment_count, billed, outstanding, cod')
        .eq('business_account_id', application.businessAccountId)
        .maybeSingle();
      return data;
    })(),
    getTranslations('merchant.page.hub'),
    getTranslations('shipments'),
    getFormat(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-linear-to-br from-secondary/80 to-accent/60 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
            <Building2 className="size-6" aria-hidden />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {t('label')} <MerchantStatusBadge status="approved" />
            </p>
            <h2 className="text-xl font-semibold">{application?.companyName ?? t('yourCompany')}</h2>
          </div>
        </div>
        <Button asChild size="lg">
          <Link href="/dashboard/customer/book">
            <PackagePlus aria-hidden />
            {t('book')}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('stats.shipments')} value={format.number(stats?.shipment_count ?? 0)} />
        <StatCard label={t('stats.billed')} value={format.money(Number(stats?.billed ?? 0))} />
        <StatCard label={t('stats.outstanding')} value={format.money(Number(stats?.outstanding ?? 0))} />
        <StatCard label={t('stats.cashFees')} value={format.money(Number(stats?.cod ?? 0))} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <h2 className="text-lg font-semibold">{t('ratesTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {DELIVERY_TYPES.map((type) => {
              const rule = rules.merchant[type];
              return (
                <div key={type} className="rounded-xl border p-4">
                  <p className="flex items-center gap-2 font-medium">
                    <Truck className="size-4 text-primary rtl:-scale-x-100" aria-hidden />
                    {tShipments(`deliveryType.${type}.label`)}
                  </p>
                  <p className="mt-1 font-brand-mono text-2xl font-semibold">{format.money(rule.basePrice, rule.currency)}</p>
                  <p className="text-sm text-muted-foreground">
                    {isFlatRate(rule)
                      ? t('flatRate', { distance: format.km(rule.maxDistanceKm, 0) })
                      : t('tiered', {
                          distance: format.km(rule.baseDistanceKm, 0),
                          perKm: format.money(rule.additionalPricePerKm, rule.currency),
                        })}{' '}
                    {t('weight', { weight: format.kg(rule.includedWeightKg), perKg: format.money(rule.additionalPricePerKg, rule.currency) })}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t('ratesNote')}</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard/customer/deliveries">
            <ClipboardList aria-hidden />
            {t('allShipments')}
            <ArrowRight className="rtl:rotate-180" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
};

const MerchantPage = async ({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) => {
  const profile = await requireRoleOrRedirect('customer');
  const [application, params, t] = await Promise.all([
    getOwnMerchantApplication(profile.id),
    searchParams,
    getTranslations('merchant.page'),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {profile.accountType === 'merchant' ? (
        <MerchantHub application={application} />
      ) : application ? (
        <ApplicationLobby application={application} submitted={params.submitted === '1'} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 pt-6">
            <Building2 className="size-10 text-primary" aria-hidden />
            <div>
              <h2 className="text-xl font-semibold">{t('empty.title')}</h2>
              <p className="max-w-xl text-muted-foreground">{t('empty.body')}</p>
            </div>
            <Button asChild size="lg">
              <Link href="/dashboard/customer/merchant/apply">
                {t('empty.cta')}
                <ArrowRight className="rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
};

export default MerchantPage;
