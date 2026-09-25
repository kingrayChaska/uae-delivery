import { cn } from '@/lib/utils';

import type { ComponentProps } from 'react';

const Checkbox = ({ className = '', ...props }: ComponentProps<'input'>) => {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'size-4 shrink-0 rounded-sm border border-input accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
};

export default Checkbox;
