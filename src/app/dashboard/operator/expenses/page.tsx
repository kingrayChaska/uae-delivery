import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleAlert } from 'lucide-react';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import Pagination from '@/components/dashboard/pagination';
import ExpenseForm from '@/components/finance/expense-form';
import ExpenseRowActions from '@/components/finance/expense-row-actions';
import ExpenseReportStatusBadge from '@/components/finance/expense-report-status-badge';
import PrepareExpenseReportForm from '@/components/finance/prepare-expense-report-form';
import ReceiptThumbnails from '@/components/finance/receipt-thumbnails';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { failedLoad } from '@/lib/finance/load-error';
import { EXPENSE_REVIEW_STATES, monthOf, operatorCanEdit, parseOperatorExpenseFilters, weekOf } from '@/lib/finance/expense-reports';
import { addDays, todayInDubai } from '@/lib/finance/schemas';
import { parsePage } from '@/lib/pagination';
import { listExpenseCategories } from '@/services/finance/expenses';
import {
  OPERATOR_EXPENSE_PAGE_SIZE,
  getOperatorExpenseTotals,
  listExpenseReports,
  listOperatorExpenses,
} from '@/services/finance/expense-reports';
import { getExpenseReceiptsOrEmpty } from '@/services/finance/expense-receipts';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.operatorExpenses'))('meta'),
});

type SearchParams = Promise<{ from?: string; to?: string; category?: string; state?: string; page?: string }>;

const PATH = '/dashboard/operator/expenses';

