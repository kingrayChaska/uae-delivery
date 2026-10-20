import { NextResponse } from 'next/server';

import { androidAssetLinks } from '@/lib/mobile-api/app-links';

// Android App Links for the ParcelLink app (lib/mobile-api/app-links.ts).
export const dynamic = 'force-dynamic';

export const GET = () => {
  const body = androidAssetLinks();
  return body ? NextResponse.json(body) : new NextResponse('Not found', { status: 404 });
};
