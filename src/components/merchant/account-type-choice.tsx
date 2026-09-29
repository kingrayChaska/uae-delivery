'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, Check, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { chooseIndividualAccountAction } from '@/lib/merchant/actions';

const INDIVIDUAL_POINTS = ['anytime', 'speeds', 'payPer'] as const;
const MERCHANT_POINTS = ['flatRate', 'bulk', 'cod'] as const;

const AccountTypeChoice = () => {
  const t = useTranslations('merchant.onboarding');
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseIndividual = async () => {
    setIsSaving(true);
    setError(null);
    const result = await chooseIndividualAccountAction();
    if (!result.success) {
      setIsSaving(false);
      setError(result.error);
      return;
    }
    router.push(result.redirectTo ?? '/dashboard/customer');
    router.refresh();
  };

  const card = 'flex flex-col gap-5 rounded-2xl border-2 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="choice-individual">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
            <UserRound className="size-6" aria-hidden />
          </span>
          <div>
            <h2 id="choice-individual" className="text-xl font-semibold">{t('individual.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('individual.description')}</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {INDIVIDUAL_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {t(`individual.points.${point}`)}
              </li>
            ))}
          </ul>
          <Button type="button" size="lg" className="mt-auto" onClick={chooseIndividual} loading={isSaving}>
            {t('individual.cta')}
            <ArrowRight className="rtl:rotate-180" aria-hidden />
          </Button>
        </section>

        <section className={card} aria-labelledby="choice-merchant">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Building2 className="size-6" aria-hidden />
          </span>
          <div>
            <h2 id="choice-merchant" className="text-xl font-semibold">{t('merchant.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('merchant.description')}</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {MERCHANT_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {t(`merchant.points.${point}`)}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" variant="outline" className="mt-auto">
            <Link href="/dashboard/customer/merchant/apply">
              {t('merchant.cta')}
              <ArrowRight className="rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('merchant.note')}
          </p>
        </section>
      </div>
      <FieldError message={error ?? undefined} />
    </div>
  );
};

export default AccountTypeChoice;
