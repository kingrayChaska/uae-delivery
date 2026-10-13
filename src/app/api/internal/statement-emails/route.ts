import { NextResponse } from 'next/server';

import { isWorkerRequest } from '@/lib/bulk/worker';
import { processStatementEmails } from '@/services/notifications/statement-emails';

import type { NextRequest } from 'next/server';

export const maxDuration = 60;

// GET: the cron sweep for "statement ready" emails (migration 0045) — sends
// anything queued whose immediate send didn't happen, and due retries.
// Same secret as the bulk worker and operator emails (Authorization:
// Bearer $CRON_SECRET). Takes no input; everyone else gets a 404.
export const GET = async (request: NextRequest) => {
  if (!isWorkerRequest(request.headers.get('authorization'))) return new NextResponse('Not found', { status: 404 });
  const summary = await processStatementEmails({ limit: 50 });
  return NextResponse.json(summary);
};
