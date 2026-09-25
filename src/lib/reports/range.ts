export type ReportRange = { from: Date; to: Date; fromParam: string; toParam: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toParam = (date: Date) => date.toISOString().slice(0, 10);

// Turns raw ?from=&to= query strings into a safe, bounded UTC range.
// Anything malformed falls back to the last 30 days; ranges are clamped to
// a year and swapped if reversed, so a hand-edited URL can't trigger an
// unbounded full-table report.
export const parseReportRange = (from?: string | null, to?: string | null, now: Date = new Date()): ReportRange => {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const parse = (value?: string | null) => {
    if (!value || !ISO_DATE.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || toParam(date) !== value ? null : date;
  };

  let end = parse(to) ?? today;
  let start = parse(from) ?? new Date(end.getTime() - 29 * DAY_MS);

  if (start > end) [start, end] = [end, start];
  if ((end.getTime() - start.getTime()) / DAY_MS >= MAX_RANGE_DAYS) {
    start = new Date(end.getTime() - (MAX_RANGE_DAYS - 1) * DAY_MS);
  }

  return { from: start, to: end, fromParam: toParam(start), toParam: toParam(end) };
};

// Exclusive upper bound for queries: the day after `to`, so the whole last
// day is included.
export const rangeEndExclusive = (range: ReportRange) => new Date(range.to.getTime() + DAY_MS);
