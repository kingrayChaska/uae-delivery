import { getTranslations } from 'next-intl/server';

import { getFormat } from '@/i18n/server';

type Week = { weekStart: string; opening: number; closing: number; confirmed: number } & (
  | { collectedCod: number; collectedFee: number; received?: never }
  | { received: number; collectedCod?: never; collectedFee?: never }
);

// Week by week (Monday–Sunday, Asia/Dubai): what was still held when the
// week opened, what came in, what was confirmed onwards, what was left. A
// new week opens with the last one's closing balance — nothing resets.
const CashWeeksTable = async ({ id, title, weeks }: { id: string; title: string; weeks: Week[] }) => {
  const [t, format] = await Promise.all([getTranslations('cash.weeks'), getFormat()]);
  const day = (date: string, offset = 0) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return format.date(`${d.toISOString().slice(0, 10)}T00:00:00+04:00`);
  };
  const byCategory = weeks.some((week) => week.collectedCod !== undefined);

  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-medium">
        {title}
      </h2>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t('week')}</th>
              <th scope="col" className="px-3 py-2 text-end font-medium">{t('opening')}</th>
              {byCategory ? (
                <>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('collectedCod')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('collectedFee')}</th>
                </>
              ) : (
                <th scope="col" className="px-3 py-2 text-end font-medium">{t('received')}</th>
              )}
              <th scope="col" className="px-3 py-2 text-end font-medium">{t('confirmed')}</th>
              <th scope="col" className="px-3 py-2 text-end font-medium">{t('closing')}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => (
              <tr key={week.weekStart} className="border-t">
                <th scope="row" className="px-3 py-2 text-start font-normal whitespace-nowrap">
                  {t('range', { from: day(week.weekStart), to: day(week.weekStart, 6) })}
                  {index === 0 ? <span className="block text-xs text-muted-foreground">{t('current')}</span> : null}
                </th>
                <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{format.money(week.opening)}</td>
                {byCategory ? (
                  <>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{format.money(week.collectedCod ?? 0)}</td>
                    <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{format.money(week.collectedFee ?? 0)}</td>
                  </>
                ) : (
                  <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{format.money(week.received ?? 0)}</td>
                )}
                <td className="px-3 py-2 text-end font-brand-mono whitespace-nowrap">{format.money(week.confirmed)}</td>
                <td className="px-3 py-2 text-end font-brand-mono font-semibold whitespace-nowrap">{format.money(week.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t('note')}</p>
    </section>
  );
};

export default CashWeeksTable;
