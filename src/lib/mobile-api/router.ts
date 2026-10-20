import type { Profile, Role } from '@/lib/types';

// The mobile app's API (/api/mobile/v1/...). One table of routes, so every
// endpoint goes through the same authentication, role check, body parsing
// and error shape (handler.ts). Handlers call the website's own server
// actions and services — the mobile API adds transport, never business rules.

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

// 'public': no session (sign-in, password reset). Otherwise the caller must
// be signed in with an active profile whose role is listed.
export type RouteAccess = 'public' | readonly Role[];

export type RouteContext = {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  // Null only on public routes.
  profile: Profile | null;
};

// Errors are message keys (i18n/message.ts), translated by the app.
export type MobileResult =
  | { status: 200; data: unknown }
  | { status: 400 | 401 | 403 | 404 | 409 | 422 | 429; error: string };

export type MobileRoute = {
  method: HttpMethod;
  // Segments after /api/mobile/v1; ":name" captures one segment.
  path: string;
  access: RouteAccess;
  handle: (ctx: RouteContext) => Promise<MobileResult>;
};

export const ok = (data: unknown): MobileResult => ({ status: 200, data });
export const fail = (status: Exclude<MobileResult['status'], 200>, error: string): MobileResult => ({ status, error });

// Server actions answer { success: false, error } for refusals the user can
// act on (validation, a database rule, rate limits); those are 422s.
export const fromAction = <T extends { success: boolean; error?: string }>(result: T): MobileResult => {
  if (result.success) return ok(result);
  const error = result.error ?? 'errors.generic';
  return fail(error === 'errors.rateLimited' ? 429 : 422, error);
};

export const STAFF: readonly Role[] = ['operator', 'manager'];
export const MANAGER: readonly Role[] = ['manager'];
export const DRIVER: readonly Role[] = ['driver'];
// The roles the mobile app serves. Customers use the website.
export const MOBILE_ROLES: readonly Role[] = ['driver', 'operator', 'manager'];

// Letters, digits and - _ . only, and never a bare "." or "..".
const SEGMENT = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;

export const matchRoute = (
  routes: readonly MobileRoute[],
  method: string,
  segments: readonly string[],
): { route: MobileRoute; params: Record<string, string> } | { route: null; methodMismatch: boolean } => {
  let methodMismatch = false;
  if (!segments.every((segment) => SEGMENT.test(segment))) return { route: null, methodMismatch };

  for (const route of routes) {
    const pattern = route.path.split('/').filter(Boolean);
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matches = pattern.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = segments[i];
        return true;
      }
      return part === segments[i];
    });
    if (!matches) continue;
    if (route.method !== method) {
      methodMismatch = true;
      continue;
    }
    return { route, params };
  }
  return { route: null, methodMismatch };
};
