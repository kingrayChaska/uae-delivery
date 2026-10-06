'use client';

import { Clock, LoaderCircle, Route, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useFormat } from '@/i18n/hooks';

import type { RouteResult } from '@/lib/maps/types';

type RouteSummaryProps = {
  route: RouteResult | null;
  calculating: boolean;
  // The lowest price across delivery types for this route, or null —
  // always null for customers, who see the fee only once they've chosen
  // Same Day or Next Day (on the review step).
  fromPrice: number | null;
  currency: string;
  showPrice: boolean;
};

// Driving distance, drive time and (staff only) starting price for the trip
// on screen — all from Google's route, calculated by the server. Nothing is
// shown until that route exists: no estimates.
const RouteSummary = ({ route, calculating, fromPrice, currency, showPrice }: RouteSummaryProps) => {
  const t = useTranslations('booking.routeSummary');
  const format = useFormat();

  if (calculating && !route) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
        {showPrice ? t('calculating') : t('calculatingRoute')}
      </p>
    );
  }
  if (!route) return null;

  const items = [
    { icon: Route, label: t('distance'), value: format.km(route.distanceKm) },
    { icon: Clock, label: t('duration'), value: format.duration(route.durationMinutes) },
    ...(showPrice && fromPrice !== null ? [{ icon: Wallet, label: t('price'), value: t('from', { price: format.money(fromPrice, currency) }) }] : []),
  ];

  return (
    <dl
      aria-live="polite"
      className={`grid grid-cols-1 gap-3 rounded-xl border bg-secondary/40 p-4 animate-in fade-in-0 duration-200 motion-reduce:animate-none ${
        items.length === 3 ? 'min-[420px]:grid-cols-3' : 'min-[420px]:grid-cols-2'
      }`}
    >
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-3 min-[420px]:flex-col min-[420px]:items-start min-[420px]:gap-1">
          <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Icon className="size-3.5 text-primary" aria-hidden />
            {label}
          </dt>
          <dd className="ms-auto font-semibold min-[420px]:ms-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

export default RouteSummary;
