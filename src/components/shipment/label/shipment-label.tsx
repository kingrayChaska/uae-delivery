import { useTranslations } from 'next-intl';

type ShipmentLabelProps = {
  trackingNumber: string;
  pickupAddress: string;
  dropoffAddress: string;
  dropoffContactName: string;
  dropoffContactPhone: string;
  packageDescription: string;
  isFragile: boolean;
  qrSvg: string;
};

// Printable waybill — deliberately plain black-on-white, no brand colors
// or dark backgrounds, since it's meant for a thermal/laser printer, not
// a screen. print:hidden / print:block toggling is handled by the page
// that renders this (see PrintButton) rather than in here.
const ShipmentLabel = ({
  trackingNumber,
  pickupAddress,
  dropoffAddress,
  dropoffContactName,
  dropoffContactPhone,
  packageDescription,
  isFragile,
  qrSvg,
}: ShipmentLabelProps) => {
  const t = useTranslations('shipments.label');
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3 border-2 border-black p-4 text-black print:border-black">
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div>
          <p className="text-xs uppercase tracking-wide">{t('trackingNumber')}</p>
          <p dir="ltr" className="font-brand-mono text-lg font-semibold rtl:text-right">
            {trackingNumber}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI, not a remote/optimizable image */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
          alt={t('qrAlt', { code: trackingNumber })}
          width={96}
          height={96}
        />
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide">{t('from')}</p>
        <p className="text-sm">{pickupAddress}</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide">{t('to')}</p>
        <p className="text-sm font-medium">{dropoffContactName}</p>
        <p className="text-sm">{dropoffAddress}</p>
        <p dir="ltr" className="text-sm rtl:text-right">
          {dropoffContactPhone}
        </p>
      </div>

      <div className="border-t-2 border-black pt-2">
        <p className="text-xs uppercase tracking-wide">{t('contents')}</p>
        <p className="text-sm">
          {packageDescription}
          {isFragile ? ` — ${t('fragile')}` : ''}
        </p>
      </div>
    </div>
  );
};

export default ShipmentLabel;
