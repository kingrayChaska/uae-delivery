'use client';

import { useTranslations } from 'next-intl';

import AssignDriverPanel from '@/components/operator/assign-driver-panel';
import { useAvailableDrivers } from '@/lib/hooks/use-available-drivers';

import type { Coordinates } from '@/lib/types';

type ReassignDriverSectionProps = {
  shipmentId: string;
  pickup: Coordinates;
  mode: 'assign' | 'reassign';
  currentDriverId: string | null;
};

const ReassignDriverSection = ({ shipmentId, pickup, mode, currentDriverId }: ReassignDriverSectionProps) => {
  const t = useTranslations('operator.dispatch');
  // Refetched when the assignee changes, so active-delivery counts follow.
  const { drivers, isLoading } = useAvailableDrivers(pickup, currentDriverId);

  if (isLoading && drivers.length === 0) return <p className="text-sm text-muted-foreground">{t('finding')}</p>;
  return <AssignDriverPanel shipmentId={shipmentId} drivers={drivers} mode={mode} currentDriverId={currentDriverId} />;
};

export default ReassignDriverSection;
