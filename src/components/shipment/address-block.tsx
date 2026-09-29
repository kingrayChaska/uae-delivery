import { MapPinned, MessageSquareText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAddressParts } from '@/lib/maps/use-address-parts';

import type { Address } from '@/lib/types';

type AddressBlockProps = {
  heading: string;
  address: Address;
  // Drivers get a "Navigate" link to the exact coordinates.
  showNavigation?: boolean;
};

// One end of a shipment: the chosen location, the customer's building/unit
// details and instructions, and the contact. The coordinates are what the
// driver navigates to; the text helps them find the door.
const AddressBlock = ({ heading, address, showNavigation = false }: AddressBlockProps) => {
  const t = useTranslations('shipments.address');
  const splitAddress = useAddressParts();
  const details = [
    address.building,
    address.unit ? t('unit', { unit: address.unit }) : null,
    address.floor ? t('floor', { floor: address.floor }) : null,
  ].filter(Boolean);
  const { lat, lng } = address.coordinates;
  // A dropped pin without an address reads "Pinned location" in the
  // reader's language; anything else is shown exactly as stored.
  const parts = splitAddress(address.formattedAddress);
  const formatted = parts.pinnedCoordinates ? `${parts.title} (${parts.pinnedCoordinates})` : address.formattedAddress;

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</h2>
      <p className="wrap-break-word font-medium">{formatted}</p>
      {details.length ? <p className="wrap-break-word">{details.join(' · ')}</p> : null}
      {address.locationSource && address.locationSource !== 'search' ? (
        <p className="flex items-center gap-1.5 text-xs text-primary">
          <MapPinned className="size-3.5" aria-hidden />
          {address.locationSource === 'current_location' ? t('locatedCurrent') : t('pinSelected')}
        </p>
      ) : null}
      {address.instructions ? (
        <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm">
          <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="wrap-break-word">{address.instructions}</span>
        </p>
      ) : null}
      <p className="text-muted-foreground">
        {address.contactName} · <span dir="ltr">{address.contactPhone}</span>
      </p>
      {showNavigation ? (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex min-h-10 w-fit items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-primary transition-colors hover:bg-secondary"
        >
          {t('navigate')}
        </a>
      ) : null}
    </div>
  );
};

export default AddressBlock;
