'use client';

import AssignDriverPanel from '@/components/operator/assign-driver-panel';
import { useAvailableDrivers } from '@/lib/hooks/use-available-drivers';

import type { Coordinates } from '@/lib/types';

type ReassignDriverSectionProps = {
  shipmentId: string;
  pickup: Coordinates;
  mode: 'assign' | 'reassign';
};

const ReassignDriverSection = ({ shipmentId, pickup, mode }: ReassignDriverSectionProps) => {
  const { drivers, isLoading } = useAvailableDrivers(pickup);

  if (isLoading) return <p className="text-sm text-muted-foreground">Finding available drivers…</p>;
  return <AssignDriverPanel shipmentId={shipmentId} drivers={drivers} mode={mode} />;
};

export default ReassignDriverSection;
