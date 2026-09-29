import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import TrackingTimeline from '@/components/shipment/tracking-timeline';
import TrackingCode from '@/components/shipment/tracking-code';
import { getTrackingMilestones } from '@/lib/shipment/tracking-milestones';
import { useFormat } from '@/i18n/hooks';

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
  const t = useTranslations('tracking.result');
  const tShipments = useTranslations('shipments');
  const format = useFormat();
  const milestones = getTrackingMilestones(tracking.status, history);
  const hasLiveLocation = tracking.driverLat !== null && tracking.driverLng !== null;

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <TrackingCode code={tracking.trackingNumber} />
        <Badge variant={STATUS_BADGE_VARIANT[tracking.status] ?? 'default'}>{tShipments(`status.${tracking.status}`)}</Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <TrackingTimeline milestones={milestones} terminalStatus={tracking.status} />

        {hasLiveLocation ? (
          <p className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">
            {tracking.driverLocationUpdatedAt
              ? t('liveLocation', { time: format.time(tracking.driverLocationUpdatedAt) })
              : t('liveLocationRecently')}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">{t('signInHint')}</p>
      </CardContent>
    </Card>
  );
};

export default TrackingResult;
