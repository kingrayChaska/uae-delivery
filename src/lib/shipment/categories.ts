// The staff shipments list's categories (?type=). A shipment is Individual
// or Merchant by the account type of the customer who booked it; Bulk is a
// shipment_batches row — a group booked together — shown as one entry with
// its shipments inside, never inferred from a quantity.
export const SHIPMENT_CATEGORIES = ['all', 'individual', 'merchant', 'bulk'] as const;
export type ShipmentCategory = (typeof SHIPMENT_CATEGORIES)[number];

// Anything unrecognised in the URL falls back to All.
export const parseShipmentCategory = (value: string | string[] | undefined): ShipmentCategory => {
  const raw = Array.isArray(value) ? value[0] : value;
  return SHIPMENT_CATEGORIES.find((category) => category === raw) ?? 'all';
};
