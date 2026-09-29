import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';
import { MERCHANT_STATUS_TONE } from '@/lib/merchant/schemas';

import type { MerchantStatus } from '@/lib/types';

const MerchantStatusBadge = ({ status }: { status: MerchantStatus }) => {
  const t = useTranslations('merchant.status');
  return <Badge variant={MERCHANT_STATUS_TONE[status]}>{t(status)}</Badge>;
};

export default MerchantStatusBadge;
