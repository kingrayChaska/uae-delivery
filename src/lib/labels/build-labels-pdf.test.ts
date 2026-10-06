import { describe, expect, it } from 'vitest';

import { labelsFileName } from '@/lib/labels/build-labels-pdf';

// The PDF itself is built in a real browser (checked with Chromium); the
// file name is plain logic.
describe('labelsFileName', () => {
  it('names the file after the bulk shipment', () => {
    expect(labelsFileName('BLK-20261006-ABCD', 1, 1)).toBe('BLK-20261006-ABCD-labels.pdf');
  });

  it('numbers the parts of a large bulk shipment', () => {
    expect(labelsFileName('BLK-20261006-ABCD', 2, 5)).toBe('BLK-20261006-ABCD-labels-part-2-of-5.pdf');
  });

  it('keeps the name safe for every file system', () => {
    expect(labelsFileName('BLK/../2026 x', 1, 1)).toBe('BLK-2026-x-labels.pdf');
  });
});
