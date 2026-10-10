import Link from 'next/link';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import { COLLECTION_FILTERS, REMITTANCE_FILTERS } from '@/lib/cash/schemas';

import type { DriverLedgerFilters } from '@/lib/cash/schemas';

type CashFiltersFormProps = {
  path: string;
  filters: Partial<DriverLedgerFilters>;
  // The driver's ledger also filters by tracking code and by status.
  ledger?: boolean;
};

// A plain GET form: filters live in the URL (refresh, share and Back work,
// and it works before JavaScript loads). The database does the filtering.
const CashFiltersForm = ({ path, filters, ledger = false }: CashFiltersFormProps) => {
  const t = useTranslations('operator.cash.filters');
  const tCod = useTranslations('shipments.codStatus');
  const tRemittance = useTranslations('operator.cash.status');

  return (
    <form method="get" action={path} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm" role="search">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
          <Label htmlFor="cash-q">{ledger ? t('tracking') : t('driver')}</Label>
          <Input id="cash-q" name="q" type="search" defaultValue={filters.q ?? ''} maxLength={100} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cash-from">{t('from')}</Label>
          <Input id="cash-from" name="from" type="date" defaultValue={filters.from ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cash-to">{t('to')}</Label>
          <Input id="cash-to" name="to" type="date" defaultValue={filters.to ?? ''} />
        </div>
        {ledger ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-collection">{t('collection')}</Label>
              <Select id="cash-collection" name="collection" defaultValue={filters.collection ?? 'all'}>
                {COLLECTION_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? t('all') : option === 'unverified' ? t('unverified') : tCod(option)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-remittance">{t('remittance')}</Label>
              <Select id="cash-remittance" name="remittance" defaultValue={filters.remittance ?? 'all'}>
                {REMITTANCE_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? t('all') : tRemittance(option)}
                  </option>
                ))}
              </Select>
            </div>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">
          <Search aria-hidden />
          {t('apply')}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={path}>{t('clear')}</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{ledger ? t('ledgerDatesHint') : t('datesHint')}</p>
    </form>
  );
};

export default CashFiltersForm;
