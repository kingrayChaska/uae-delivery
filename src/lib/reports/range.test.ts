import { describe, expect, it } from 'vitest';

import { parseReportRange, rangeEndExclusive } from '@/lib/reports/range';

const NOW = new Date('2026-09-24T15:30:00Z');

describe('parseReportRange', () => {
  it('defaults to the last 30 days, inclusive of today', () => {
    const range = parseReportRange(undefined, undefined, NOW);
    expect(range.fromParam).toBe('2026-08-26');
    expect(range.toParam).toBe('2026-09-24');
  });

  it('accepts a valid explicit range', () => {
    const range = parseReportRange('2026-09-01', '2026-09-10', NOW);
    expect([range.fromParam, range.toParam]).toEqual(['2026-09-01', '2026-09-10']);
  });

  it.each(['yesterday', '2026-13-01', '2026-02-30', "2026-09-01' or 1=1"])('rejects malformed date %s', (bad) => {
    expect(parseReportRange(bad, '2026-09-10', NOW).fromParam).toBe('2026-08-12');
  });

  it('swaps a reversed range', () => {
    const range = parseReportRange('2026-09-10', '2026-09-01', NOW);
    expect([range.fromParam, range.toParam]).toEqual(['2026-09-01', '2026-09-10']);
  });

  it('clamps ranges longer than a year', () => {
    const range = parseReportRange('2020-01-01', '2026-09-24', NOW);
    expect(range.fromParam).toBe('2025-09-24');
  });

  it('exclusive end is the day after `to`', () => {
    const range = parseReportRange('2026-09-01', '2026-09-10', NOW);
    expect(rangeEndExclusive(range).toISOString()).toBe('2026-09-11T00:00:00.000Z');
  });
});
