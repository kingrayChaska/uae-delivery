'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronDown, LoaderCircle, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { MAX_QUERY_LENGTH, STATUS_FILTERS, hasFilters, parseShipmentFilters, shipmentListHref } from '@/lib/shipment/filters';

import type { ShipmentFilters as Filters, StatusFilter } from '@/lib/shipment/filters';

type ShipmentFiltersProps = {
  basePath: string;
  filters: Filters;
  // Whose wording: the customer's, the driver's or staff's list (same keys).
  messages?: 'customer.deliveries.filters' | 'driver.deliveries.filters' | 'operator.shipments.filters';
  // The statuses this list offers.
  statuses?: readonly StatusFilter[];
  // Today's date (YYYY-MM-DD, UAE): shows a one-tap "Today" filter.
  today?: string;
  // Date and status folded away until opened (or in use), so the search
  // box stays near the top of a phone screen.
  collapsible?: boolean;
  // The list's own parameters that aren't filters (e.g. the staff list's
  // ?type=), kept through searching and clearing.
  keep?: Record<string, string>;
};

// Search and filters for a customer's, a driver's or staff's shipments. A plain
// GET form, so the filters live in the URL (refresh, share, Back all work,
// and it works before JavaScript loads); with JavaScript it navigates to
// the tidy URL without empty parameters. The database does the matching.
const ShipmentFilters = ({
  basePath,
  filters,
  messages = 'customer.deliveries.filters',
  statuses = STATUS_FILTERS,
  today,
  collapsible = false,
  keep = {},
}: ShipmentFiltersProps) => {
  const t = useTranslations(messages);
  const tStatus = useTranslations('shipments.status');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Remounted with the URL's values whenever they change (key below).
  const key = shipmentListHref(basePath, filters, 1, keep);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = parseShipmentFilters({
      scope: filters.scope,
      q: String(data.get('q') ?? ''),
      status: String(data.get('status') ?? ''),
      from: String(data.get('from') ?? ''),
      to: String(data.get('to') ?? ''),
    }, statuses);
    // New filters start again from page 1.
    startTransition(() => router.push(shipmentListHref(basePath, next, 1, keep)));
  };

  const narrowed = filters.status !== 'all' || filters.from !== null || filters.to !== null;
  const dateAndStatus = (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="shipment-from">{t('from')}</Label>
          <Input id="shipment-from" name="from" type="date" defaultValue={filters.from ?? ''} className="min-w-0" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="shipment-to">{t('to')}</Label>
          <Input id="shipment-to" name="to" type="date" defaultValue={filters.to ?? ''} className="min-w-0" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="shipment-status">{t('status')}</Label>
          <Select id="shipment-status" name="status" defaultValue={filters.status}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? t('allStatuses') : status === 'active' ? t('active') : tStatus(status)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{t('dateHint')}</p>
    </>
  );

  return (
    <form
      key={key}
      method="get"
      action={basePath}
      onSubmit={onSubmit}
      role="search"
      aria-label={t('label')}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
    >
      {/* Whose list (My bookings / the business) isn't a filter: kept. */}
      {filters.scope === 'business' ? <input type="hidden" name="scope" value="business" /> : null}
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="shipment-search">{t('search')}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="shipment-search"
            name="q"
            type="search"
            defaultValue={filters.q}
            maxLength={MAX_QUERY_LENGTH}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            enterKeyHint="search"
            aria-describedby="shipment-search-hint"
            className="ps-9"
          />
        </div>
        <p id="shipment-search-hint" className="text-xs text-muted-foreground">
          {t('searchHint')}
        </p>
      </div>

      {collapsible ? (
        <details open={narrowed} className="group">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
            {t('more')}
          </summary>
          <div className="mt-2 flex flex-col gap-3">{dateAndStatus}</div>
        </details>
      ) : (
        dateAndStatus
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Search aria-hidden />}
          {t('apply')}
        </Button>
        {today && (filters.from !== today || filters.to !== today) ? (
          <Button asChild variant="outline">
            <Link href={shipmentListHref(basePath, { ...filters, from: today, to: today }, 1, keep)}>
              <CalendarDays aria-hidden />
              {t('today')}
            </Link>
          </Button>
        ) : null}
        {hasFilters(filters) ? (
          <Button asChild variant="ghost">
            <Link href={shipmentListHref(basePath, { scope: filters.scope }, 1, keep)}>
              <X aria-hidden />
              {t('clear')}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
};

export default ShipmentFilters;
