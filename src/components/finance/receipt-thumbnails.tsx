import { FileText, ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ExpenseReceipt } from '@/lib/finance/receipt-files';

// An expense's receipt pictures as small tiles; each opens the full file
// (a short-lived signed link) in a new tab. PDFs show as a document tile.
const ReceiptThumbnails = ({ receipts, size = 'sm' }: { receipts: ExpenseReceipt[]; size?: 'sm' | 'md' }) => {
  const t = useTranslations('finance.receipts');
  if (receipts.length === 0) return null;
  const box = size === 'md' ? 'size-20' : 'size-14';

  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('listLabel', { count: receipts.length })}>
      {receipts.map((receipt, index) => {
        const label = t('open', { number: index + 1, count: receipts.length, name: receipt.name ?? '' });
        const isPdf = receipt.contentType === 'application/pdf' || receipt.path.endsWith('.pdf');
        return (
          <li key={receipt.path}>
            {receipt.url ? (
              <a
                href={receipt.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={receipt.name ?? undefined}
                className={`${box} flex items-center justify-center overflow-hidden rounded-lg border bg-muted outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring`}
              >
                {isPdf ? (
                  <FileText className="size-6 text-muted-foreground" aria-hidden />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL
                  <img src={receipt.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                )}
              </a>
            ) : (
              <span
                className={`${box} flex items-center justify-center rounded-lg border border-dashed text-muted-foreground`}
                title={t('unavailable')}
              >
                <ImageOff className="size-5" aria-hidden />
                <span className="sr-only">{t('unavailable')}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default ReceiptThumbnails;
