'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { useFormat } from '@/i18n/hooks';
import { createExpenseReportAction } from '@/lib/finance/expense-report-actions';
import { EXPENSE_PERIOD_KINDS, reportPeriod } from '@/lib/finance/expense-reports';

import type { ExpensePeriodKind } from '@/lib/finance/expense-reports';

// Starts an expense report for a week (Monday–Sunday), a calendar month or
// a custom range: any day of the week or month will do. The database takes
// in every unreported expense dated inside it and refuses a period that
// overlaps another of the operator's reports (migration 0052).
const PrepareExpenseReportForm = ({ today, basePath }: { today: string; basePath: string }) => {
  const t = useTranslations('finance.reports.prepare');
  const tKind = useTranslations('finance.reports.kind');
  const format = useFormat();
  const router = useRouter();
  const ids = useId();
  const [kind, setKind] = useState<ExpensePeriodKind>('week');
  const [day, setDay] = useState(today);
  const [to, setTo] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  // One request id per attempt: a double click opens one report.
  const requestId = useRef(crypto.randomUUID());
  const period = reportPeriod(kind, day, kind === 'custom' ? to : undefined);

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (isPending) return;
        setIsPending(true);
        setError(null);
        const result = await createExpenseReportAction({ kind, from: period.from, to: period.to, requestId: requestId.current }).catch(() => ({
          success: false as const,
          error: 'errors.generic',
        }));
        setIsPending(false);
        if (!result.success) {
          setError(result.error);
          requestId.current = crypto.randomUUID();
          return;
        }
        router.push(`${basePath}/reports/${result.id}`);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-kind`}>{t('kind')}</Label>
          <Select id={`${ids}-kind`} value={kind} onChange={(e) => setKind(e.target.value as ExpensePeriodKind)}>
            {EXPENSE_PERIOD_KINDS.map((k) => (
              <option key={k} value={k}>
                {tKind(k)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-day`}>{kind === 'custom' ? t('from') : kind === 'week' ? t('anyDayOfWeek') : t('anyDayOfMonth')}</Label>
          <Input id={`${ids}-day`} type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        {kind === 'custom' ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-to`}>{t('to')}</Label>
            <Input id={`${ids}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        ) : null}
      </div>
      <p className="text-sm" role="status">
        {t('period', { from: format.calendarDate(period.from), to: format.calendarDate(period.to) })}
      </p>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <FieldError message={error} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? t('creating') : t('create')}
        </Button>
      </div>
    </form>
  );
};

export default PrepareExpenseReportForm;
