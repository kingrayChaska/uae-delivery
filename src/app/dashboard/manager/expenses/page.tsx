import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleAlert } from 'lucide-react';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import Pagination from '@/components/dashboard/pagination';
import ExpenseCategories from '@/components/finance/expense-categories';
import ExpenseForm from '@/components/finance/expense-form';
import ExpenseRowActions from '@/components/finance/expense-row-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { failedLoad } from '@/lib/finance/load-error';
import { parseExpenseFilters, todayInDubai } from '@/lib/finance/schemas';
import { parsePage } from '@/lib/pagination';
import { EXPENSE_PAGE_SIZE, listExpenseCategories, listExpenses } from '@/services/finance/expenses';
import { getCategoryTotals } from '@/services/finance/performance';
import { getFormat } from '@/i18n/server';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('finance.expenses'))('meta'),
});

type SearchParams = Promise<{ from?: string; to?: string; category?: string; void?: string; page?: string }>;

// Operating expenses for the business performance report. Managers only:
// the layout, the server actions and RLS (migration 0044) all check it.
const ExpensesPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  await requireRoleOrRedirect('manager');
  const params = await searchParams;
  const filters = parseExpenseFilters(params);
  const page = parsePage(params.page);
  const today = todayInDubai();

  const [t, format, categories, list, totals] = await Promise.all([
    getTranslations('finance'),
    getFormat(),
    listExpenseCategories().catch(failedLoad('Expense categories')),
    listExpenses(filters, page).catch(failedLoad('Expenses')),
    getCategoryTotals(filters).catch(failedLoad('Expense totals')),
  ]);

  const shownTotals = (totals ?? []).filter((row) => !filters.category || row.categoryId === filters.category);
  // Summed in fils, so no floating-point drift.
  const periodTotal = shownTotals.reduce((sum, row) => sum + Math.round(row.total * 100), 0) / 100;
  const categoryName = filters.category ? categories?.find((c) => c.id === filters.category)?.name : null;

  const query = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.category) query.set('category', filters.category);
  if (filters.includeVoid) query.set('void', '1');
  const listHref = `/dashboard/manager/expenses?${query}`;
  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id, name: c.name, active: c.active }));
  const loadError = (
    <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
      <CircleAlert className="size-4" aria-hidden />
      {t('expenses.loadFailed')}
    </p>
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('expenses.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('expenses.subtitle')}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/manager/performance?from=${filters.from}&to=${filters.to}`}>{t('expenses.openPerformance')}</Link>
        </Button>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="from">{t('expenses.filters.from')}</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to">{t('expenses.filters.to')}</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="category">{t('expenses.filters.category')}</Label>
          <Select id="category" name="category" defaultValue={filters.category ?? ''} className="w-48">
            <option value="">{t('expenses.filters.allCategories')}</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="void" value="1" defaultChecked={filters.includeVoid} className="size-4" />
          {t('expenses.filters.includeVoid')}
        </label>
        <Button type="submit">{t('expenses.filters.apply')}</Button>
      </form>

      <section aria-labelledby="expense-totals" className="flex flex-col gap-3">
        <h2 id="expense-totals" className="text-lg font-medium">
          {categoryName ? t('expenses.totalCategory', { category: categoryName }) : t('expenses.total')}
          <span className="ms-2 text-sm font-normal text-muted-foreground">
            {format.calendarDate(filters.from)} – {format.calendarDate(filters.to)}
          </span>
        </h2>
        {totals ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {shownTotals.map((row) => (
              <div key={row.categoryId} className="rounded-xl border bg-card p-4">
                <p className="truncate text-sm text-muted-foreground">{row.name}</p>
                <p dir="ltr" className="font-brand-mono text-lg font-semibold rtl:text-right">
                  {format.money(row.total)}
                </p>
              </div>
            ))}
            <div className="rounded-xl border border-primary/40 bg-secondary/40 p-4">
              <p className="text-sm font-medium">{t('expenses.periodTotal')}</p>
              <p dir="ltr" className="font-brand-mono text-lg font-bold rtl:text-right">
                {format.money(periodTotal)}
              </p>
            </div>
          </div>
        ) : (
          loadError
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.form.addHeading')}</CardTitle>
          </CardHeader>
          <CardContent>{categories ? <ExpenseForm categories={categoryOptions} today={today} /> : loadError}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.categories.heading')}</CardTitle>
            <CardDescription>{t('expenses.categories.description')}</CardDescription>
          </CardHeader>
          <CardContent>{categories ? <ExpenseCategories categories={categories} /> : loadError}</CardContent>
        </Card>
      </div>

      <section aria-labelledby="expense-list" className="flex flex-col gap-3">
        <h2 id="expense-list" className="text-lg font-medium">
          {t('expenses.list.heading')}
        </h2>
        {!list ? (
          loadError
        ) : list.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('expenses.list.empty')}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {list.rows.map((expense) => {
                const isVoid = expense.status === 'void';
                return (
                  <li
                    key={expense.id}
                    className={`flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between ${isVoid ? 'opacity-70' : ''}`}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium wrap-break-word ${isVoid ? 'line-through' : ''}`}>{expense.description}</span>
                        <Badge variant="secondary">{expense.categoryName}</Badge>
                        {isVoid ? <Badge variant="destructive">{t('expenses.list.voidBadge')}</Badge> : null}
                        {expense.paymentStatus === 'unpaid' ? <Badge variant="warning">{t('expenses.form.unpaid')}</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('expenses.list.incurred', { date: format.calendarDate(expense.incurredOn) })}
                        {expense.paidOn ? ` · ${t('expenses.list.paidOn', { date: format.calendarDate(expense.paidOn) })}` : ''}
                        {expense.vendor ? ` · ${expense.vendor}` : ''}
                        {expense.reference ? ` · ${t('expenses.list.reference', { reference: expense.reference })}` : ''}
                      </p>
                      {expense.notes ? <p className="text-sm wrap-break-word">{expense.notes}</p> : null}
                      <p className="text-xs text-muted-foreground">
                        {t('expenses.list.recorded', { name: expense.createdByName ?? '—', date: format.date(expense.createdAt) })}
                        {expense.updatedByName ? ` · ${t('expenses.list.edited', { name: expense.updatedByName, date: format.date(expense.updatedAt) })}` : ''}
                      </p>
                      {isVoid && expense.voidReason ? (
                        <p className="text-xs text-destructive">{t('expenses.list.voidReason', { reason: expense.voidReason })}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span dir="ltr" className="font-brand-mono text-base font-semibold">
                        {format.money(expense.amount, expense.currency)}
                      </span>
                      {!isVoid && categories ? (
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
                            reference: expense.reference ?? '',
                            notes: expense.notes ?? '',
                          }}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} totalPages={Math.max(1, Math.ceil(list.total / EXPENSE_PAGE_SIZE))} href={listHref} />
          </>
        )}
      </section>
    </main>
  );
};

export default ExpensesPage;
