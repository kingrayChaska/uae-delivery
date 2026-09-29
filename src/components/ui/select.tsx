import { cn } from '@/lib/utils';

import type { ComponentProps } from 'react';

const Select = ({ className = '', ...props }: ComponentProps<'select'>) => {
  return (
    <select
      data-slot="select"
      className={cn(
        'flex h-11 w-full rounded-lg border border-input bg-background px-3 py-1 text-base shadow-xs sm:h-10 sm:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
};

export default Select;
