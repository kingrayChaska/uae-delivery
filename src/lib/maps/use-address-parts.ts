import { useTranslations } from 'next-intl';

import { splitAddress } from '@/lib/maps/location';

// splitAddress, with a dropped pin's placeholder address ("Pinned location
// (25.08, 55.14)") shown in the reader's language.
export const useAddressParts = () => {
  const t = useTranslations('maps');
  return (address: string) => {
    const parts = splitAddress(address);
    if (!parts.pinnedCoordinates) return parts;
    return { ...parts, title: t('pinnedLocation'), subtitle: t('coordinates', { value: parts.pinnedCoordinates }) };
  };
};
