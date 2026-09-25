import Link from 'next/link';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { listOperators } from '@/services/staff/list-staff';

const ManagerOperatorsPage = async () => {
  await requireRoleOrRedirect('manager');
  const operators = await listOperators();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Operators</h1>
        <Button asChild>
          <Link href="/dashboard/manager/operators/new">Add operator</Link>
        </Button>
      </div>

      {operators.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No operators yet</p>
          <p className="text-sm text-muted-foreground">Operators run daily dispatch. Add your first one to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Operator</th>
                <th className="px-3 py-2 font-medium">Employee ID</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Assignments</th>
                <th className="px-3 py-2 font-medium">Actions logged</th>
                <th className="px-3 py-2 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((operator) => (
                <tr key={operator.id} className="border-t hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/manager/operators/${operator.id}`} className="font-medium hover:underline">
                      {operator.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{operator.email}</p>
                  </td>
                  <td className="px-3 py-2 font-brand-mono text-xs">{operator.employeeId}</td>
                  <td className="px-3 py-2">
                    <Badge variant={operator.active ? 'success' : 'secondary'}>{operator.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-3 py-2 font-brand-mono">{operator.assignmentsMade}</td>
                  <td className="px-3 py-2 font-brand-mono">{operator.actionsLogged}</td>
                  <td className="px-3 py-2 font-brand-mono text-xs text-muted-foreground">
                    {operator.lastLoginAt ? new Date(operator.lastLoginAt).toLocaleString() : 'Never'}
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
