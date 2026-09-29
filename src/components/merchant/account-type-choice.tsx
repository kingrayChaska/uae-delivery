'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, Check, UserRound } from 'lucide-react';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { chooseIndividualAccountAction } from '@/lib/merchant/actions';

const INDIVIDUAL_POINTS = ['Send parcels whenever you need', 'Same-day and next-day delivery', 'Pay per delivery, no commitment'];
const MERCHANT_POINTS = ['Flat-rate merchant pricing', 'Bulk and regular business shipments', 'Cash-on-delivery collection for your orders'];

const AccountTypeChoice = () => {
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
            <h2 id="choice-individual" className="text-xl font-semibold">Individual</h2>
            <p className="text-sm text-muted-foreground">For personal deliveries.</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {INDIVIDUAL_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
          <Button type="button" size="lg" className="mt-auto" onClick={chooseIndividual} loading={isSaving}>
            Continue as Individual
            <ArrowRight aria-hidden />
          </Button>
        </section>

        <section className={card} aria-labelledby="choice-merchant">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Building2 className="size-6" aria-hidden />
          </span>
          <div>
            <h2 id="choice-merchant" className="text-xl font-semibold">Merchant</h2>
            <p className="text-sm text-muted-foreground">For companies shipping regularly or in bulk.</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {MERCHANT_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" variant="outline" className="mt-auto">
            <Link href="/dashboard/customer/merchant/apply">
              Apply for a Merchant account
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Merchant accounts are reviewed by our team. You can book as an individual while you wait.
          </p>
        </section>
      </div>
      <FieldError message={error ?? undefined} />
    </div>
  );
};

export default AccountTypeChoice;
