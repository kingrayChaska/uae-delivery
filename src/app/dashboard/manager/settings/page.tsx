import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('manager.settings'))('meta'),
});

type IntegrationKey = 'supabase' | 'mapboxPublic' | 'mapboxSecret' | 'turnstile' | 'payments' | 'sms';
type Integration = { key: IntegrationKey; configured: boolean; disabled?: boolean };

// Only reports whether each variable is SET — never its value. Nothing
// secret is rendered or sent to the browser from this page.
const getIntegrations = (): Integration[] => [
  {
    key: 'supabase',
    configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  },
  { key: 'mapboxPublic', configured: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN) },
  { key: 'mapboxSecret', configured: Boolean(process.env.MAPBOX_SECRET_TOKEN) },
  {
    key: 'turnstile',
    configured: Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    disabled: process.env.TURNSTILE_DISABLED === 'true',
  },
  { key: 'payments', configured: false },
  { key: 'sms', configured: false },
];

const ManagerSettingsPage = async () => {
  await requireRoleOrRedirect('manager');
  const t = await getTranslations('manager.settings');
  const integrations = getIntegrations();

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('integrations')}</h2>
        <div className="flex flex-col gap-2">
          {integrations.map((integration) => (
            <Card key={integration.key}>
              <CardContent className="flex items-start justify-between gap-4 pt-6 text-sm">
                <div>
                  <p className="font-medium">{t(`items.${integration.key}.name`)}</p>
                  <p className="text-muted-foreground">
                    {integration.disabled ? t('items.turnstile.disabled') : t(`items.${integration.key}.detail`)}
                  </p>
                </div>
                <Badge variant={integration.configured ? 'success' : 'secondary'}>
                  {integration.configured ? t('configured') : t('notConfigured')}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg font-medium">{t('managers')}</h2>
        <p className="text-muted-foreground">{t('managersBody')}</p>
      </section>
    </main>
  );
};

export default ManagerSettingsPage;
