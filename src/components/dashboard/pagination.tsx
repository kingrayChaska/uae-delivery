import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  totalPages: number;
  // The list page's own path (it may already carry filters); the page
  // number is added as page=n.
  href: string;
};

const Pagination = ({ page, totalPages, href }: PaginationProps) => {
  if (totalPages <= 1) return null;

  const pageHref = (n: number) => `${href}${href.includes('?') ? '&' : '?'}page=${n}`;
  const linkClass =
    'inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
  const disabledClass = 'inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 opacity-40';

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} className={linkClass} rel="prev">
          <ChevronLeft className="size-4" aria-hidden />
          Newer
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          <ChevronLeft className="size-4" aria-hidden />
          Newer
        </span>
      )}
      <span className="font-brand-mono text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={pageHref(page + 1)} className={linkClass} rel="next">
          Older
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Older
          <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  );
};

export default Pagination;
