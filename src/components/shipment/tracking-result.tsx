import Badge from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import TrackingTimeline from '@/components/shipment/tracking-timeline';
import TrackingCode from '@/components/shipment/tracking-code';
import { formatShipmentStatus } from '@/lib/shipment/format';
import { getTerminalNegativeMessage, getTrackingMilestones } from '@/lib/shipment/tracking-milestones';

import type { PublicTrackingResult, TrackingHistoryEntry } from '@/services/tracking/get-shipment-tracking';

type TrackingResultProps = {
  tracking: PublicTrackingResult;
  history: TrackingHistoryEntry[];
};

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  delivered: 'success',
  cancelled: 'destructive',
  delivery_failed: 'destructive',
  returned: 'warning',
};

const TrackingResult = ({ tracking, history }: TrackingResultProps) => {
  const terminalMessage = getTerminalNegativeMessage(tracking.status);
  const milestones = getTrackingMilestones(tracking.status, history);
  const hasLiveLocation = tracking.driverLat !== null && tracking.driverLng !== null;

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <TrackingCode code={tracking.trackingNumber} />
        <Badge variant={STATUS_BADGE_VARIANT[tracking.status] ?? 'default'}>{formatShipmentStatus(tracking.status)}</Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <TrackingTimeline milestones={milestones} terminalMessage={terminalMessage} />

        {hasLiveLocation ? (
          <p className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">
            Your driver is on the move — last seen{' '}
            {tracking.driverLocationUpdatedAt
              ? new Intl.DateTimeFormat('en-AE', { timeStyle: 'short', timeZone: 'Asia/Dubai' }).format(new Date(tracking.driverLocationUpdatedAt))
              : 'recently'}
            .
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Sent this parcel? Sign in to see proof of delivery and full shipment details.
        </p>
      </CardContent>
    </Card>
  );
};

export default TrackingResult;
