import Badge from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import TrackingTimeline from '@/components/shipment/tracking-timeline';
import { formatEta, formatShipmentStatus } from '@/lib/shipment/format';
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
  const milestones = getTrackingMilestones(tracking.status);
  const hasLiveLocation = tracking.driverLat !== null && tracking.driverLng !== null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <p className="font-brand-mono text-sm text-muted-foreground">{tracking.trackingNumber}</p>
          <p className="mt-1 text-lg font-medium">{formatShipmentStatus(tracking.status)}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[tracking.status] ?? 'default'}>
          {formatShipmentStatus(tracking.status)}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 font-brand-mono text-sm">
          <div>
            <p className="text-muted-foreground">Distance</p>
            <p className="text-base">{tracking.distanceKm.toFixed(1)} km</p>
          </div>
          <div>
            <p className="text-muted-foreground">Estimated time</p>
            <p className="text-base">{formatEta(tracking.estimatedDurationMinutes)}</p>
          </div>
        </div>

        {terminalMessage ? (
          <p className="text-sm text-muted-foreground">{terminalMessage}</p>
        ) : (
          <TrackingTimeline milestones={milestones} />
        )}

        {hasLiveLocation ? (
          <p className="text-sm text-muted-foreground">
            Driver last seen at {tracking.driverLat?.toFixed(4)}, {tracking.driverLng?.toFixed(4)}.
            A live map view arrives with the maps integration.
          </p>
        ) : null}

        {history.length > 0 ? (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none">Full status history</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {history.map((entry) => (
                <li key={`${entry.status}-${entry.createdAt}`} className="flex justify-between">
                  <span>{formatShipmentStatus(entry.status)}</span>
                  <span className="font-brand-mono">{new Date(entry.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default TrackingResult;
