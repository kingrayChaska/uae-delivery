'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { generateStatementAction } from '@/lib/finance/actions';
import { periodPresets } from '@/lib/finance/schemas';

type StatementGenerateFormProps = {
  merchants: { id: string; name: string; active: boolean }[];
  // Today in Dubai, from the server, so the presets and the date limit match
  // the database's idea of "today".
  today: string;
  defaultMerchantId?: string | null;
};

// Picks a merchant and a period and asks the database for a DRAFT statement.
// Every amount is computed there; the draft opens for review, and only an
// explicit Publish shows it to the merchant.
const StatementGenerateForm = ({ merchants, today, defaultMerchantId }: StatementGenerateFormProps) => {
  const t = useTranslations('finance.statements.generate');
  const router = useRouter();
  const ids = useId();
  const presets = periodPresets(today);
  const [merchantId, setMerchantId] = useState(defaultMerchantId ?? '');
  const [from, setFrom] = useState(presets.lastMonth.from);
  const [to, setTo] = useState(presets.lastMonth.to);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const inFlight = useRef(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!merchantId) {
      setError('finance.validation.merchant');
      return;
    }
    inFlight.current = true;
    setIsPending(true);
    setError(null);
    const result = await generateStatementAction({ businessAccountId: merchantId, from, to }).catch(() => ({
      success: false as const,
      error: 'finance.errors.generateFailed',
    }));
    if (!result.success) {
      inFlight.current = false;
      setIsPending(false);
      setError(result.error);
      return;
    }
    router.push(`/dashboard/manager/statements/${result.id}?generated=1`);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-merchant`}>{t('merchant')}</Label>
        <Select id={`${ids}-merchant`} value={merchantId} onChange={(event) => setMerchantId(event.target.value)} aria-required>
          <option value="">{t('chooseMerchant')}</option>
          {merchants.map((merchant) => (
            <option key={merchant.id} value={merchant.id}>
              {merchant.active ? merchant.name : t('inactive', { name: merchant.name })}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">{t('period')}</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(presets) as (keyof typeof presets)[]).map((key) => {
            const selected = presets[key].from === from && presets[key].to === to;
            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={selected ? 'secondary' : 'outline'}
                aria-pressed={selected}
                onClick={() => {
                  setFrom(presets[key].from);
                  setTo(presets[key].to);
                }}
              >
                {t(`presets.${key}`)}
              </Button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-from`}>{t('from')}</Label>
            <Input id={`${ids}-from`} type="date" value={from} max={to || today} onChange={(event) => setFrom(event.target.value)} aria-required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-to`}>{t('to')}</Label>
            <Input id={`${ids}-to`} type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} aria-required />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('timezone')}</p>
      </fieldset>

      <FieldError message={error} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
};

export default StatementGenerateForm;
