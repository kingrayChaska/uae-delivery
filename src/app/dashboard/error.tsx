'use client';

import { useEffect } from 'react';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';

const DashboardError = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) => {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error('Dashboard failed to load', error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <CircleAlert className="size-8 text-destructive" aria-hidden />
      <p role="alert" className="font-medium">
        {t('generic')}
      </p>
      <Button variant="outline" onClick={reset}>
        {t('retry')}
      </Button>
    </main>
  );
};

export default DashboardError;
