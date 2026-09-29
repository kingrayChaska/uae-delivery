import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import DeleteStaffAccount from '@/components/manager/delete-staff-account';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listOperators } from '@/services/staff/list-staff';
import { getFormat } from '@/i18n/server';

const ManagerOperatorsPage = async ({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) => {
  await requireRoleOrRedirect('manager');
  const { deleted } = await searchParams;
  const [operators, t, format] = await Promise.all([listOperators(), getTranslations('manager.staff'), getFormat()]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('operatorsTitle')}</h1>
        <Button asChild>
          <Link href="/dashboard/manager/operators/new">{t('addOperator')}</Link>
        </Button>
      </div>

      {deleted === '1' ? (
        <p role="status" className="rounded-xl border border-success/50 bg-success/10 p-3 text-sm">
          {t('deleted')}
        </p>
      ) : null}

      {operators.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('noOperators')}</p>
          <p className="text-sm text-muted-foreground">{t('noOperatorsBody')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('columns.operator')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.employeeId')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.status')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.assignments')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.actionsLogged')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('columns.lastLogin')}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">
                  <span className="sr-only">{t('columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {operators.map((operator) => (
                <tr key={operator.id} className="border-t hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/manager/operators/${operator.id}`} className="font-medium hover:underline">
                      {operator.fullName}
                    </Link>
                    <p dir="ltr" className="text-xs text-muted-foreground rtl:text-right">
                      {operator.email}
                    </p>
                  </td>
                  <td dir="ltr" className="px-3 py-2 font-brand-mono text-xs rtl:text-right">
                    {operator.employeeId}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={operator.active ? 'success' : 'secondary'}>{operator.active ? t('active') : t('inactive')}</Badge>
                  </td>
                  <td className="px-3 py-2 font-brand-mono">{format.number(operator.assignmentsMade)}</td>
                  <td className="px-3 py-2 font-brand-mono">{format.number(operator.actionsLogged)}</td>
                  <td className="px-3 py-2 font-brand-mono text-xs whitespace-nowrap text-muted-foreground">
                    {operator.lastLoginAt ? format.dateTime(operator.lastLoginAt) : t('never')}
                  </td>
                  <td className="px-3 py-2 text-end">
                    <DeleteStaffAccount compact profileId={operator.id} fullName={operator.fullName} role="operator" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
};

export default ManagerOperatorsPage;
