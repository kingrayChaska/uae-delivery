import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

type Integration = { name: string; configured: boolean; detail: string };

// Only reports whether each variable is SET — never its value. Nothing
// secret is rendered or sent to the browser from this page.
const getIntegrations = (): Integration[] => [
  {
    name: 'Supabase',
    configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    detail: 'Database, auth, storage and realtime. The service-role key is required for staff onboarding.',
  },
  {
    name: 'Mapbox (map display)',
    configured: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
    detail: 'Public token for rendering maps in the browser. Restrict it to your domains in Mapbox.',
  },
  {
    name: 'Mapbox (routing & geocoding)',
    configured: Boolean(process.env.MAPBOX_SECRET_TOKEN),
    detail: 'Server-only token. Pricing depends on it — without it no booking can be priced.',
  },
  {
    name: 'Bot protection (Cloudflare Turnstile)',
    configured: Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    detail:
      process.env.TURNSTILE_DISABLED === 'true'
        ? 'Explicitly disabled (TURNSTILE_DISABLED=true). Sign-in and tracking rely on rate limiting alone.'
        : 'Protects sign-in, registration, password reset and tracking. Without it, production refuses those requests.',
  },
  {
    name: 'Payment provider',
    configured: false,
    detail: 'Not connected. Card bookings are saved as pending payment until a provider is implemented in lib/payments.',
  },
  {
    name: 'SMS provider',
    configured: false,
    detail: 'Not connected. Delivery OTPs are sent to the customer’s in-app notifications instead.',
  },
];

const ManagerSettingsPage = async () => {
  await requireRoleOrRedirect('manager');
  const integrations = getIntegrations();

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Integrations</h2>
        <div className="flex flex-col gap-2">
          {integrations.map((integration) => (
            <Card key={integration.name}>
              <CardContent className="flex items-start justify-between gap-4 pt-6 text-sm">
                <div>
                  <p className="font-medium">{integration.name}</p>
                  <p className="text-muted-foreground">{integration.detail}</p>
                </div>
                <Badge variant={integration.configured ? 'success' : 'secondary'}>
                  {integration.configured ? 'Configured' : 'Not configured'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg font-medium">Manager accounts</h2>
        <p className="text-muted-foreground">
          For security, manager accounts can’t be created or removed from inside the app — the database blocks it
          from every application session. Add or remove managers from the Supabase dashboard (see README, “Creating
          a manager”).
        </p>
      </section>
    </main>
  );
};

export default ManagerSettingsPage;
