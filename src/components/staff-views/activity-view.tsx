import { listAuditLogs } from '@/services/audit/list-audit-logs';


const ActivityView = async () => {
  const logs = await listAuditLogs();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Activity Log</h1>

      {logs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No activity recorded yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t">
                  <td className="px-3 py-2 font-brand-mono text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{log.actorName ?? 'System'}</td>
                  <td className="px-3 py-2 font-brand-mono text-xs">{log.action}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{log.entityType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
};

export default ActivityView;
