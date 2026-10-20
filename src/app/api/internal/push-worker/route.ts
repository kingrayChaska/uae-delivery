import { NextResponse } from 'next/server';

import { isWorkerRequest } from '@/lib/bulk/worker';
import { processPushNotifications } from '@/services/notifications/push-delivery';

import type { NextRequest } from 'next/server';

export const maxDuration = 60;

// Sends the mobile app's push notifications (migration 0047). Called by a
// Supabase database webhook on new notifications (POST) and, as a safety
// net for retries, a cron (GET) — both with "Authorization: Bearer
// $CRON_SECRET", the same secret as the other workers. It takes no input:
// what is sent, and to whom, comes only from the database. Everyone else
// gets a 404.
const run = async (request: NextRequest) => {
  if (!isWorkerRequest(request.headers.get('authorization'))) return new NextResponse('Not found', { status: 404 });
  const summary = await processPushNotifications();
  return NextResponse.json(summary);
};

export const GET = run;
export const POST = run;
