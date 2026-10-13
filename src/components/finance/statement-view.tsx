import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleAlert, CircleCheck, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import Button from '@/components/ui/button';
import PrintButton from '@/components/shipment/label/print-button';
import StatementDocument from '@/components/finance/statement-document';
import StatementManagerActions from '@/components/finance/statement-manager-actions';
import StatementSettlementPanel from '@/components/finance/statement-settlement-panel';
import { todayInDubai } from '@/lib/finance/schemas';
import { getStatement } from '@/services/finance/statements';

type StatementViewProps = {
  statementId: string;
  role: 'manager' | 'customer';
  notice?: 'generated' | 'published' | null;
};

// One statement page for managers and merchants. Who may open it is decided
// by RLS (merchant_statements_select, migration 0044): a draft, or another
// merchant's statement, is simply not found.
const StatementView = async ({ statementId, role, notice = null }: StatementViewProps) => {
  const t = await getTranslations('finance');
  const statement = await getStatement(statementId).catch((error: unknown) => {
    console.error('Statement could not be loaded', error instanceof Error ? error.message : error);
    return undefined;
  });
  if (statement === null) notFound();

  const back =
    role === 'manager'
      ? { href: '/dashboard/manager/statements', label: t('statements.actions.back') }
      : { href: '/dashboard/customer/statements', label: t('portal.back') };

  if (statement === undefined) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {t('statements.loadFailed')}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back.href} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {back.label}
        </Link>
        <div className="flex flex-wrap gap-2">
          {role === 'manager' ? (
            <StatementManagerActions statementId={statement.id} status={statement.status} merchantName={statement.merchantName} />
          ) : null}
          <Button asChild variant="outline">
            <a href={`/api/statements/${statement.id}/pdf`} download>
              <Download aria-hidden />
              {t('statements.actions.downloadPdf')}
            </a>
          </Button>
          <PrintButton label={t('statements.actions.print')} />
        </div>
      </div>

      {notice ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/50 bg-success/10 p-4 text-sm print:hidden">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>{t(notice === 'generated' ? 'statements.actions.generatedNotice' : 'statements.actions.publishedNotice')}</p>
        </div>
      ) : null}

      {role === 'manager' && statement.status !== 'draft' ? (
        <StatementSettlementPanel
          statementId={statement.id}
          canRecord={statement.status === 'published'}
          balance={statement.balance}
          settlements={statement.settlements}
          currency={statement.currency}
          today={todayInDubai()}
        />
      ) : null}

      <div className="min-w-0">
        <StatementDocument
          statement={statement}
          shipmentHref={(id) => (role === 'manager' ? `/dashboard/manager/shipments/${id}` : `/dashboard/customer/deliveries/${id}`)}
        />
      </div>
    </main>
  );
};

export default StatementView;
