// Expense receipt files (migration 0053): what may be uploaded, and how a
// file's real type is told from its first bytes rather than its name or the
// type the browser claims. Shared by the upload route (server) and the
// expense form (early, friendly feedback only).

export const RECEIPT_BUCKET = 'expense-receipts';

export const RECEIPT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
// PDF receipts stay accepted, as 0052 allowed them.
export const RECEIPT_TYPES = [...RECEIPT_IMAGE_TYPES, 'application/pdf'] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

// Under the 4.5 MB request body limit of the hosting platform's functions
// (the bucket itself allows 5 MB). Phone photos are shrunk in the browser
// before upload, so a receipt picture is usually well below this.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const MAX_RECEIPTS_PER_EXPENSE = 10;

export const RECEIPT_EXTENSION: Record<ReceiptType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

// "<uploader's id>/receipt-<uuid>.<ext>" — the folder is checked against the
// session again by the database before a file is attached.
export const RECEIPT_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;
export const isReceiptPath = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 300 && RECEIPT_PATH.test(value) && !value.includes('..');

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);

// The file's type from its signature, or null if it is none of the accepted
// ones (whatever its name or claimed type).
export const sniffReceiptType = (bytes: Uint8Array): ReceiptType | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  // %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
};

// A display name without folders or control characters.
export const cleanFileName = (name: string) =>
  name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 200);

export type ReceiptRef = { path: string; name: string | null };

// An attached receipt as pages show it.
export type ExpenseReceipt = {
  path: string;
  name: string | null;
  contentType: string | null;
  // Short-lived signed link, or null if storage wouldn't sign one.
  url: string | null;
};
