import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import TicketStatusBadge from '@/components/support/ticket-status-badge';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listTicketsAction } from '@/lib/support/actions';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('support'))('meta'),
});

const SupportPage = async () => {
  await requireRoleOrRedirect('customer');
  const [tickets, t, format] = await Promise.all([listTicketsAction(), getTranslations('support'), getFormat()]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Button asChild>
          <Link href="/dashboard/customer/support/new">{t('newTicket')}</Link>
        </Button>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/dashboard/customer/support/${ticket.id}`}>
              <Card className="hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div className="min-w-0">
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">{t('updated', { time: format.dateTime(ticket.updatedAt) })}</p>
                  </div>
                  <TicketStatusBadge status={ticket.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
};

export default SupportPage;
