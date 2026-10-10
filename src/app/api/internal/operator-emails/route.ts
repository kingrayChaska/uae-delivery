import { NextResponse } from 'next/server';

import { isWorkerRequest } from '@/lib/bulk/worker';
import { processOperatorBookingEmails } from '@/services/notifications/operator-booking-emails';

import type { NextRequest } from 'next/server';

export const maxDuration = 60;

// GET: the cron sweep for operator booking emails (migration 0043) — sends
// anything queued whose immediate send didn't happen, and due retries.
// Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; the same secret
// as the bulk worker. It takes no input: what is sent, and to whom, comes
// only from the queue and server configuration. Everyone else gets a 404.
export const GET = async (request: NextRequest) => {
  if (!isWorkerRequest(request.headers.get('authorization'))) return new NextResponse('Not found', { status: 404 });
  const summary = await processOperatorBookingEmails({ limit: 50 });
  return NextResponse.json(summary);
};
