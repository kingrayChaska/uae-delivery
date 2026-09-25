import { BOOKING_STEPS } from '@/lib/hooks/use-booking-wizard';

const STEP_LABELS: Record<(typeof BOOKING_STEPS)[number], string> = {
  pickup: 'Pickup',
  dropoff: 'Delivery',
  package: 'Package',
  payment: 'Payment',
  review: 'Review',
};

type BookingProgressProps = {
  stepIndex: number;
};

const BookingProgress = ({ stepIndex }: BookingProgressProps) => {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {BOOKING_STEPS.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
              index <= stepIndex
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground'
            }`}
          >
            {index + 1}
          </span>
          <span
            className={`text-sm ${index === stepIndex ? 'font-medium' : 'hidden text-muted-foreground sm:inline'}`}
          >
            {STEP_LABELS[step]}
          </span>
          {index < BOOKING_STEPS.length - 1 ? (
            <span className="mx-0.5 h-px w-3 bg-border sm:mx-1 sm:w-6" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
};

export default BookingProgress;
