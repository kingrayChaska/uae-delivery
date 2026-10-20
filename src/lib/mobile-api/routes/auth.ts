import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { getPublicOrigin } from '@/lib/auth/public-url';
import { forgotPasswordSchema, loginSchema } from '@/lib/auth/schemas';
import { MOBILE_ROLES, fail, ok } from '@/lib/mobile-api/router';
import { RATE_LIMIT_MESSAGE, checkIpRateLimit, checkRateLimit } from '@/lib/security/rate-limit';

import type { MobileRoute } from '@/lib/mobile-api/router';
import type { Profile, Role } from '@/lib/types';

// A one-off, in-memory client: the session it gets is handed to the app,
// which stores and refreshes it itself. Nothing is kept on the server.
const createAuthClient = () =>
  createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

export const toMobileProfile = (profile: Profile) => ({
  id: profile.id,
  role: profile.role,
  fullName: profile.fullName,
  email: profile.email,
  phone: profile.phone,
  avatarUrl: profile.avatarUrl,
});

// Mirrors loginAction (lib/auth/actions.ts): the same validation and the
// same per-IP and per-email counters, so the app gives an attacker no extra
// guesses. Turnstile is a browser widget and can't run in the app; see
// mobile/docs/SECURITY.md.
const login: MobileRoute = {
  method: 'POST',
  path: 'auth/login',
  access: 'public',
  handle: async ({ body }) => {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? 'validation.invalid');

    const [ipOk, emailOk] = await Promise.all([
      checkIpRateLimit('loginPerIp'),
      checkRateLimit('loginPerEmail', parsed.data.email),
    ]);
    if (!ipOk || !emailOk) return fail(429, RATE_LIMIT_MESSAGE);

    const supabase = createAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.session) return fail(401, 'auth.errors.incorrectCredentials');

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, phone, avatar_url, active')
      .eq('id', data.user.id)
      .maybeSingle();

    // Refused sign-ins end the session just created ('local': only this
    // one — the person's website session is left alone).
    const refuse = async (status: 403, message: string) => {
      await supabase.auth.signOut({ scope: 'local' });
      return fail(status, message);
    };
    if (!profile || !profile.active) return refuse(403, 'auth.errors.inactive');
    if (!MOBILE_ROLES.includes(profile.role as Role)) return refuse(403, 'mobile.errors.useWebsite');

    return ok({
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? null,
      },
      profile: {
        id: profile.id,
        role: profile.role as Role,
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        avatarUrl: profile.avatar_url,
      },
    });
  },
};

// Mirrors requestPasswordResetAction: same limits, same answer whether or
// not the address has an account. The emailed link is the website's
// /auth/confirm (the Supabase email templates fix it); the app opens it
// itself where App Links / Universal Links are set up.
const passwordReset: MobileRoute = {
  method: 'POST',
  path: 'auth/password-reset',
  access: 'public',
  handle: async ({ body }) => {
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? 'validation.invalid');

    const [ipOk, emailOk] = await Promise.all([
      checkIpRateLimit('passwordResetPerIp'),
      checkRateLimit('passwordResetPerEmail', parsed.data.email),
    ]);
    if (!ipOk || !emailOk) return fail(429, RATE_LIMIT_MESSAGE);

    await createAuthClient().auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${getPublicOrigin()}/auth/confirm`,
    });
    return ok({ message: 'auth.forgot.sent' });
  },
};

// Who the token belongs to, from the profile row — the app's only source
// for the role it routes by.
const me: MobileRoute = {
  method: 'GET',
  path: 'me',
  access: MOBILE_ROLES,
  handle: async ({ profile }) => ok(toMobileProfile(profile!)),
};

export const authRoutes: readonly MobileRoute[] = [login, passwordReset, me];
