import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';

import { baseDirection, drawable, measureText, registerFonts, visualSegments, woffToTtf, wrapText } from '@/lib/finance/pdf-text';

// Arabic and mixed-script text in the statement PDF. jsPDF shapes a run of
// Arabic letters and reverses it itself; visualSegments() decides the order
// of the runs on a line and which font draws each piece.

const segs = (text: string) => visualSegments(text).map((s) => `${s.font === 'arabic' ? 'A' : 'L'}[${s.text}]`).join(' ');

describe('visualSegments', () => {
  it('leaves Latin text as one Latin piece', () => {
    expect(segs('AED 8,150.00')).toBe('L[AED 8,150.00]');
    expect(segs('Alpha Trading LLC')).toBe('L[Alpha Trading LLC]');
  });

  it('lays Arabic words out right to left, spaces in the Latin font', () => {
    expect(baseDirection('محمد علي')).toBe('rtl');
    expect(segs('محمد علي')).toBe('A[علي] L[ ] A[محمد]');
  });

  it('keeps a Latin run inside Arabic text in reading order', () => {
    // Read right to left: شركة النور LLC
    expect(segs('شركة النور LLC')).toBe('L[LLC ] A[النور] L[ ] A[شركة]');
    expect(segs('رقم 12345')).toBe('L[12345 ] A[رقم]');
  });

  it('keeps an Arabic word inside Latin text in place', () => {
    expect(segs('Attn: محمد')).toBe('L[Attn: ] A[محمد]');
  });

  it('draws Arabic punctuation on its own, so it stays between the words', () => {
    // Read right to left: القوز، دبي
    expect(segs('القوز، دبي')).toBe('A[دبي] L[ ] A[،] A[القوز]');
  });

  it('drops vowel marks and the tatweel the PDF shaper can’t place', () => {
    expect(drawable('متبقٍ مسدَّد لـ').text).toBe('متبق مسدد ل');
  });

  it('mirrors brackets in right-to-left text', () => {
    expect(segs('محمد (مدير)')).toBe('L[(] A[مدير] L[) ] A[محمد]');
  });

  it('replaces what neither font has, and says so', () => {
    expect(drawable('张三 Ltd')).toEqual({ text: '?? Ltd', replaced: true });
    expect(drawable('محمد – Ltd · €')).toEqual({ text: 'محمد – Ltd · €', replaced: false });
    expect(segs('张三')).toBe('L[??]');
  });

  it('handles empty and neutral-only text', () => {
    expect(visualSegments('')).toEqual([]);
    expect(segs(' - ')).toBe('L[ - ]');
  });
});

describe('fonts', () => {
  const file = (name: string) => readFileSync(join(process.cwd(), 'node_modules/@fontsource/ibm-plex-sans-arabic/files', name));

  it('unpacks the WOFF fonts into TrueType', () => {
    const ttf = woffToTtf(file('ibm-plex-sans-arabic-arabic-400-normal.woff'));
    expect(ttf.readUInt32BE(0)).toBe(0x00010000);
    const tables = Array.from({ length: ttf.readUInt16BE(4) }, (_, i) => ttf.toString('latin1', 12 + i * 16, 16 + i * 16));
    expect(tables).toEqual(expect.arrayContaining(['cmap', 'glyf', 'head', 'hmtx', 'loca']));
    expect(() => woffToTtf(Buffer.from('not a font'))).toThrow();
  });

  it('measures and wraps mixed text with the embedded fonts', () => {
    const pdf = new jsPDF({ unit: 'mm' });
    registerFonts(pdf);
    const style = { size: 10 };
    expect(measureText(pdf, 'محمد', style)).toBeGreaterThan(0);
    expect(measureText(pdf, 'Alpha محمد', style)).toBeGreaterThan(measureText(pdf, 'Alpha', style));
    const lines = wrapText(pdf, 'كل التوصيلات المكتملة خلال الفترة بتوقيت الإمارات مرة واحدة لكل منها', 40, style);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureText(pdf, line, style)).toBeLessThanOrEqual(40);
  });
});
