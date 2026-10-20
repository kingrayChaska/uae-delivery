'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import { setFinancialRatesAction } from '@/lib/finance/actions';
import { useFormat } from '@/i18n/hooks';

import type { FinancialRate } from '@/services/finance/rates';

type FinancialRatesCardProps = {
  rates: FinancialRate[];
  today: string;
};

const pct = (rate: number) => `${Math.round(rate * 10000) / 100}%`;

// The return-charge rate (migration 0045; the cash-handling charge was
// removed in 0051). A new rate
// takes effect from a chosen day (today or later); every shipment is
// charged at the rate in force on the day it was completed, so nothing
// already earned or issued changes.
const FinancialRatesCard = ({ rates, today }: FinancialRatesCardProps) => {
  const t = useTranslations('finance.rates');
  const format = useFormat();
  const router = useRouter();
  const ids = useId();
  const current = rates.find((r) => r.effectiveFrom <= today);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [returnPercent, setReturnPercent] = useState(current ? String(Math.round(current.returnChargeRate * 10000) / 100) : '50');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {current ? (
        <p className="text-sm">
          {t('current', { returnRate: pct(current.returnChargeRate) })}
        </p>
      ) : null}
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsPending(true);
          setError(null);
          setSaved(false);
          const result = await setFinancialRatesAction({
            effectiveFrom,
            returnChargePercent: Number(returnPercent),
            note: note || undefined,
          }).catch(() => ({ success: false as const, error: 'errors.generic' }));
          setIsPending(false);
          if (!result.success) {
            setError(result.error);
            return;
          }
          setSaved(true);
          setNote('');
          router.refresh();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-from`}>{t('effectiveFrom')}</Label>
            <Input id={`${ids}-from`} type="date" min={today} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-return`}>{t('returnRate')}</Label>
            <Input id={`${ids}-return`} inputMode="decimal" dir="ltr" value={returnPercent} onChange={(e) => setReturnPercent(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`${ids}-note`}>{t('note')}</Label>
            <Input id={`${ids}-note`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
        <p className="text-xs text-muted-foreground">{t('noHandling')}</p>
        <FieldError message={error} />
        {saved ? (
          <p role="status" className="text-sm font-medium text-primary">
            {t('saved')}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('saving') : t('submit')}
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('history')}</caption>
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t('col.from')}</th>
              <th scope="col" className="px-3 py-2 text-end font-medium">{t('col.returnRate')}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t('col.note')}</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">
                  {rate.effectiveFrom <= '2000-01-01' ? t('fromStart') : format.calendarDate(rate.effectiveFrom)}
                  {rate.id === current?.id ? <span className="ms-2 text-xs text-primary">{t('inForce')}</span> : null}
                  {rate.effectiveFrom > today ? <span className="ms-2 text-xs text-muted-foreground">{t('scheduled')}</span> : null}
                </td>
                <td dir="ltr" className="px-3 py-2 text-end font-brand-mono rtl:text-left">{pct(rate.returnChargeRate)}</td>
                <td className="px-3 py-2 wrap-break-word">{rate.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FinancialRatesCard;
