import { useTranslations } from 'next-intl';

// Placeholder shown while a dashboard page loads. Screen readers hear
// "Loading…" in the page's language instead of a silent pulse.
const PageSkeleton = ({ stats = 4, rows = 5 }: { stats?: number; rows?: number }) => {
  const t = useTranslations('common.states');
  return (
    <main className="flex flex-1 flex-col gap-6 p-6 animate-pulse motion-reduce:animate-none" aria-busy="true">
      <span role="status" className="sr-only">
        {t('loading')}
      </span>
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: stats }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-16 rounded-md bg-muted" />
        ))}
      </div>
    </main>
  );
};

export default PageSkeleton;
