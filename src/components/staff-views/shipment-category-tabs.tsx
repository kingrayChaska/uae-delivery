import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { SHIPMENT_CATEGORIES } from '@/lib/shipment/categories';

import type { ShipmentCategory } from '@/lib/shipment/categories';

// All / Individual / Merchant / Bulk as a segmented control. Each segment is
// a link (?type=…), so the category is in the URL, survives a refresh, and
// works with the keyboard and the back button without client JavaScript.
const ShipmentCategoryTabs = ({ basePath, current }: { basePath: string; current: ShipmentCategory }) => {
  const t = useTranslations('operator.shipments');
  return (
    <nav aria-label={t('categoriesLabel')}>
      <ul className="grid grid-cols-2 gap-1 rounded-xl border bg-secondary/40 p-1 text-sm sm:inline-grid sm:grid-cols-4">
        {SHIPMENT_CATEGORIES.map((category) => {
          const active = category === current;
          return (
            <li key={category}>
              <Link
                href={category === 'all' ? `${basePath}/shipments` : `${basePath}/shipments?type=${category}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center justify-center rounded-lg px-3 text-center font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                )}
              >
                {t(`category.${category}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default ShipmentCategoryTabs;
