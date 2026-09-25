import { cn } from '@/lib/utils';

import type { ComponentProps } from 'react';

export const Card = ({ className = '', ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="card"
    className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}
    {...props}
  />
);

export const CardHeader = ({ className = '', ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="card-header"
    className={cn('flex flex-col gap-1.5 px-6 pt-6', className)}
    {...props}
  />
);

export const CardTitle = ({ className = '', ...props }: ComponentProps<'h3'>) => (
  <h3 data-slot="card-title" className={cn('font-semibold leading-none', className)} {...props} />
);

export const CardDescription = ({ className = '', ...props }: ComponentProps<'p'>) => (
  <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export const CardContent = ({ className = '', ...props }: ComponentProps<'div'>) => (
  <div data-slot="card-content" className={cn('px-6 pb-6', className)} {...props} />
);

export const CardFooter = ({ className = '', ...props }: ComponentProps<'div'>) => (
  <div data-slot="card-footer" className={cn('flex items-center px-6 pb-6', className)} {...props} />
);
