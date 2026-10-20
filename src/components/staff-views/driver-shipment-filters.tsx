'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import {
  DRIVER_PERIODS,
  MAX_DRIVER_QUERY_LENGTH,
  driverDetailHref,
  hasDriverFilters,
  parseDriverDetailParams,
} from '@/lib/drivers/detail-filters';

import type { DriverDetailState, DriverPeriod } from '@/lib/drivers/detail-filters';

type DriverShipmentFiltersProps = {
  basePath: string;
  state: DriverDetailState;
};

// Search and reporting period for one driver's page. A plain GET form, so
// the state lives in the URL (refresh, share and Back work, and it works
// before JavaScript loads); the status filter rides along unchanged. It
// searches on submit — one request per search, not one per keystroke — and
// the database does the matching (migration 0049).
const DriverShipmentFilters = ({ basePath, state }: DriverShipmentFiltersProps) => {
  const t = useTranslations('operator.driverDetail');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState<DriverPeriod>(state.period);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = parseDriverDetailParams({
      q: String(data.get('q') ?? ''),
      status: state.status,
      period: String(data.get('period') ?? ''),
      from: String(data.get('from') ?? ''),
      to: String(data.get('to') ?? ''),
    });
    // A new search starts again from page 1; the driver is the path.
    startTransition(() => router.push(driverDetailHref(basePath, next)));
  };

  return (
    <form
      key={driverDetailHref(basePath, state)}
      method="get"
      action={basePath}
      onSubmit={onSubmit}
      role="search"
      aria-label={t('filters.label')}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
    >
      {state.status !== 'all' ? <input type="hidden" name="status" value={state.status} /> : null}
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="driver-shipment-search">{t('filters.search')}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="driver-shipment-search"
              name="q"
              type="search"
              defaultValue={state.q}
              maxLength={MAX_DRIVER_QUERY_LENGTH}
              placeholder={t('filters.searchPlaceholder')}
              autoComplete="off"
              enterKeyHint="search"
              aria-describedby="driver-shipment-search-hint"
              className="ps-9"
            />
          </div>
          <p id="driver-shipment-search-hint" className="text-xs text-muted-foreground">
            {t('filters.searchHint')}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="driver-period">{t('period.label')}</Label>
          <Select id="driver-period" name="period" value={period} onChange={(event) => setPeriod(event.target.value as DriverPeriod)}>
            {DRIVER_PERIODS.map((option) => (
              <option key={option} value={option}>
                {t(`period.${option}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {period === 'custom' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="driver-from">{t('period.from')}</Label>
            <Input id="driver-from" name="from" type="date" defaultValue={state.from ?? ''} className="min-w-0" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="driver-to">{t('period.to')}</Label>
            <Input id="driver-to" name="to" type="date" defaultValue={state.to ?? ''} className="min-w-0" />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Search aria-hidden />}
          {t('filters.apply')}
        </Button>
        {hasDriverFilters(state) ? (
          <Button asChild variant="ghost">
            {/* Clears the search and status; the period stays. */}
            <Link href={driverDetailHref(basePath, { period: state.period, from: state.from, to: state.to })}>
              <X aria-hidden />
              {t('filters.clear')}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
};

export default DriverShipmentFilters;
