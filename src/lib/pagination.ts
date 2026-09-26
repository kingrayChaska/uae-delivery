// Every list page loads one page of rows, never the whole table: unbounded
// lists got slower with every shipment ever booked, and PostgREST silently
// caps a response at 1,000 rows anyway.
export const PAGE_SIZE = 50;

// Stops a hand-edited ?page=99999999 from asking Postgres for a huge offset.
const MAX_PAGE = 10_000;

export type Paginated<T> = { items: T[]; page: number; totalPages: number; total: number };

// Accepts a raw searchParams value; anything that isn't a sane positive
// integer falls back to page 1.
export const parsePage = (value: string | string[] | undefined): number => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PAGE) : 1;
};

// Inclusive row range for Supabase's .range(from, to).
export const pageRange = (page: number, size = PAGE_SIZE) => ({ from: (page - 1) * size, to: page * size - 1 });

export const toPaginated = <T>(items: T[], total: number, page: number, size = PAGE_SIZE): Paginated<T> => ({
  items,
  page,
  total,
  totalPages: Math.max(1, Math.ceil(total / size)),
});

export type PageSearchParams = Promise<{ page?: string | string[] }>;

// Merged lists (e.g. card payments + COD shipments) can't be offset in SQL,
// so each source returns its newest `mergeWindow(page)` rows and the merge
// is sliced in memory. Depth is capped at MAX_MERGED_ROWS — PostgREST won't
// return more than that per request anyway.
export const MAX_MERGED_ROWS = 1000;

export const mergeWindow = (page: number, size = PAGE_SIZE) => Math.min(page * size, MAX_MERGED_ROWS);

export const paginateMerged = <T extends { createdAt: string }>(
  sources: T[][],
  total: number,
  page: number,
  size = PAGE_SIZE,
): Paginated<T> => {
  const merged = sources.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reachable = Math.min(total, MAX_MERGED_ROWS);
  const lastPage = Math.max(1, Math.ceil(reachable / size));
  const current = Math.min(page, lastPage);
  const { from } = pageRange(current, size);
  return { items: merged.slice(from, from + size), page: current, total, totalPages: lastPage };
};
