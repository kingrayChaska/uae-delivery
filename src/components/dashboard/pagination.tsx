import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

type PaginationProps = {
  page: number;
  totalPages: number;
  // The list page's own path (it may already carry filters); the page
  // number is added as page=n.
  href: string;
};

const Pagination = ({ page, totalPages, href }: PaginationProps) => {
  const t = useTranslations('common.pagination');
  if (totalPages <= 1) return null;

  const pageHref = (n: number) => `${href}${href.includes('?') ? '&' : '?'}page=${n}`;
  const linkClass =
    'inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
  const disabledClass = 'inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 opacity-40';
  // "Back" and "forward" arrows point the reading direction's way.
  const back = <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />;
  const forward = <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />;

  return (
    <nav aria-label={t('label')} className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} className={linkClass} rel="prev">
          {back}
          {t('newer')}
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          {back}
          {t('newer')}
        </span>
      )}
      <span className="font-brand-mono text-xs text-muted-foreground">{t('page', { page, pages: totalPages })}</span>
      {page < totalPages ? (
        <Link href={pageHref(page + 1)} className={linkClass} rel="next">
          {t('older')}
          {forward}
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          {t('older')}
          {forward}
        </span>
      )}
    </nav>
  );
};

export default Pagination;
