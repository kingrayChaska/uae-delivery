import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { publicUrl } from '@/lib/auth/public-url';

// The merchant bulk background worker runs at /api/internal/bulk-worker
// (route handler), so validation carries on after the merchant closes the
// tab. Each run checks rows for up to WORKER_BUDGET_MS, then — if rows are
// still pending — starts the next run itself. A cron hitting the same
// route sweeps up anything an interrupted chain left behind.
//
// Needs BULK_WORKER_SECRET (or Vercel's CRON_SECRET). Without one the
// worker is off and the merchant's open review screen does all the
// checking itself, as it always can.

export const WORKER_BUDGET_MS = 45_000;

const secrets = () =>
  [...new Set([process.env.BULK_WORKER_SECRET, process.env.CRON_SECRET].filter((value): value is string => Boolean(value && value.length >= 16)))];

export const workerEnabled = () => secrets().length > 0;

// Constant-time check of "Authorization: Bearer <secret>".
export const isWorkerRequest = (authorization: string | null) => {
  const expectedSecrets = secrets();
  if (expectedSecrets.length === 0 || !authorization?.startsWith('Bearer ')) return false;
  const given = Buffer.from(authorization.slice('Bearer '.length));
  let valid = false;
  for (const expected of expectedSecrets) {
    const wanted = Buffer.from(expected);
    const matches = given.length === wanted.length && timingSafeEqual(given, wanted);
    valid = matches || valid;
  }
  return valid;
};

// Starts a worker run for one batch. The route answers at once (the work
// happens after its response), so this only waits for that answer.
export const startBulkWorker = async (batchId: string): Promise<void> => {
  const [workerSecret] = secrets();
  if (!workerSecret) return;
  try {
    const response = await fetch(publicUrl('/api/internal/bulk-worker'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error('Bulk worker refused to start', response.status);
  } catch (error) {
    // Not fatal: the review screen checks rows itself while it's open.
    console.error('Bulk worker could not be started', error instanceof Error ? error.message : error);
  }
};
