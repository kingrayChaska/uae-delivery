import { Check } from 'lucide-react';

import type { TrackingMilestone } from '@/lib/shipment/tracking-milestones';

type TrackingTimelineProps = {
  milestones: TrackingMilestone[];
  dark?: boolean;
};

const TrackingTimeline = ({ milestones, dark = false }: TrackingTimelineProps) => {
  return (
    <ol className="flex flex-col gap-3">
      {milestones.map((milestone) => (
        <li key={milestone.key} className="flex items-center gap-3">
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
              milestone.done
                ? 'border-brand-route bg-brand-route text-brand-paper'
                : dark
                  ? 'border-brand-paper/25 text-transparent'
                  : 'border-brand-ink/20 text-transparent'
            }`}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <span
            className={
              milestone.done
                ? dark
                  ? 'text-brand-paper'
                  : 'text-brand-ink'
                : dark
                  ? 'text-brand-paper/45'
                  : 'text-brand-ink/40'
            }
          >
            {milestone.label}
          </span>
        </li>
      ))}
    </ol>
  );
};

export default TrackingTimeline;
