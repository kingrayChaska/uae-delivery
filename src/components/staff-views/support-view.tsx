import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import TicketStatusBadge from '@/components/support/ticket-status-badge';
import { listAllTicketsAction } from '@/lib/support/actions';
import { getFormat } from '@/i18n/server';

import type { StaffViewProps } from '@/components/staff-views/types';

const SupportView = async ({ basePath }: StaffViewProps) => {
  const [tickets, t, format] = await Promise.all([listAllTicketsAction(), getTranslations('support'), getFormat()]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('inbox')}</h1>

      {tickets.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`${basePath}/support/${ticket.id}`}>
              <Card className="hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div className="min-w-0">
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('customerUpdated', { name: ticket.customerName ?? t('customer'), time: format.dateTime(ticket.updatedAt) })}
                    </p>
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

export default SupportView;
