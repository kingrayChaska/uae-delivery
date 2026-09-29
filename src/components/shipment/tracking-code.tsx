import { useTranslations } from 'next-intl';

import CopyButton from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';

type TrackingCodeProps = {
  code: string;
  size?: 'sm' | 'lg';
  className?: string;
};

// The customer-facing tracking ID (8 characters, no look-alike symbols —
// migration 0022), shown large enough to read out over the phone. Always
// left-to-right, so it never reads backwards inside Arabic text.
const TrackingCode = ({ code, size = 'sm', className = '' }: TrackingCodeProps) => {
  const t = useTranslations('shipments');
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-sm text-muted-foreground">{t('trackingId')}</span>
      <span
        dir="ltr"
        className={cn(
          'select-all rounded-lg bg-secondary px-2.5 py-1 font-brand-mono font-semibold tracking-[0.18em] text-secondary-foreground',
          size === 'lg' ? 'text-xl' : 'text-base',
        )}
      >
        {code}
      </span>
      <CopyButton value={code} description={t('trackingIdSpoken', { code: code.split('').join(' ') })} />
    </div>
  );
};

export default TrackingCode;
