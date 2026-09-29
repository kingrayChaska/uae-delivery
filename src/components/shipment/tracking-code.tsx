import CopyButton from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';

type TrackingCodeProps = {
  code: string;
  size?: 'sm' | 'lg';
  className?: string;
};

// The customer-facing tracking ID (8 characters, no look-alike symbols —
// migration 0022), shown large enough to read out over the phone.
const TrackingCode = ({ code, size = 'sm', className = '' }: TrackingCodeProps) => {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-sm text-muted-foreground">Tracking ID</span>
      <span
        className={cn(
          'select-all rounded-lg bg-secondary px-2.5 py-1 font-brand-mono font-semibold tracking-[0.18em] text-secondary-foreground',
          size === 'lg' ? 'text-xl' : 'text-base',
        )}
      >
        {code}
      </span>
      <CopyButton value={code} description={`tracking ID ${code.split('').join(' ')}`} />
    </div>
  );
};

export default TrackingCode;
