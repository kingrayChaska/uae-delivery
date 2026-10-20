import { handleMobileRequest } from '@/lib/mobile-api/handler';
import { MOBILE_ROUTES } from '@/lib/mobile-api/routes';

// The mobile app's API — see lib/mobile-api/router.ts. Node runtime: the
// bearer-token scope (supabase/mobile-auth-context.ts) uses AsyncLocalStorage.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

const handle = async (request: Request, { params }: Context) =>
  handleMobileRequest(request, (await params).path, MOBILE_ROUTES);

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
