import { after, NextResponse } from 'next/server';

import { isUuid } from '@/lib/security/validate';
import { WORKER_BUDGET_MS, isWorkerRequest, startBulkWorker } from '@/lib/bulk/worker';
import { runBulkWorker } from '@/services/bulk/merchant-bulk';

import type { NextRequest } from 'next/server';

// Room for one WORKER_BUDGET_MS run plus its bookkeeping.
export const maxDuration = 60;

// Not a user endpoint: only callers holding the worker secret (the app
// itself, or a cron) get past this. Everyone else gets a plain 404.
const notFound = () => new NextResponse('Not found', { status: 404 });

// POST { batchId }: check one batch's pending rows in the background, and
// keep going (a new run) until none are left.
export const POST = async (request: NextRequest) => {
  if (!isWorkerRequest(request.headers.get('authorization'))) return notFound();
  const body = (await request.json().catch(() => null)) as { batchId?: unknown } | null;
  const batchId = body?.batchId;
  if (!isUuid(batchId)) return new NextResponse('Bad request', { status: 400 });

  after(async () => {
    try {
      const { remaining } = await runBulkWorker({ batchId, budgetMs: WORKER_BUDGET_MS });
      if (remaining > 0) await startBulkWorker(batchId);
    } catch (error) {
      console.error('Bulk worker run failed', batchId, error instanceof Error ? error.message : error);
    }
  });
  return NextResponse.json({ started: true }, { status: 202 });
};

// GET: the optional cron sweep (Vercel Cron sends GET with
// "Authorization: Bearer $CRON_SECRET") — any draft batch's pending rows.
export const GET = async (request: NextRequest) => {
  if (!isWorkerRequest(request.headers.get('authorization'))) return notFound();
  const { processed } = await runBulkWorker({ batchId: null, budgetMs: WORKER_BUDGET_MS });
  return NextResponse.json({ processed });
};
