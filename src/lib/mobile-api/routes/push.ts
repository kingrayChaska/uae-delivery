import 'server-only';

import { MOBILE_ROLES, fail, ok } from '@/lib/mobile-api/router';
import { safeErrorMessage } from '@/lib/security/errors';
import { createClient } from '@/lib/supabase/server';

import type { MobileRoute, RouteContext } from '@/lib/mobile-api/router';

// The app's push token (migration 0047). register_push_device() and
// unregister_push_device() run as the signed-in person: they can only add
// or remove their own device, and only an active staff account may add one.

const field = (ctx: RouteContext, name: string) => {
  const value = (ctx.body as Record<string, unknown> | null)?.[name];
  return typeof value === 'string' ? value.slice(0, 300) : '';
};

export const pushRoutes: readonly MobileRoute[] = [
  {
    method: 'POST',
    path: 'push/devices',
    access: MOBILE_ROLES,
    handle: async (ctx) => {
      const supabase = await createClient();
      const { error } = await supabase.rpc('register_push_device', { p_token: field(ctx, 'token'), p_platform: field(ctx, 'platform') });
      return error ? fail(422, safeErrorMessage(error)) : ok({ registered: true });
    },
  },
  {
    method: 'DELETE',
    path: 'push/devices',
    access: MOBILE_ROLES,
    handle: async (ctx) => {
      const supabase = await createClient();
      const { error } = await supabase.rpc('unregister_push_device', { p_token: field(ctx, 'token') });
      return error ? fail(422, safeErrorMessage(error)) : ok({ registered: false });
    },
  },
];