// The operator's own operational expenses (migration 0052): record them
// with receipt pictures (0053), see them by category and review state for any week,
// month or range, and gather them into reports for a manager to review.
// RLS returns this operator's records only.
const OperatorExpensesPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  const profile = await requireRoleOrRedirect('operator');
  const params = await searchParams;
  const filters = parseOperatorExpenseFilters(params);
  const page = parsePage(params.page);
  const today = todayInDubai();

  const [t, tState, format, categories, list, totals, reports] = await Promise.all([
    getTranslations('finance.operatorExpenses'),
    getTranslations('finance.reports.status'),
    getFormat(),
    listExpenseCategories().catch(failedLoad('Expense categories')),
    listOperatorExpenses(profile.id, filters, page).catch(failedLoad('Operator expenses')),
    getOperatorExpenseTotals(filters).catch(failedLoad('Operator expense totals')),
    listExpenseReports().catch(failedLoad('Expense reports')),
  ]);
  const receipts = await getExpenseReceiptsOrEmpty((list?.rows ?? []).map((e) => e.id));

  const query = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.category) query.set('category', filters.category);
  if (filters.state) query.set('state', filters.state);
  const listHref = `${PATH}?${query}`;
  const periodHref = (from: string, to: string) => `${PATH}?${new URLSearchParams({ from, to })}`;
  const thisWeek = weekOf(today);
  const lastWeek = weekOf(addDays(thisWeek.from, -1));
  const thisMonth = monthOf(today);
  const lastMonth = monthOf(addDays(thisMonth.from, -1));
  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id, name: c.name, active: c.active }));
  const loadError = (
    <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
      <CircleAlert className="size-4" aria-hidden />
      {t('loadFailed')}
    </p>
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <nav aria-label={t('presetsLabel')} className="flex flex-wrap gap-2">
        {(
          [
            ['thisWeek', thisWeek],
            ['lastWeek', lastWeek],
            ['thisMonth', thisMonth],
            ['lastMonth', lastMonth],
          ] as const
        ).map(([key, period]) => {
          const current = filters.from === period.from && filters.to === period.to;
          return (
            <Link
              key={key}
              href={periodHref(period.from, period.to)}
              aria-current={current ? 'page' : undefined}
              className={
                current
                  ? 'inline-flex min-h-9 items-center rounded-full border border-primary bg-primary px-3 text-sm text-primary-foreground'
                  : 'inline-flex min-h-9 items-center rounded-full border px-3 text-sm hover:bg-secondary/60'
              }
            >
              {t(`presets.${key}`)}
            </Link>
          );
        })}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="from">{t('filters.from')}</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to">{t('filters.to')}</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="category">{t('filters.category')}</Label>
          <Select id="category" name="category" defaultValue={filters.category ?? ''} className="w-44">
            <option value="">{t('filters.allCategories')}</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="state">{t('filters.status')}</Label>
          <Select id="state" name="state" defaultValue={filters.state ?? ''} className="w-44">
            <option value="">{t('filters.allStatuses')}</option>
            {EXPENSE_REVIEW_STATES.map((s) => (
              <option key={s} value={s}>
                {tState(s)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">{t('filters.apply')}</Button>
      </form>

      <section aria-labelledby="op-totals" className="flex flex-col gap-3">
        <h2 id="op-totals" className="text-lg font-medium">
          {t('totalsHeading', { from: format.calendarDate(filters.from), to: format.calendarDate(filters.to) })}
        </h2>
        {totals ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {totals.byCategory.map((row) => (
                <div key={row.categoryId} className="rounded-xl border bg-card p-4">
                  <p className="truncate text-sm text-muted-foreground">
                    {row.name} <span className="text-xs">({row.count})</span>
                  </p>
                  <p dir="ltr" className="font-brand-mono text-lg font-semibold rtl:text-right">{format.money(row.total)}</p>
                </div>
              ))}
              <div className="rounded-xl border border-primary/40 bg-secondary/40 p-4">
                <p className="text-sm font-medium">{t('periodTotal')}</p>
                <p dir="ltr" className="font-brand-mono text-lg font-bold rtl:text-right">{format.money(totals.total)}</p>
              </div>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {EXPENSE_REVIEW_STATES.map((s) => (
                <div key={s} className="flex gap-2">
                  <dt className="text-muted-foreground">{tState(s)}</dt>
                  <dd dir="ltr" className="font-brand-mono">{format.money(totals.byState[s])}</dd>
                </div>
              ))}
            </dl>
            {totals.byCategory.length === 0 ? <p className="text-sm text-muted-foreground">{t('noneInPeriod')}</p> : null}
          </>
        ) : (
          loadError
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('addHeading')}</CardTitle>
            <CardDescription>{t('addHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {categories ? <ExpenseForm categories={categoryOptions} today={today} /> : loadError}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('prepareHeading')}</CardTitle>
            <CardDescription>{t('prepareHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <PrepareExpenseReportForm today={today} basePath={PATH} />
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="op-reports" className="flex flex-col gap-3">
        <h2 id="op-reports" className="text-lg font-medium">
          {t('reportsHeading')}
        </h2>
        {!reports ? (
          loadError
        ) : reports.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('noReports')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((report) => (
              <li key={report.id}>
                <Link
                  href={`${PATH}/reports/${report.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:border-primary/40 hover:bg-secondary/30"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span dir="ltr" className="font-brand-mono text-sm font-semibold">{report.number}</span>
                      <ExpenseReportStatusBadge status={report.status} />
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {format.calendarDate(report.periodStart)} – {format.calendarDate(report.periodEnd)} · {t('reportCount', { count: report.expenseCount })}
                    </span>
                  </span>
                  <span dir="ltr" className="font-brand-mono font-semibold">{format.money(report.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="op-list" className="flex flex-col gap-3">
        <h2 id="op-list" className="text-lg font-medium">
          {t('listHeading')}
        </h2>
        {!list ? (
          loadError
        ) : list.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {list.rows.map((expense) => {
                const isVoid = expense.status === 'void';
                const editable = !isVoid && operatorCanEdit(expense.state === 'unreported' ? null : expense.state);
                const expenseReceipts = receipts?.get(expense.id) ?? [];
                return (
                  <li
                    key={expense.id}
                    className={`flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between ${isVoid ? 'opacity-70' : ''}`}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium wrap-break-word ${isVoid ? 'line-through' : ''}`}>{expense.description}</span>
                        <Badge variant="secondary">{expense.categoryName}</Badge>
                        {isVoid ? <Badge variant="destructive">{t('void')}</Badge> : <ExpenseReportStatusBadge status={expense.state} />}
                        {expenseReceipts.length > 0 ? <Badge variant="outline">{t('receiptCount', { count: expenseReceipts.length })}</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format.calendarDate(expense.incurredOn)}
                        {expense.vendor ? ` · ${expense.vendor}` : ''}
                        {expense.reportNumber && expense.reportId ? (
                          <>
                            {' · '}
                            <Link href={`${PATH}/reports/${expense.reportId}`} className="hover:underline">
                              <span dir="ltr">{expense.reportNumber}</span>
                            </Link>
                          </>
                        ) : null}
                      </p>
                      {isVoid && expense.voidReason ? <p className="text-xs text-destructive">{t('voidReason', { reason: expense.voidReason })}</p> : null}
                      <ReceiptThumbnails receipts={expenseReceipts} />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span dir="ltr" className="font-brand-mono text-base font-semibold">
                        {format.money(expense.amount, expense.currency)}
                      </span>
                      {editable && categories ? (
                        <ExpenseRowActions
                          expenseId={expense.id}
                          description={expense.description}
                          categories={categoryOptions}
                          today={today}
                          initial={{
                            categoryId: expense.categoryId,
                            description: expense.description,
                            amount: expense.amount.toFixed(2),
                            incurredOn: expense.incurredOn,
                            paymentStatus: expense.paymentStatus,
                            paidOn: expense.paidOn ?? '',
                            vendor: expense.vendor ?? '',
                            notes: expense.notes ?? '',
                            legacyReference: expense.reference,
                            receipts: expenseReceipts,
                          }}
                        />
                      ) : !isVoid ? (
                        <span className="text-xs text-muted-foreground">{t('locked')}</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} totalPages={Math.max(1, Math.ceil(list.total / OPERATOR_EXPENSE_PAGE_SIZE))} href={listHref} />
          </>
        )}
      </section>
    </main>
  );
};

export default OperatorExpensesPage;
