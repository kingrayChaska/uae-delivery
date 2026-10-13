import { describe, expect, it } from 'vitest';

import { amountInWords, integerInWords, splitAmount } from '@/lib/finance/amount-in-words';

describe('amountInWords', () => {
  it('spells the brief’s examples', () => {
    expect(amountInWords(8150)).toBe('Eight Thousand One Hundred Fifty UAE Dirhams Only');
    expect(amountInWords('2450.00')).toBe('Two Thousand Four Hundred Fifty UAE Dirhams Only');
  });

  it('handles zero, one and plurals', () => {
    expect(amountInWords(0)).toBe('Zero UAE Dirhams Only');
    expect(amountInWords('0.00')).toBe('Zero UAE Dirhams Only');
    expect(amountInWords(1)).toBe('One UAE Dirham Only');
    expect(amountInWords(2)).toBe('Two UAE Dirhams Only');
    expect(amountInWords(0.01)).toBe('Zero UAE Dirhams and One Fils Only');
    expect(amountInWords('1.25')).toBe('One UAE Dirham and Twenty-Five Fils Only');
  });

  it('handles teens, tens and hyphenation', () => {
    expect(integerInWords(11)).toBe('Eleven');
    expect(integerInWords(40)).toBe('Forty');
    expect(integerInWords(99)).toBe('Ninety-Nine');
    expect(integerInWords(101)).toBe('One Hundred One');
    expect(integerInWords(1000)).toBe('One Thousand');
    expect(integerInWords(1_000_001)).toBe('One Million One');
    expect(integerInWords(12_345)).toBe('Twelve Thousand Three Hundred Forty-Five');
  });

  it('handles large amounts', () => {
    expect(amountInWords('1234567890.50')).toBe(
      'One Billion Two Hundred Thirty-Four Million Five Hundred Sixty-Seven Thousand Eight Hundred Ninety UAE Dirhams and Fifty Fils Only',
    );
    expect(() => amountInWords('1000000000000000')).toThrow(RangeError);
  });

  it('handles negative amounts', () => {
    expect(amountInWords(-2450)).toBe('Minus Two Thousand Four Hundred Fifty UAE Dirhams Only');
    expect(amountInWords('-0.00')).toBe('Zero UAE Dirhams Only');
  });

  it('rounds to fils exactly as the figure is shown', () => {
    // 0.1 + 0.2 in floating point is 0.30000000000000004: still 30 fils.
    expect(splitAmount(0.1 + 0.2)).toEqual({ negative: false, dirhams: 0, fils: 30 });
    expect(splitAmount('10.005')).toEqual({ negative: false, dirhams: 10, fils: 1 });
    expect(splitAmount('9.995')).toEqual({ negative: false, dirhams: 10, fils: 0 });
    expect(splitAmount('149.994')).toEqual({ negative: false, dirhams: 149, fils: 99 });
    // Two-decimal amounts (all the database stores) round-trip exactly.
    for (const value of [0.07, 1.15, 1005.1, 8150, 99999.99, 2873.4]) {
      const { dirhams, fils } = splitAmount(value);
      expect(`${dirhams}.${String(fils).padStart(2, '0')}`).toBe(value.toFixed(2));
    }
  });

  it('rejects things that are not amounts', () => {
    expect(() => amountInWords('12,000')).toThrow(RangeError);
    expect(() => amountInWords(Number.NaN)).toThrow(RangeError);
  });
});
