import { useTranslations } from 'next-intl';

import { useFormat } from '@/i18n/hooks';

type ShipmentLabelProps = {
  trackingNumber: string;
  pickupAddress: string;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupBuilding: string | null;
  pickupUnit: string | null;
  pickupFloor: string | null;
  pickupInstructions: string | null;
  dropoffAddress: string;
  dropoffContactName: string;
  dropoffContactPhone: string;
  dropoffBuilding: string | null;
  dropoffUnit: string | null;
  dropoffFloor: string | null;
  dropoffInstructions: string | null;
  deliveryType: 'same_day' | 'next_day';
  deliveryDate: string | null;
  deliveryFee: number;
  deliveryFeeCurrency: string;
  paymentMethod: 'card' | 'cod';
  recipientPaymentType: 'prepaid' | 'postpaid';
  codAmount: number;
  packageType: 'document' | 'parcel' | 'fragile' | 'bulk';
  packageDescription: string;
  packageQuantity: number;
  packageWeightKg: number | null;
  packageLengthCm: number | null;
  packageWidthCm: number | null;
  packageHeightCm: number | null;
  isFragile: boolean;
  qrSvg: string;
};

const ShipmentLabel = ({
  trackingNumber,
  pickupAddress,
  pickupContactName,
  pickupContactPhone,
  pickupBuilding,
  pickupUnit,
  pickupFloor,
  pickupInstructions,
  dropoffAddress,
  dropoffContactName,
  dropoffContactPhone,
  dropoffBuilding,
  dropoffUnit,
  dropoffFloor,
  dropoffInstructions,
  deliveryType,
  deliveryDate,
  deliveryFee,
  deliveryFeeCurrency,
  paymentMethod,
  recipientPaymentType,
  codAmount,
  packageType,
  packageDescription,
  packageQuantity,
  packageWeightKg,
  packageLengthCm,
  packageWidthCm,
  packageHeightCm,
  isFragile,
  qrSvg,
}: ShipmentLabelProps) => {
  const t = useTranslations('shipments.label');
  const tShipment = useTranslations('shipments');
  const format = useFormat();
  const pickupDetails = [pickupBuilding, pickupUnit, pickupFloor && tShipment('address.floor', { floor: pickupFloor })].filter(Boolean);
  const dropoffDetails = [dropoffBuilding, dropoffUnit, dropoffFloor && tShipment('address.floor', { floor: dropoffFloor })].filter(Boolean);
  const dimensions = [packageLengthCm, packageWidthCm, packageHeightCm];
  const hasDimensions = dimensions.some((dimension) => dimension !== null);

  return (
    <article data-print-content className="mx-auto flex w-full max-w-2xl flex-col gap-6 border-4 border-black bg-white p-6 text-black sm:p-8 print:min-h-[180mm] print:max-w-none print:gap-5 print:border-2 print:p-2">
      <header className="flex items-start justify-between gap-4 border-b-4 border-black pb-4 print:border-b-2 print:pb-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide print:text-[10pt]">{t('trackingNumber')}</p>
          <p dir="ltr" className="font-brand-mono text-3xl font-bold tracking-wide rtl:text-right print:text-[24pt]">
            {trackingNumber}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI, not a remote/optimizable image */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
          alt={t('qrAlt', { code: trackingNumber })}
          width={144}
          height={144}
          className="size-28 shrink-0 sm:size-36 print:size-[38mm]"
        />
      </header>

      <section className="grid gap-5 sm:grid-cols-2 print:grid-cols-2 print:gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-sm font-bold uppercase tracking-wide">{t('from')}</p>
          <p className="text-lg font-semibold">{pickupContactName}</p>
          <p dir="ltr" className="text-base rtl:text-right">{pickupContactPhone}</p>
          <p className="mt-1 text-base wrap-anywhere">{pickupAddress}</p>
          {pickupDetails.length ? <p className="text-base">{pickupDetails.join(' · ')}</p> : null}
          {pickupInstructions ? <p className="mt-1 text-sm"><span className="font-semibold">{t('instructions')}: </span>{pickupInstructions}</p> : null}
        </div>

        <div className="min-w-0 border-t-2 border-black pt-4 sm:border-s-2 sm:border-t-0 sm:pt-0 sm:ps-5 print:border-s-2 print:border-t-0 print:pt-0 print:ps-4">
          <p className="mb-1 text-sm font-bold uppercase tracking-wide">{t('to')}</p>
          <p className="text-lg font-semibold">{dropoffContactName}</p>
          <p dir="ltr" className="text-base rtl:text-right">{dropoffContactPhone}</p>
          <p className="mt-1 text-base wrap-anywhere">{dropoffAddress}</p>
          {dropoffDetails.length ? <p className="text-base">{dropoffDetails.join(' · ')}</p> : null}
          {dropoffInstructions ? <p className="mt-1 text-sm"><span className="font-semibold">{t('instructions')}: </span>{dropoffInstructions}</p> : null}
        </div>
      </section>

      <section className="grid gap-5 border-t-2 border-black pt-4 sm:grid-cols-2 print:grid-cols-2 print:gap-4 print:pt-3">
        <div>
          <p className="mb-1 text-sm font-bold uppercase tracking-wide">{t('package')}</p>
          <p className="text-lg font-semibold">{tShipment(`packageType.${packageType}`)}</p>
          <p className="text-base">{t('contents')}: {packageDescription}{isFragile ? ` — ${t('fragile')}` : ''}</p>
          <p className="text-base">{t('quantity')}: {tShipment('quantity', { count: packageQuantity })}</p>
          {packageWeightKg !== null ? <p className="text-base">{t('weight')}: {format.kg(packageWeightKg)}</p> : null}
          {hasDimensions ? (
            <p className="text-base">
              {t('dimensions')}: {dimensions.map((dimension) => dimension === null ? '—' : format.cm(dimension)).join(' × ')}
            </p>
          ) : null}
        </div>

        <div className="border-t-2 border-black pt-4 sm:border-s-2 sm:border-t-0 sm:pt-0 sm:ps-5 print:border-s-2 print:border-t-0 print:pt-0 print:ps-4">
          <p className="mb-1 text-sm font-bold uppercase tracking-wide">{t('delivery')}</p>
          <p className="text-base">{tShipment(`deliveryType.${deliveryType}.label`)}</p>
          {deliveryDate ? <p className="text-base">{t('deliverOn', { date: format.calendarDate(deliveryDate) })}</p> : null}
          <p className="text-base">{t('deliveryFee')}: {format.money(deliveryFee, deliveryFeeCurrency)} · {tShipment(`paymentMethod.${paymentMethod}`)}</p>
          <div className="mt-3 border-2 border-black p-3 print:mt-2 print:p-2">
            <p className="text-sm font-bold uppercase tracking-wide">{t('amountToCollect')}</p>
            <p className="font-brand-mono text-2xl font-bold print:text-[18pt]">
              {recipientPaymentType === 'postpaid' ? format.money(codAmount, deliveryFeeCurrency) : t('nothingToCollect')}
            </p>
          </div>
        </div>
      </section>
    </article>
  );
};

export default ShipmentLabel;
