import Badge from '@/components/ui/badge';
import { MERCHANT_STATUS_COPY } from '@/lib/merchant/schemas';

import type { MerchantStatus } from '@/lib/types';

const MerchantStatusBadge = ({ status }: { status: MerchantStatus }) => {
  const { label, tone } = MERCHANT_STATUS_COPY[status];
  return <Badge variant={tone}>{label}</Badge>;
};

export default MerchantStatusBadge;
