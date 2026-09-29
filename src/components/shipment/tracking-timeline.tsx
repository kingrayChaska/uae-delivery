import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useFormat } from '@/i18n/hooks';

import type { TrackingMilestone } from '@/lib/shipment/tracking-milestones';
import type { ShipmentStatus } from '@/lib/types';

type TrackingTimelineProps = {
  milestones: TrackingMilestone[];
  dark?: boolean;
  // Adds the cancelled / failed / returned step at the end, when relevant.
  terminalStatus?: ShipmentStatus | null;
};

const TERMINAL_STATUSES = ['cancelled', 'delivery_failed', 'returned'] as const;
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];
const isTerminal = (status: ShipmentStatus | null): status is TerminalStatus =>
  (TERMINAL_STATUSES as readonly string[]).includes(status ?? '');

// Milestone labels and descriptions are translated by the milestone's key
// (tracking.milestones.<key>); lib/shipment/tracking-milestones.ts only
// decides which steps are done.
const TrackingTimeline = ({ milestones, dark = false, terminalStatus = null }: TrackingTimelineProps) => {
  const t = useTranslations('tracking');
  const format = useFormat();
  const muted = dark ? 'text-brand-paper/45' : 'text-muted-foreground';
  const strong = dark ? 'text-brand-paper' : 'text-foreground';
  const terminal = isTerminal(terminalStatus) ? terminalStatus : null;

  return (
    <ol className="flex flex-col" aria-label={t('timeline.label')}>
      {milestones.map((milestone, index) => {
        const last = index === milestones.length - 1 && !terminal;
        const key = milestone.key;
        return (
          <li key={milestone.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={milestone.current ? 'step' : undefined}>
            {last ? null : (
              <span
                aria-hidden
                className={`absolute inset-s-2.75 top-7 h-[calc(100%-1.5rem)] w-0.5 rounded-full ${
                  milestones[index + 1]?.done ? 'bg-brand-route' : dark ? 'bg-brand-paper/15' : 'bg-border'
                }`}
              />
            )}
            <span
              className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                milestone.done
                  ? 'border-brand-route bg-brand-route text-brand-paper'
                  : dark
                    ? 'border-brand-paper/25 bg-transparent'
                    : 'border-border bg-background'
              } ${milestone.current ? 'ring-4 ring-brand-route/20' : ''}`}
            >
              {milestone.done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
            </span>
            <div className="-mt-0.5 flex min-w-0 flex-col">
              <span className={`font-medium ${milestone.done ? strong : muted}`}>
                {t(`milestones.${key}.label`)}
                <span className="sr-only"> — {milestone.done ? t('timeline.done') : t('timeline.notYet')}</span>
              </span>
              {milestone.current ? <span className={`text-sm ${muted}`}>{t(`milestones.${key}.description`)}</span> : null}
              {milestone.reachedAt ? (
                <time dateTime={milestone.reachedAt} className={`font-brand-mono text-xs ${muted}`}>
                  {format.dateTime(milestone.reachedAt)}
                </time>
              ) : null}
            </div>
          </li>
        );
      })}
      {terminal ? (
        <li className="relative flex gap-3">
          <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-destructive bg-destructive text-destructive-foreground">
            <span className="text-xs font-bold" aria-hidden>
              !
            </span>
          </span>
          <span className="-mt-0.5 font-medium text-destructive">{t(`terminal.${terminal}`)}</span>
        </li>
      ) : null}
    </ol>
  );
};

export default TrackingTimeline;
