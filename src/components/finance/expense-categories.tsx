'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { createExpenseCategoryAction, updateExpenseCategoryAction } from '@/lib/finance/actions';
import { PROFIT_GROUPS } from '@/lib/finance/schemas';

import type { ProfitGroup } from '@/lib/finance/schemas';
import type { ExpenseCategory } from '@/services/finance/expenses';

// Expense categories. New ones need no code change: a manager names them
// and says which profit step deducts them (fuel, subscription, salary,
// rent, or other). The four built-in categories can't be renamed,
// regrouped or deactivated; a category is never deleted, only deactivated.
const CategoryRow = ({ category }: { category: ExpenseCategory }) => {
  const t = useTranslations('finance');
  const router = useRouter();
  const ids = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [group, setGroup] = useState<ProfitGroup>(category.profitGroup);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const save = async (next: { name: string; profitGroup: ProfitGroup; active: boolean }) => {
    setIsPending(true);
    setError(null);
    const result = await updateExpenseCategoryAction({ categoryId: category.id, ...next }).catch(() => ({
      success: false as const,
      error: 'errors.generic',
    }));
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  };

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border p-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save({ name, profitGroup: group, active: category.active });
          }}
        >
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <Label htmlFor={`${ids}-name`}>{t('expenses.categories.name')}</Label>
            <Input id={`${ids}-name`} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-group`}>{t('expenses.categories.group')}</Label>
            <Select id={`${ids}-group`} value={group} onChange={(event) => setGroup(event.target.value as ProfitGroup)} className="w-40">
              {PROFIT_GROUPS.map((value) => (
                <option key={value} value={value}>
                  {t(`profitGroups.${value}`)}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            {t('expenses.categories.save')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={isPending}>
            {t('expenses.form.cancel')}
          </Button>
        </form>
        <FieldError message={error} />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium">{category.name}</span>
          <span className="text-xs text-muted-foreground">{t('expenses.categories.countsAs', { group: t(`profitGroups.${category.profitGroup}`) })}</span>
          {category.isSystem ? <Badge variant="secondary">{t('expenses.categories.builtIn')}</Badge> : null}
          {!category.active ? <Badge variant="outline">{t('expenses.categories.inactive')}</Badge> : null}
        </div>
        {category.isSystem ? null : (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {t('expenses.categories.edit')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => save({ name: category.name, profitGroup: category.profitGroup, active: !category.active })}
            >
              {category.active ? t('expenses.categories.deactivate') : t('expenses.categories.activate')}
            </Button>
          </div>
        )}
      </div>
      <FieldError message={error} />
    </li>
  );
};

const ExpenseCategories = ({ categories }: { categories: ExpenseCategory[] }) => {
  const t = useTranslations('finance');
  const router = useRouter();
  const ids = useId();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<ProfitGroup>('other');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </ul>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsPending(true);
          setError(null);
          const result = await createExpenseCategoryAction({ name, profitGroup: group }).catch(() => ({
            success: false as const,
            error: 'errors.generic',
          }));
          setIsPending(false);
          if (!result.success) {
            setError(result.error);
            return;
          }
          setName('');
          setGroup('other');
          router.refresh();
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <Label htmlFor={`${ids}-new-name`}>{t('expenses.categories.newName')}</Label>
            <Input id={`${ids}-new-name`} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-new-group`}>{t('expenses.categories.group')}</Label>
            <Select id={`${ids}-new-group`} value={group} onChange={(event) => setGroup(event.target.value as ProfitGroup)} className="w-40">
              {PROFIT_GROUPS.map((value) => (
                <option key={value} value={value}>
                  {t(`profitGroups.${value}`)}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={isPending || name.trim().length < 2}>
            {isPending ? t('expenses.categories.adding') : t('expenses.categories.add')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('expenses.categories.groupHint')}</p>
        <FieldError message={error} />
      </form>
    </div>
  );
};

export default ExpenseCategories;
