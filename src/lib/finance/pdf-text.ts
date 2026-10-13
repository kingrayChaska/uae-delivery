import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import type { jsPDF } from 'jspdf';

// Arabic and Latin text for the statement PDF (lib/finance/statement-pdf.ts).
//
// Fonts: IBM Plex Sans Arabic, the app's own Arabic typeface, from the
// @fontsource package already installed. It ships WOFF files split by
// script (an Arabic subset and a Latin subset); jsPDF needs TrueType, and
// WOFF 1.0 is just TrueType with zlib-compressed tables, so the files are
// unpacked here with Node's zlib — no extra dependency. Arabic letters are
// drawn with the Arabic subset, everything else with the Latin one.
//
// Direction: jsPDF shapes Arabic (joined letter forms) and puts a run of
// Arabic letters in right-to-left order itself. What it can't do is order a
// line that mixes Arabic and Latin — "شركة النور LLC" — so visualSegments()
// applies a small version of the Unicode bidi rules: each character is
// Arabic (strong right-to-left), Latin/digit (strong left-to-right) or
// neutral (spaces, punctuation); neutrals between two runs of the same
// direction take it, others take the line's direction; right-to-left runs
// are reversed. That covers names, addresses and labels, which is all a
// statement contains. Characters neither font has (CJK, Cyrillic…) are
// drawn as "?" and reported, so the PDF can say so.

// ── Character classes ─────────────────────────────────────────────────────

const inRanges = (cp: number, ranges: [number, number][]) => ranges.some(([from, to]) => cp >= from && cp <= to);

// From the font's own subset definitions (unicode.json).
const ARABIC: [number, number][] = [
  [0x0600, 0x06ff], [0x0750, 0x077f], [0x0870, 0x08ff], [0xfb50, 0xfdff], [0xfe70, 0xfefc],
];
const LATIN: [number, number][] = [
  [0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc], [0x02c6, 0x02c6], [0x02da, 0x02da],
  [0x02dc, 0x02dc], [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2191, 0x2191], [0x2193, 0x2193],
  [0x2212, 0x2212], [0x2215, 0x2215],
];

export const isArabic = (cp: number) => inRanges(cp, ARABIC);
const isLatinCovered = (cp: number) => inRanges(cp, LATIN);

type Strength = 'R' | 'L' | 'N';
const strength = (char: string): Strength => {
  const cp = char.codePointAt(0)!;
  // Arabic letters, and Arabic-Indic digits, read right to left.
  if (isArabic(cp) && !/[،؛؟۔]/.test(char)) return 'R';
  if (/[\p{L}\p{N}]/u.test(char)) return 'L';
  return 'N';
};

// Arabic punctuation is drawn as its own piece: inside a word's piece,
// jsPDF's shaping would move it to the end of the line.
const ARABIC_PUNCTUATION = /[\u060c\u061b\u061f\u06d4]/;
// Vowel marks and the tatweel: jsPDF's shaper doesn't place them, so they
// would break the word; the text reads correctly without them.
const ARABIC_MARKS = /[\u0640\u064b-\u065f\u0670]/g;

const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };

export type FontRole = 'arabic' | 'latin';
export type Segment = { text: string; font: FontRole };
export type Direction = 'ltr' | 'rtl';

export const baseDirection = (text: string): Direction => {
  for (const char of text) {
    const s = strength(char);
    if (s !== 'N') return s === 'R' ? 'rtl' : 'ltr';
  }
  return 'ltr';
};

// Replaces what neither font can draw with "?". `replaced` says whether any was.
export const drawable = (text: string): { text: string; replaced: boolean } => {
  let replaced = false;
  const out = [...text.replace(ARABIC_MARKS, '')]
    .map((char) => {
      const cp = char.codePointAt(0)!;
      if (isArabic(cp) || isLatinCovered(cp)) return char;
      replaced = true;
      return '?';
    })
    .join('');
  return { text: out, replaced };
};

// The line as segments in left-to-right drawing order. Arabic segments are
// given in logical order — jsPDF shapes and reverses them as it draws.
export const visualSegments = (input: string, base: Direction = baseDirection(input)): Segment[] => {
  const chars = [...drawable(input).text];
  if (chars.length === 0) return [];
  const classes = chars.map(strength);

  // Resolve neutrals from their strong neighbours.
  const baseClass: Strength = base === 'rtl' ? 'R' : 'L';
  const resolved = [...classes];
  for (let i = 0; i < chars.length; ) {
    if (classes[i] !== 'N') {
      i += 1;
      continue;
    }
    let j = i;
    while (j < chars.length && classes[j] === 'N') j += 1;
    const before = i > 0 ? resolved[i - 1] : baseClass;
    const after = j < chars.length ? classes[j] : baseClass;
    const value = before === after ? before : baseClass;
    for (let k = i; k < j; k += 1) resolved[k] = value;
    i = j;
  }

  // Direction runs, in logical order.
  const runs: { dir: Strength; chars: string[] }[] = [];
  chars.forEach((char, i) => {
    const last = runs.at(-1);
    if (last && last.dir === resolved[i]) last.chars.push(char);
    else runs.push({ dir: resolved[i], chars: [char] });
  });
  if (base === 'rtl') runs.reverse();

  const segments: Segment[] = [];
  const push = (text: string, font: FontRole) => {
    const last = segments.at(-1);
    if (last && last.font === font && font === 'latin') last.text += text;
    else segments.push({ text, font });
  };

  for (const run of runs) {
    if (run.dir === 'L') {
      for (const char of run.chars) push(char, isArabic(char.codePointAt(0)!) ? 'arabic' : 'latin');
      continue;
    }
    // Right-to-left run: split into font pieces (Arabic words, and the
    // spaces/punctuation between them), then lay the pieces out reversed.
    const pieces: Segment[] = [];
    for (const char of run.chars) {
      const font: FontRole = isArabic(char.codePointAt(0)!) ? 'arabic' : 'latin';
      const last = pieces.at(-1);
      const separate = ARABIC_PUNCTUATION.test(char) || (last !== undefined && ARABIC_PUNCTUATION.test(last.text));
      if (last && last.font === font && !separate) last.text += char;
      else pieces.push({ text: char, font });
    }
    for (const piece of pieces.reverse()) {
      if (piece.font === 'arabic') segments.push(piece);
      else push([...piece.text].reverse().map((c) => MIRROR[c] ?? c).join(''), 'latin');
    }
  }
  return segments;
};

