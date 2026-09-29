import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { BOOKING_STEPS } from '@/lib/hooks/use-booking-wizard';

type BookingProgressProps = {
  stepIndex: number;
};

const BookingProgress = ({ stepIndex }: BookingProgressProps) => {
  const t = useTranslations('booking.progress');
  return (
    <nav aria-label={t('label')}>
      <ol className="grid grid-cols-4 gap-2">
        {BOOKING_STEPS.map((step, index) => {
          const done = index < stepIndex;
          const current = index === stepIndex;
          return (
            <li key={step} className="flex flex-col gap-2" aria-current={current ? 'step' : undefined}>
              <span className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <span
                  className={`block h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none ${
                    done || current ? 'w-full' : 'w-0'
                  }`}
                />
              </span>
              <span
                className={`flex items-center gap-1.5 text-xs sm:text-sm ${
                  current ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {done ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                <span className={current ? '' : 'hidden sm:inline'}>{t(step)}</span>
                <span className="sr-only">{done ? ` ${t('completed')}` : current ? ` ${t('current')}` : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default BookingProgress;
