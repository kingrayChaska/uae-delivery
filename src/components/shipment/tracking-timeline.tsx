import { Check } from 'lucide-react';

import type { TrackingMilestone } from '@/lib/shipment/tracking-milestones';

type TrackingTimelineProps = {
  milestones: TrackingMilestone[];
  dark?: boolean;
  // Adds the cancelled / failed / returned step at the end, when relevant.
  terminalMessage?: string | null;
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' }).format(new Date(value));

const TrackingTimeline = ({ milestones, dark = false, terminalMessage = null }: TrackingTimelineProps) => {
  const muted = dark ? 'text-brand-paper/45' : 'text-muted-foreground';
  const strong = dark ? 'text-brand-paper' : 'text-foreground';

  return (
    <ol className="flex flex-col" aria-label="Shipment progress">
      {milestones.map((milestone, index) => {
        const last = index === milestones.length - 1 && !terminalMessage;
        return (
          <li key={milestone.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={milestone.current ? 'step' : undefined}>
            {last ? null : (
              <span
                aria-hidden
                className={`absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-0.5 rounded-full ${
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
                {milestone.label}
                <span className="sr-only">{milestone.done ? ' — done' : ' — not yet'}</span>
              </span>
              {milestone.current ? <span className={`text-sm ${muted}`}>{milestone.description}</span> : null}
              {milestone.reachedAt ? (
                <time dateTime={milestone.reachedAt} className={`font-brand-mono text-xs ${muted}`}>
                  {formatTime(milestone.reachedAt)}
                </time>
              ) : null}
            </div>
          </li>
        );
      })}
      {terminalMessage ? (
        <li className="relative flex gap-3">
          <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-destructive bg-destructive text-destructive-foreground">
            <span className="text-xs font-bold" aria-hidden>
              !
            </span>
          </span>
          <span className="-mt-0.5 font-medium text-destructive">{terminalMessage}</span>
        </li>
      ) : null}
    </ol>
  );
};

export default TrackingTimeline;
