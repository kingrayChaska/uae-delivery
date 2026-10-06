import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';

type StatCardProps = {
  label: string;
  value: string;
  icon?: LucideIcon;
  // Opens the list this number counts (e.g. the shipments it filters to).
  // The whole card is then one link, named by its label and value.
  href?: string;
};

const StatCard = ({ label, value, icon: Icon, href }: StatCardProps) => {
  const card = (
    <Card className={cn('h-full transition-shadow hover:shadow-md', href && 'group-hover:border-primary/40 group-hover:bg-secondary/30')}>
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate font-brand-mono text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {Icon ? (
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
          ) : null}
          {href ? (
            <ArrowRight
              className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
              aria-hidden
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  if (!href) return card;
  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {card}
    </Link>
  );
};

export default StatCard;
