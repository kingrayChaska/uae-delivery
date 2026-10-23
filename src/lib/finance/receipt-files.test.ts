import { describe, expect, it } from 'vitest';

import { cleanFileName, isReceiptPath, sniffReceiptType } from '@/lib/finance/receipt-files';

// Receipt uploads (migration 0053) are typed by their bytes, never by their
// name or the type a browser claims.

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));

describe('sniffReceiptType', () => {
  it.each([
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10), 'image/jpeg'],
    ['PNG', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0), 'image/png'],
    ['WebP', bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 '), 'image/webp'],
    ['PDF', bytes('%PDF-1.7\n'), 'application/pdf'],
  ])('recognises a %s', (_, file, type) => {
    expect(sniffReceiptType(file)).toBe(type);
  });

  it.each([
    ['an HTML page', bytes('<!doctype html><script>')],
    ['an SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ['a RIFF that isn’t WebP (WAV)', bytes('RIFF', 0x24, 0, 0, 0, 'WAVEfmt ')],
    ['a GIF', bytes('GIF89a')],
    ['HEIC', bytes(0, 0, 0, 0x18, 'ftypheic')],
    ['a truncated JPEG', bytes(0xff, 0xd8)],
    ['nothing', bytes()],
  ])('refuses %s', (_, file) => {
    expect(sniffReceiptType(file)).toBeNull();
  });
});

describe('isReceiptPath', () => {
  const folder = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  it('accepts "<uploader id>/<file>"', () => {
    expect(isReceiptPath(`${folder}/receipt-1.jpg`)).toBe(true);
  });
  it.each(['receipt.jpg', `${folder}/../x.jpg`, `${folder}/a/b.jpg`, `../${folder}/x.jpg`, 'https://x/y.jpg', `${folder}/x y.jpg`, 42, null])(
    'refuses %s',
    (path) => {
      expect(isReceiptPath(path)).toBe(false);
    },
  );
});

describe('cleanFileName', () => {
  it('keeps only the base name, without control characters', () => {
    expect(cleanFileName('C:\\fakepath\\IMG_0012.JPG')).toBe('IMG_0012.JPG');
    expect(cleanFileName('dir/sub/receipt\u0000.png')).toBe('receipt.png');
  });
});
