import { describe, expect, it } from 'vitest';

import { MAX_MERGED_ROWS, PAGE_SIZE, mergeWindow, pageRange, paginateMerged, parsePage, toPaginated } from '@/lib/pagination';

describe('pagination', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['0', 1],
    ['-3', 1],
    ['2.5', 1],
    ['abc', 1],
    ['3', 3],
    [['4', '9'], 4],
    ['99999999', 10_000],
  ])('parsePage(%j) = %i', (input, expected) => {
    expect(parsePage(input as string | string[] | undefined)).toBe(expected);
  });

  it('maps a page to an inclusive row range', () => {
    expect(pageRange(1)).toEqual({ from: 0, to: PAGE_SIZE - 1 });
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });

  it('always reports at least one page', () => {
    expect(toPaginated([], 0, 1).totalPages).toBe(1);
    expect(toPaginated([], PAGE_SIZE + 1, 1).totalPages).toBe(2);
  });
});

describe('paginateMerged', () => {
  const at = (day: number) => ({ createdAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z` });

  it('interleaves sources newest-first and slices the requested page', () => {
    const a = [at(9), at(5), at(1)];
    const b = [at(8), at(4)];
    const first = paginateMerged([a, b], 5, 1, 2);
    expect(first.items).toEqual([at(9), at(8)]);
    expect(first.totalPages).toBe(3);
    expect(paginateMerged([a, b], 5, 3, 2).items).toEqual([at(1)]);
  });

  it('caps depth at MAX_MERGED_ROWS', () => {
    const result = paginateMerged([[]], MAX_MERGED_ROWS * 3, 1);
    expect(result.totalPages).toBe(MAX_MERGED_ROWS / PAGE_SIZE);
    expect(result.total).toBe(MAX_MERGED_ROWS * 3);
    expect(mergeWindow(1000)).toBe(MAX_MERGED_ROWS);
  });
});
