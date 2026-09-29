import { Card, CardContent } from '@/components/ui/card';

import type { LucideIcon } from 'lucide-react';

type StatCardProps = {
  label: string;
  value: string;
  icon?: LucideIcon;
};

const StatCard = ({ label, value, icon: Icon }: StatCardProps) => {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate font-brand-mono text-2xl font-semibold">{value}</p>
        </div>
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default StatCard;
