import { NextResponse } from 'next/server';

import { appleAppSiteAssociation } from '@/lib/mobile-api/app-links';

// iOS Universal Links for the ParcelLink app (lib/mobile-api/app-links.ts).
// Apple fetches this exact path, without an extension, and wants JSON.
export const dynamic = 'force-dynamic';

export const GET = () => {
  const body = appleAppSiteAssociation();
  return body ? NextResponse.json(body) : new NextResponse('Not found', { status: 404 });
};
