import { MapPinned, MessageSquareText } from 'lucide-react';

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
  const details = [
    address.building,
    address.unit ? `Unit ${address.unit}` : null,
    address.floor ? `Floor ${address.floor}` : null,
  ].filter(Boolean);
  const { lat, lng } = address.coordinates;

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</h2>
      <p className="break-words font-medium">{address.formattedAddress}</p>
      {details.length ? <p className="break-words">{details.join(' · ')}</p> : null}
      {address.locationSource && address.locationSource !== 'search' ? (
        <p className="flex items-center gap-1.5 text-xs text-primary">
          <MapPinned className="size-3.5" aria-hidden />
          {address.locationSource === 'current_location' ? 'Located with current location' : 'Pin location selected'}
        </p>
      ) : null}
      {address.instructions ? (
        <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm">
          <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="break-words">{address.instructions}</span>
        </p>
      ) : null}
      <p className="text-muted-foreground">
        {address.contactName} · {address.contactPhone}
      </p>
      {showNavigation ? (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex min-h-10 w-fit items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-primary transition-colors hover:bg-secondary"
        >
          Navigate to exact location
        </a>
      ) : null}
    </div>
  );
};

export default AddressBlock;
