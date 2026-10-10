// Shared domain types and constants for the whole app.
// Every feature imports role/status/enum values from here instead of
// redefining string literals locally — this file is the single source of truth.
// Extended further in Phase 2 alongside the database schema.

export const ROLES = ['customer', 'driver', 'operator', 'manager'] as const;
export type Role = (typeof ROLES)[number];

export const SHIPMENT_STATUSES = [
  'pending_payment',
  'confirmed',
  'assigned',
  'driver_accepted',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
  'delivered',
  'delivery_failed',
  'cancelled',
  'returned',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['card', 'cod'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const COD_STATUSES = ['expected', 'collected', 'reconciled', 'remitted'] as const;
export type CodStatus = (typeof COD_STATUSES)[number];

export const DRIVER_AVAILABILITY = ['available', 'busy', 'offline'] as const;
export type DriverAvailability = (typeof DRIVER_AVAILABILITY)[number];

export const PACKAGE_TYPES = ['document', 'parcel', 'fragile', 'bulk'] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

// Individual customers vs. approved merchants (migration 0022). Only a
// manager's approval (review_merchant_application) makes an account a merchant.
export const ACCOUNT_TYPES = ['individual', 'merchant'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const MERCHANT_STATUSES = ['pending', 'approved', 'rejected', 'requires_changes'] as const;
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number];

export const DELIVERY_TYPES = ['same_day', 'next_day'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

// Whether the recipient has already paid the sender for the goods. Separate
// from PaymentMethod, which is how the DELIVERY FEE is paid.
export const RECIPIENT_PAYMENT_TYPES = ['prepaid', 'postpaid'] as const;
export type RecipientPaymentType = (typeof RECIPIENT_PAYMENT_TYPES)[number];

export type Profile = {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  active: boolean;
  accountType: AccountType;
  // null until the customer answers "How will you use ParcelLink?".
  accountTypeSelectedAt: string | null;
  createdAt: string;
};

export type Coordinates = {
  lat: number;
  lng: number;
};

export type Address = {
  formattedAddress: string;
  // Authoritative: route distance, price and the driver's navigation use these.
  coordinates: Coordinates;
  contactName: string;
  contactPhone: string;
  // Typed by the customer; null on shipments booked before migration 0025.
  building: string | null;
  unit: string | null;
  floor: string | null;
  instructions: string | null;
  // How the point was chosen: 'search' | 'pin' | 'current_location'.
  locationSource: string | null;
};

export type PricingRule = {
  id: string;
  name: string;
  deliveryType: DeliveryType;
  accountType: AccountType;
  baseDistanceKm: number;
  basePrice: number;
  additionalPricePerKm: number;
  includedWeightKg: number;
  additionalPricePerKg: number;
  codFee: number;
  // null = no distance limit (merchant rules).
  maxDistanceKm: number | null;
  currency: string;
  isActive: boolean;
};

// The active rule for every (account type, delivery type) pair.
export type PricingRuleSet = Record<AccountType, Record<DeliveryType, PricingRule>>;

export type PriceBreakdown = {
  deliveryType: DeliveryType;
  accountType: AccountType;
  distanceKm: number;
  durationMinutes: number;
  weightKg: number | null;
  baseDistanceKm: number;
  // basePrice + distanceCharge + weightCharge + codCharge + otherCharges = totalPrice
  basePrice: number;
  additionalDistanceKm: number;
  distanceCharge: number;
  includedWeightKg: number;
  additionalWeightKg: number;
  weightCharge: number;
  codCharge: number;
  otherCharges: number;
  totalPrice: number;
  currency: string;
  maxDistanceKm: number | null;
  // True when the trip is longer than the rule allows: it can't be booked.
  exceedsDistanceLimit: boolean;
};

// A customer with no ParcelLink account, booked by staff (migration 0040).
export type GuestCustomer = {
  name: string;
  phone: string;
};

export type Shipment = {
  id: string;
  trackingNumber: string;
  // null for a guest booking (guestCustomer is set instead).
  customerId: string | null;
  guestCustomer: GuestCustomer | null;
  // The staff member (or customer) who entered the booking; null before migration 0040.
  bookedBy: string | null;
  driverId: string | null;
  status: ShipmentStatus;
  pickup: Address;
  dropoff: Address;
  distanceKm: number;
  durationMinutes: number;
  price: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  recipientPaymentType: RecipientPaymentType;
  // Amount the driver collects from the recipient for the goods (0 when prepaid).
  codAmount: number;
  productValue: number | null;
  // Price breakdown; null on shipments booked before migration 0022.
  baseCharge: number | null;
  distanceCharge: number | null;
  weightCharge: number | null;
  codCharge: number | null;
  businessAccountId: string | null;
  batchId: string | null;
  // The bulk batch it was booked in (BLK-…), when the viewer may see it.
  batchReference: string | null;
  // The day the merchant asked for delivery (bulk uploads), YYYY-MM-DD.
  deliveryDate: string | null;
  packageType: PackageType;
  packageDescription: string;
  packageQuantity: number;
  packageWeightKg: number | null;
  packageLengthCm: number | null;
  packageWidthCm: number | null;
  packageHeightCm: number | null;
  isFragile: boolean;
  // Why it was cancelled, and why it wasn't delivered (a failed attempt or
  // a return to the sender).
  cancelledReason: string | null;
  deliveryFailedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

// Icon names are mapped to components in components/navigation, so this
// file stays free of UI imports.
export type NavIcon =
  | 'dashboard' | 'book' | 'deliveries' | 'track' | 'merchant' | 'payments' | 'notifications' | 'profile' | 'support'
  | 'current' | 'history' | 'cod' | 'cash' | 'shipments' | 'bulk' | 'bulkShipments' | 'dispatch' | 'drivers' | 'customers' | 'map' | 'activity'
  | 'operators' | 'business' | 'merchants' | 'pricing' | 'reports' | 'settings';

// Labels live in the translations (dashboard.nav.items.<icon> and
// dashboard.nav.sections.<heading>): each icon names one destination.
// merchantOnly: shown only to approved merchants (account_type 'merchant').
export type NavItem = { href: string; icon: NavIcon; merchantOnly?: boolean };
export type NavSectionKey = 'account' | 'operations' | 'people' | 'customersMerchants' | 'team' | 'business';
export type NavSection = { heading: NavSectionKey | null; items: NavItem[] };

export const NAV_SECTIONS: Record<Role, NavSection[]> = {
  customer: [
    {
      heading: null,
      items: [
        { href: '/dashboard/customer', icon: 'dashboard' },
        { href: '/dashboard/customer/book', icon: 'book' },
        { href: '/dashboard/customer/bulk', icon: 'bulkShipments', merchantOnly: true },
        { href: '/dashboard/customer/deliveries', icon: 'deliveries' },
        { href: '/dashboard/customer/track', icon: 'track' },
      ],
    },
    {
      heading: 'account',
      items: [
        { href: '/dashboard/customer/merchant', icon: 'merchant' },
        { href: '/dashboard/customer/payments', icon: 'payments' },
        { href: '/dashboard/customer/notifications', icon: 'notifications' },
        { href: '/dashboard/customer/profile', icon: 'profile' },
        { href: '/dashboard/customer/support', icon: 'support' },
      ],
    },
  ],
  driver: [
    {
      heading: null,
      items: [
        { href: '/dashboard/driver', icon: 'dashboard' },
        { href: '/dashboard/driver/current', icon: 'current' },
        { href: '/dashboard/driver/deliveries', icon: 'deliveries' },
        { href: '/dashboard/driver/history', icon: 'history' },
        { href: '/dashboard/driver/cod', icon: 'cod' },
      ],
    },
    {
      heading: 'account',
      items: [
        { href: '/dashboard/driver/notifications', icon: 'notifications' },
        { href: '/dashboard/driver/profile', icon: 'profile' },
      ],
    },
  ],
  operator: [
    {
      heading: null,
      items: [{ href: '/dashboard/operator', icon: 'dashboard' }],
    },
    {
      heading: 'operations',
      items: [
        { href: '/dashboard/operator/shipments', icon: 'shipments' },
        { href: '/dashboard/operator/bulk', icon: 'bulk' },
        { href: '/dashboard/operator/dispatch', icon: 'dispatch' },
        { href: '/dashboard/operator/live-map', icon: 'map' },
        { href: '/dashboard/operator/cod', icon: 'cod' },
        { href: '/dashboard/operator/cash', icon: 'cash' },
      ],
    },
    {
      heading: 'people',
      items: [
        { href: '/dashboard/operator/drivers', icon: 'drivers' },
        { href: '/dashboard/operator/customers', icon: 'customers' },
        { href: '/dashboard/operator/notifications', icon: 'notifications' },
        { href: '/dashboard/operator/support', icon: 'support' },
        { href: '/dashboard/operator/activity', icon: 'activity' },
      ],
    },
  ],
  manager: [
    {
      heading: null,
      items: [{ href: '/dashboard/manager', icon: 'dashboard' }],
    },
    {
      heading: 'operations',
      items: [
        { href: '/dashboard/manager/shipments', icon: 'shipments' },
        { href: '/dashboard/manager/bulk', icon: 'bulk' },
        { href: '/dashboard/manager/live-map', icon: 'map' },
        { href: '/dashboard/manager/cod', icon: 'cod' },
        { href: '/dashboard/manager/cash', icon: 'cash' },
        { href: '/dashboard/manager/payments', icon: 'payments' },
      ],
    },
    {
      heading: 'customersMerchants',
      items: [
        { href: '/dashboard/manager/merchants', icon: 'merchants' },
        { href: '/dashboard/manager/business-accounts', icon: 'business' },
        { href: '/dashboard/manager/customers', icon: 'customers' },
      ],
    },
    {
      heading: 'team',
      items: [
        { href: '/dashboard/manager/operators', icon: 'operators' },
        { href: '/dashboard/manager/drivers', icon: 'drivers' },
      ],
    },
    {
      heading: 'business',
      items: [
        { href: '/dashboard/manager/pricing', icon: 'pricing' },
        { href: '/dashboard/manager/reports', icon: 'reports' },
        { href: '/dashboard/manager/notifications', icon: 'notifications' },
        { href: '/dashboard/manager/activity', icon: 'activity' },
        { href: '/dashboard/manager/settings', icon: 'settings' },
      ],
    },
  ],
};

export const DASHBOARD_HOME: Record<Role, string> = {
  customer: '/dashboard/customer',
  driver: '/dashboard/driver',
  operator: '/dashboard/operator',
  manager: '/dashboard/manager',
};