// ── Fonts ─────────────────────────────────────────────────────────────────

// WOFF 1.0 → TrueType: the same tables, inflated, behind a standard header.
export const woffToTtf = (woff: Buffer): Buffer => {
  if (woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('Not a WOFF font');
  const flavor = woff.readUInt32BE(4);
  const count = woff.readUInt16BE(12);
  const tables = Array.from({ length: count }, (_, i) => {
    const o = 44 + i * 20;
    return {
      tag: woff.toString('latin1', o, o + 4),
      offset: woff.readUInt32BE(o + 4),
      compLength: woff.readUInt32BE(o + 8),
      origLength: woff.readUInt32BE(o + 12),
      checksum: woff.readUInt32BE(o + 16),
    };
  });
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= count) {
    searchRange *= 2;
    entrySelector += 1;
  }
  const header = Buffer.alloc(12 + 16 * count);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(count, 4);
  header.writeUInt16BE(searchRange * 16, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(count * 16 - searchRange * 16, 10);
  const parts: Buffer[] = [];
  let offset = header.length;
  tables.forEach((table, i) => {
    let data = woff.subarray(table.offset, table.offset + table.compLength);
    if (table.compLength < table.origLength) data = inflateSync(data);
    if (data.length !== table.origLength) throw new Error(`Bad WOFF table ${table.tag}`);
    const r = 12 + i * 16;
    header.write(table.tag, r, 'latin1');
    header.writeUInt32BE(table.checksum, r + 4);
    header.writeUInt32BE(offset, r + 8);
    header.writeUInt32BE(table.origLength, r + 12);
    const padding = (4 - (data.length % 4)) % 4;
    parts.push(data, Buffer.alloc(padding));
    offset += data.length + padding;
  });
  return Buffer.concat([header, ...parts]);
};

// next.config.ts includes these files in the PDF route's serverless bundle.
const FONT_DIR = join(process.cwd(), 'node_modules', '@fontsource', 'ibm-plex-sans-arabic', 'files');
const FONT_FILES = {
  arabic: { normal: 'ibm-plex-sans-arabic-arabic-400-normal.woff', bold: 'ibm-plex-sans-arabic-arabic-600-normal.woff' },
  latin: { normal: 'ibm-plex-sans-arabic-latin-400-normal.woff', bold: 'ibm-plex-sans-arabic-latin-600-normal.woff' },
} as const;
export const FONT_FAMILY: Record<FontRole, string> = { arabic: 'PlexArabic', latin: 'PlexLatin' };

let cache: { role: FontRole; style: 'normal' | 'bold'; file: string; data: string }[] | null = null;

const loadFonts = () => {
  cache ??= (Object.keys(FONT_FILES) as FontRole[]).flatMap((role) =>
    (['normal', 'bold'] as const).map((style) => ({
      role,
      style,
      file: FONT_FILES[role][style].replace('.woff', '.ttf'),
      data: woffToTtf(readFileSync(join(FONT_DIR, FONT_FILES[role][style]))).toString('binary'),
    })),
  );
  return cache;
};

export const registerFonts = (pdf: jsPDF) => {
  for (const font of loadFonts()) {
    pdf.addFileToVFS(font.file, font.data);
    pdf.addFont(font.file, FONT_FAMILY[font.role], font.style);
  }
};

// ── Drawing ───────────────────────────────────────────────────────────────

export type TextStyle = { size: number; bold?: boolean; color?: number };

const selectFont = (pdf: jsPDF, role: FontRole, style: TextStyle) => {
  pdf.setFont(FONT_FAMILY[role], style.bold ? 'bold' : 'normal');
  pdf.setFontSize(style.size);
};

export const measureText = (pdf: jsPDF, text: string, style: TextStyle) =>
  visualSegments(text).reduce((width, segment) => {
    selectFont(pdf, segment.font, style);
    return width + pdf.getTextWidth(segment.text);
  }, 0);

// Draws one line; `x` is its left, right or centre edge per `align`.
export const drawText = (pdf: jsPDF, text: string, x: number, y: number, style: TextStyle & { align?: 'left' | 'right' }) => {
  const segments = visualSegments(text);
  const width = measureText(pdf, text, style);
  let cursor = style.align === 'right' ? x - width : x;
  pdf.setTextColor(style.color ?? 20);
  for (const segment of segments) {
    selectFont(pdf, segment.font, style);
    pdf.text(segment.text, cursor, y);
    cursor += pdf.getTextWidth(segment.text);
  }
  return width;
};

// The text shortened (with "…") to fit `maxWidth`.
export const fitText = (pdf: jsPDF, text: string, maxWidth: number, style: TextStyle) => {
  if (measureText(pdf, text, style) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && measureText(pdf, `${chars.join('').trimEnd()}…`, style) > maxWidth) chars.pop();
  return `${chars.join('').trimEnd()}…`;
};

// Breaks text into lines no wider than `maxWidth`, at spaces.
export const wrapText = (pdf: jsPDF, text: string, maxWidth: number, style: TextStyle) => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureText(pdf, candidate, style) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
};
