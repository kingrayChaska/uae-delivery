import Link from 'next/link';

import Button from '@/components/ui/button';
import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listTicketsAction } from '@/lib/support/actions';

const SupportPage = async () => {
  await requireRoleOrRedirect('customer');
  const tickets = await listTicketsAction();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Support</h1>
        <Button asChild>
          <Link href="/dashboard/customer/support/new">New Ticket</Link>
        </Button>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No support tickets</p>
          <p className="text-sm text-muted-foreground">Open one if you need help with a delivery.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/dashboard/customer/support/${ticket.id}`}>
              <Card className="hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div>
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(ticket.updatedAt).toLocaleString()}
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

export default SupportPage;
