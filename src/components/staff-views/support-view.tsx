import Link from 'next/link';

import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { listAllTicketsAction } from '@/lib/support/actions';

import type { StaffViewProps } from '@/components/staff-views/types';

const SupportView = async ({ basePath }: StaffViewProps) => {
  const tickets = await listAllTicketsAction();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Support Inbox</h1>

      {tickets.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No support tickets</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`${basePath}/support/${ticket.id}`}>
              <Card className="hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div>
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.customerName} · updated {new Date(ticket.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>{ticket.status}</Badge>
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
