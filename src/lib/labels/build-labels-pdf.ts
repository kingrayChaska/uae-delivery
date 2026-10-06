// Builds one PDF from labels already on the page (ShipmentLabel, rendered
// by the server): each label is drawn to an image and placed on its own A5
// page — the label's print size — so the download looks exactly like the
// label the merchant knows. Runs in the browser, one label at a time, so
// memory stays flat; the libraries load only when a download starts.
//
// Speed matters at 200 labels a file. Each label is drawn straight to a
// canvas and handed to the PDF as a JPEG, which jsPDF stores as-is (a PNG
// it would decode and re-compress in JavaScript, which took longer than
// drawing the label). Only the fonts the labels actually use are embedded
// (embedLabelFonts) instead of every font the app loads.

// A5 in millimetres, and the label print margin (globals.css @page
// shipment-label).
const PAGE = { width: 148, height: 210 };
const MARGIN = 8;
// ~220 dpi at print size: sharp text, QR codes that scan.
const PIXEL_RATIO = 2;
// High enough that black-on-white text and QR modules stay clean.
const JPEG_QUALITY = 0.92;

const waitForImages = async (nodes: HTMLElement[]) => {
  const images = nodes.flatMap((node) => Array.from(node.querySelectorAll('img')));
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => reject(new Error(`Label image failed to load: ${image.alt}`)), { once: true });
        });
      }
      if (image.naturalWidth === 0) throw new Error(`Label image failed to load: ${image.alt}`);
    }),
  );
};

// ── Fonts ───────────────────────────────────────────────────────────────────

const familyName = (value: string) => value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();

// "U+0000-00FF, U+0131, U+04??" -> [[0, 255], [305, 305], [1024, 1279]]
export const parseUnicodeRange = (value: string): [number, number][] =>
  value
    .split(',')
    .map((part) => part.trim().replace(/^U\+/i, ''))
    .filter(Boolean)
    .map((part) => {
      if (part.includes('?')) return [parseInt(part.replace(/\?/g, '0'), 16), parseInt(part.replace(/\?/g, 'F'), 16)];
      const [start, end = start] = part.split('-');
      return [parseInt(start, 16), parseInt(end, 16)];
    });

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// The @font-face rules the labels need — their font families (fallbacks
// included: Arabic text falls back to the Arabic face), only the alphabets
// their text contains — with each font file inlined, so the label images
// draw in the real fonts. Every weight of a family is kept: the browser
// picks the nearest weight it has (bold mono text uses the 500 face), and
// leaving one out would change which face it picks.
const embedLabelFonts = async (nodes: HTMLElement[]): Promise<string> => {
  const families = new Set<string>();
  const codepoints = new Set<number>();
  for (const node of nodes) {
    for (const element of [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))]) {
      const style = getComputedStyle(element);
      style.fontFamily.split(',').forEach((family) => families.add(familyName(family)));
    }
    for (const char of node.textContent ?? '') codepoints.add(char.codePointAt(0)!);
  }

  const faces: { rule: CSSFontFaceRule; base: string }[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // another origin's stylesheet
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) faces.push({ rule, base: sheet.href ?? location.href });
    }
  }

  const needed = faces.filter(({ rule }) => {
    if (!families.has(familyName(rule.style.getPropertyValue('font-family')))) return false;
    const range = rule.style.getPropertyValue('unicode-range');
    if (!range) return true;
    const ranges = parseUnicodeRange(range);
    return [...codepoints].some((cp) => ranges.some(([start, end]) => cp >= start && cp <= end));
  });

  const css = await Promise.all(
    needed.map(async ({ rule, base }) => {
      const [, url] = rule.style.getPropertyValue('src').match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/) ?? [];
      if (!url) return '';
      const response = await fetch(new URL(url, base));
      if (!response.ok) throw new Error(`Label font failed to load: ${url}`);
      const data = await toDataUrl(await response.blob());
      const format = /\.woff2(\?|$)/.test(url) ? 'woff2' : /\.woff(\?|$)/.test(url) ? 'woff' : 'truetype';
      return rule.cssText.replace(/src\s*:[^;]+;/, `src: url("${data}") format("${format}");`);
    }),
  );
  return css.join('\n');
};

// ── PDF ─────────────────────────────────────────────────────────────────────

export type BuildLabelsPdfOptions = {
  onProgress?: (done: number, total: number) => void;
};

// Throws if any label can't be drawn: a PDF with a label missing would
// leave a parcel without one.
export const buildLabelsPdf = async (nodes: HTMLElement[], { onProgress }: BuildLabelsPdfOptions = {}): Promise<Blob> => {
  if (nodes.length === 0) throw new Error('No labels to download');

  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);

  await document.fonts.ready;
  await waitForImages(nodes);
  const fontEmbedCSS = await embedLabelFonts(nodes);

  const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait', compress: true });
  const box = { width: PAGE.width - MARGIN * 2, height: PAGE.height - MARGIN * 2 };

  for (const [index, node] of nodes.entries()) {
    const { offsetWidth, offsetHeight } = node;
    if (!offsetWidth || !offsetHeight) throw new Error('A label has no size');
    const canvas = await toCanvas(node, { pixelRatio: PIXEL_RATIO, backgroundColor: '#ffffff', fontEmbedCSS });
    const image = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    // Free the bitmap now rather than whenever the GC gets to it.
    canvas.width = 0;
    canvas.height = 0;
    // As large as fits the page, keeping the label's proportions, at the top.
    const scale = Math.min(box.width / offsetWidth, box.height / offsetHeight);
    const width = offsetWidth * scale;
    const height = offsetHeight * scale;
    if (index > 0) pdf.addPage('a5', 'portrait');
    pdf.addImage(image, 'JPEG', (PAGE.width - width) / 2, MARGIN, width, height);
    onProgress?.(index + 1, nodes.length);
    // Let the progress bar paint between labels.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return pdf.output('blob');
};

// Hands the file to the browser as a download.
export const saveFile = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the browser to start reading it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

// "BLK-20261006-ABCD-labels.pdf", with the part when there are several.
export const labelsFileName = (reference: string, part: number, parts: number) => {
  const safe = reference.replace(/[^A-Za-z0-9_-]+/g, '-');
  return parts > 1 ? `${safe}-labels-part-${part}-of-${parts}.pdf` : `${safe}-labels.pdf`;
};
