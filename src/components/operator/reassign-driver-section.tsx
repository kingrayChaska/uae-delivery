'use client';

import { useTranslations } from 'next-intl';

import AssignDriverPanel from '@/components/operator/assign-driver-panel';
import { useAvailableDrivers } from '@/lib/hooks/use-available-drivers';

import type { Coordinates } from '@/lib/types';

type ReassignDriverSectionProps = {
  shipmentId: string;
  pickup: Coordinates;
  mode: 'assign' | 'reassign';
};

const ReassignDriverSection = ({ shipmentId, pickup, mode }: ReassignDriverSectionProps) => {
  const t = useTranslations('operator.dispatch');
  const { drivers, isLoading } = useAvailableDrivers(pickup);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('finding')}</p>;
  return <AssignDriverPanel shipmentId={shipmentId} drivers={drivers} mode={mode} />;
};

export default ReassignDriverSection;
