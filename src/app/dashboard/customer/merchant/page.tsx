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

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/stat-card';
import MerchantStatusBadge from '@/components/merchant/merchant-status-badge';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { createClient } from '@/lib/supabase/server';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';
import { DELIVERY_TYPE_COPY, isFlatRate } from '@/lib/pricing/config';
import { EDITABLE_MERCHANT_STATUSES } from '@/lib/merchant/schemas';
import { getOwnMerchantApplication } from '@/services/merchant/applications';
import { DELIVERY_TYPES } from '@/lib/types';

import type { Metadata } from 'next';
import type { MerchantApplication } from '@/services/merchant/applications';

export const metadata: Metadata = { title: 'Merchant account · ParcelLink' };

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' }).format(new Date(value));

const NEXT_STEPS: Record<MerchantApplication['status'], string[]> = {
  pending: [
    'Our team checks your company details and trade licence.',
    'You’ll get an email and a notification here as soon as there’s a decision.',
    'Until then you can keep booking deliveries as an individual.',
  ],
  requires_changes: ['Read the message from our team below.', 'Update your application and resubmit it.', 'We’ll review it again straight away.'],
  rejected: ['Read the reason below.', 'If your details have changed, update and resubmit the application.', 'Questions? Open a support ticket.'],
  approved: [],
};

const ApplicationLobby = ({ application, submitted }: { application: MerchantApplication; submitted: boolean }) => {
  const editable = EDITABLE_MERCHANT_STATUSES.includes(application.status);
  const needsAttention = application.status === 'rejected' || application.status === 'requires_changes';
  const steps = [
    { label: 'Application submitted', done: true, icon: Send },
    { label: 'Under review', done: application.status !== 'pending', current: application.status === 'pending', icon: Hourglass },
    { label: needsAttention ? 'Action needed' : 'Decision', done: false, current: needsAttention, icon: needsAttention ? CircleAlert : BadgeCheck },
  ];

  return (
    <div className="flex flex-col gap-6">
      {submitted ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/50 bg-success/10 p-4 text-sm animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none">
          <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            <span className="font-medium">Application sent.</span> Your Merchant account application has been submitted and is awaiting approval.
          </p>
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Application status</p>
              <h2 className="text-xl font-semibold">
                {application.status === 'pending'
                  ? 'Your Merchant account application has been submitted and is awaiting approval.'
                  : 'Your Merchant application requires attention.'}
              </h2>
            </div>
            <MerchantStatusBadge status={application.status} />
          </div>

          <ol className="grid gap-3 sm:grid-cols-3" aria-label="Application progress">
            {steps.map(({ label, done, current, icon: Icon }) => (
              <li
                key={label}
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
              <dt className="text-muted-foreground">Company</dt>
              <dd className="font-medium">{application.companyName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Account type</dt>
              <dd className="font-medium">Merchant (applied)</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="font-medium">{formatDate(application.submittedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">
                <MerchantStatusBadge status={application.status} />
              </dd>
            </div>
          </dl>

          {application.reviewNote ? (
            <div className="rounded-xl border border-warning/60 bg-warning/10 p-4 text-sm">
              <p className="font-medium">Message from our team</p>
              <p>{application.reviewNote}</p>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Next steps</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {NEXT_STEPS[application.status].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap gap-2">
            {editable ? (
              <Button asChild>
                <Link href="/dashboard/customer/merchant/apply">
                  <Pencil aria-hidden />
                  Update & resubmit
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/dashboard/customer/book">
                <PackagePlus aria-hidden />
                Book as an individual
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const MerchantHub = async ({ application }: { application: MerchantApplication | null }) => {
  const [rules, stats] = await Promise.all([
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
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-gradient-to-br from-secondary/80 to-accent/60 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
            <Building2 className="size-6" aria-hidden />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              Merchant account <MerchantStatusBadge status="approved" />
            </p>
            <h2 className="text-xl font-semibold">{application?.companyName ?? 'Your company'}</h2>
          </div>
        </div>
        <Button asChild size="lg">
          <Link href="/dashboard/customer/book">
            <PackagePlus aria-hidden />
            Book merchant shipments
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Merchant shipments" value={String(stats?.shipment_count ?? 0)} />
        <StatCard label="Billed" value={`AED ${Number(stats?.billed ?? 0).toFixed(2)}`} />
        <StatCard label="Outstanding" value={`AED ${Number(stats?.outstanding ?? 0).toFixed(2)}`} />
        <StatCard label="Cash-paid fees" value={`AED ${Number(stats?.cod ?? 0).toFixed(2)}`} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <h2 className="text-lg font-semibold">Your merchant rates</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {DELIVERY_TYPES.map((type) => {
              const rule = rules.merchant[type];
              return (
                <div key={type} className="rounded-xl border p-4">
                  <p className="flex items-center gap-2 font-medium">
                    <Truck className="size-4 text-primary" aria-hidden />
                    {DELIVERY_TYPE_COPY[type].label}
                  </p>
                  <p className="mt-1 font-brand-mono text-2xl font-semibold">
                    {rule.currency} {rule.basePrice.toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isFlatRate(rule)
                      ? `Flat rate for any distance up to ${rule.maxDistanceKm} km.`
                      : `First ${rule.baseDistanceKm} km, then ${rule.currency} ${rule.additionalPricePerKm.toFixed(2)}/km.`}{' '}
                    {rule.includedWeightKg} kg included, then {rule.currency} {rule.additionalPricePerKg.toFixed(2)} per kg.
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Weight is required on every merchant shipment. Prices exclude the goods amount collected on delivery.</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard/customer/deliveries">
            <ClipboardList aria-hidden />
            All shipments
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
};

const MerchantPage = async ({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) => {
  const profile = await requireRoleOrRedirect('customer');
  const [application, params] = await Promise.all([getOwnMerchantApplication(profile.id), searchParams]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Merchant account</h1>
        <p className="text-muted-foreground">Flat-rate pricing and tools for businesses that ship regularly.</p>
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
              <h2 className="text-xl font-semibold">Ship as a business</h2>
              <p className="max-w-xl text-muted-foreground">
                Merchants get flat-rate pricing, bulk and recurring shipments, and cash-on-delivery collection. Applications are
                reviewed by our team.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/dashboard/customer/merchant/apply">
                Apply for a Merchant account
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
};

export default MerchantPage;
