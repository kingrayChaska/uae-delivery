import Link from 'next/link';

type PaginationProps = {
  page: number;
  totalPages: number;
  // The list page's own path; the page number is added as ?page=n.
  href: string;
};

const Pagination = ({ page, totalPages, href }: PaginationProps) => {
  if (totalPages <= 1) return null;

  const linkClass = 'rounded-md border px-3 py-1.5 hover:bg-secondary/60';
  const disabledClass = 'rounded-md border px-3 py-1.5 opacity-40';

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link href={`${href}?page=${page - 1}`} className={linkClass}>
          ← Newer
        </Link>
      ) : (
        <span className={disabledClass}>← Newer</span>
      )}
      <span className="font-brand-mono text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={`${href}?page=${page + 1}`} className={linkClass}>
          Older →
        </Link>
      ) : (
        <span className={disabledClass}>Older →</span>
      )}
    </nav>
  );
};

export default Pagination;
