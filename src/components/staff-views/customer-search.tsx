'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import { CUSTOMER_SEARCH_MAX_LENGTH, normalizeCustomerSearch } from '@/lib/customers/search';

const DEBOUNCE_MS = 300;

// Search-as-you-type for the staff customer list. The search itself runs in
// the database (the page reads ?q=); this only keeps the URL in step with
// the box, 300 ms after typing stops. Without JavaScript it is a plain GET
// form, and "Clear" is a link — both still work.
const CustomerSearch = ({ initialQuery }: { initialQuery: string }) => {
  const t = useTranslations('operator.customers');
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const lastQuery = useRef(normalizeCustomerSearch(initialQuery));

  const search = (raw: string) => {
    const query = normalizeCustomerSearch(raw);
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    // A new search starts again from page 1.
    startTransition(() => router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname, { scroll: false }));
  };

  useEffect(() => {
    const timer = setTimeout(() => search(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Debounced on the text only; search() reads the current route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <form
      role="search"
      action={pathname}
      onSubmit={(event) => {
        event.preventDefault();
        search(value);
      }}
      className="flex flex-col gap-1.5"
    >
      <Label htmlFor="customer-search">{t('searchLabel')}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="customer-search"
            name="q"
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('searchPlaceholder')}
            maxLength={CUSTOMER_SEARCH_MAX_LENGTH}
            autoComplete="off"
            aria-describedby="customer-search-hint"
            className="ps-9"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="flex-1 sm:flex-none" loading={isPending} loadingText={t('search')}>
            {t('search')}
          </Button>
          {value || initialQuery ? (
            <Button asChild variant="ghost" className="flex-1 sm:flex-none">
              <Link
                href={pathname}
                onClick={(event) => {
                  event.preventDefault();
                  setValue('');
                  search('');
                }}
              >
                <X aria-hidden />
                {t('clear')}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <p id="customer-search-hint" className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        {isPending ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {t('searchHint')}
      </p>
    </form>
  );
};

export default CustomerSearch;
