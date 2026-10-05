import { useTranslations } from 'next-intl';

import { useFormat } from '@/i18n/hooks';

type CodAmountLinesProps = {
  productAmount: number;
  deliveryFeeAmount: number;
  total: number;
  currency: string;
};

// A COD record split the way it's paid: the recipient's amount first, and
// the sender's cash delivery fee — never collected from the recipient —
// only when there is one.
const CodAmountLines = ({ productAmount, deliveryFeeAmount, total, currency }: CodAmountLinesProps) => {
  const t = useTranslations('shipments.codLines');
  const format = useFormat();

  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-brand-mono text-lg">
        {format.money(productAmount, currency)}
        <span className="ms-2 font-sans text-xs text-muted-foreground">{t('fromRecipient')}</span>
      </p>
      {deliveryFeeAmount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('senderFee', { fee: format.money(deliveryFeeAmount, currency), total: format.money(total, currency) })}
        </p>
      ) : null}
    </div>
  );
};

export default CodAmountLines;
