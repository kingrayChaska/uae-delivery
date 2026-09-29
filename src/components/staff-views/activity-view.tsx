import { getTranslations } from 'next-intl/server';

import { listAuditLogs } from '@/services/audit/list-audit-logs';
import { getFormat } from '@/i18n/server';


const ActivityView = async () => {
  const [logs, t, format] = await Promise.all([listAuditLogs(), getTranslations('operator.activity'), getFormat()]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {logs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-start text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('when')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('who')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('action')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('entity')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t">
                  <td className="px-3 py-2 font-brand-mono text-xs whitespace-nowrap">{format.dateTime(log.createdAt)}</td>
                  <td className="px-3 py-2">{log.actorName ?? t('system')}</td>
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
