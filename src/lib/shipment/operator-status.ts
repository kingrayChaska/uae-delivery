import { z } from '@/lib/zod';

import { SHIPMENT_STATUSES } from '@/lib/types';

import type { ShipmentStatus } from '@/lib/types';

export const OPERATOR_STATUS_OPTIONS = ['pending', 'cancel', 'delivered', 'returned'] as const;
export type OperatorStatusOption = (typeof OPERATOR_STATUS_OPTIONS)[number];

export const OPERATOR_STATUS_CANONICAL: Record<OperatorStatusOption, ShipmentStatus> = {
  pending: 'confirmed',
  cancel: 'cancelled',
  delivered: 'delivered',
  returned: 'returned',
};

export const operatorStatusChangeSchema = z.object({
  shipmentId: z.string().uuid(),
  expectedStatus: z.enum(SHIPMENT_STATUSES),
  status: z.enum(OPERATOR_STATUS_OPTIONS),
  reason: z.string().max(500).optional(),
  requestId: z.string().uuid(),
});

export type OperatorStatusChangeInput = z.input<typeof operatorStatusChangeSchema>;
