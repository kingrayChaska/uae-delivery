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

export type Profile = {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  active: boolean;
  createdAt: string;
};

export type Coordinates = {
  lat: number;
  lng: number;
};

export type Address = {
  formattedAddress: string;
  coordinates: Coordinates;
  contactName: string;
  contactPhone: string;
};

export type PricingRule = {
  id: string;
  name: string;
  baseDistanceKm: number;
  basePrice: number;
  additionalPricePerKm: number;
  currency: string;
  isActive: boolean;
};

export type PriceBreakdown = {
  distanceKm: number;
  durationMinutes: number;
  baseDistanceKm: number;
  basePrice: number;
  additionalDistanceKm: number;
  additionalPrice: number;
  totalPrice: number;
  currency: string;
};

export type Shipment = {
  id: string;
  trackingNumber: string;
  customerId: string;
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
  packageType: PackageType;
  packageDescription: string;
  packageQuantity: number;
  packageWeightKg: number | null;
  isFragile: boolean;
  createdAt: string;
  updatedAt: string;
};

export const NAV_ITEMS: Record<Role, { label: string; href: string }[]> = {
  customer: [
    { label: 'Dashboard', href: '/dashboard/customer' },
    { label: 'Book Delivery', href: '/dashboard/customer/book' },
    { label: 'Bulk Shipments', href: '/dashboard/customer/bulk' },
    { label: 'My Deliveries', href: '/dashboard/customer/deliveries' },
    { label: 'Track Shipment', href: '/tracking' },
    { label: 'Payments', href: '/dashboard/customer/payments' },
    { label: 'Notifications', href: '/dashboard/customer/notifications' },
    { label: 'Profile', href: '/dashboard/customer/profile' },
    { label: 'Support', href: '/dashboard/customer/support' },
  ],
  driver: [
    { label: 'Dashboard', href: '/dashboard/driver' },
    { label: 'My Deliveries', href: '/dashboard/driver/deliveries' },
    { label: 'Current Delivery', href: '/dashboard/driver/current' },
    { label: 'Delivery History', href: '/dashboard/driver/history' },
    { label: 'COD', href: '/dashboard/driver/cod' },
    { label: 'Notifications', href: '/dashboard/driver/notifications' },
    { label: 'Profile', href: '/dashboard/driver/profile' },
  ],
  operator: [
    { label: 'Dashboard', href: '/dashboard/operator' },
    { label: 'Shipments', href: '/dashboard/operator/shipments' },
    { label: 'Bulk Shipments', href: '/dashboard/operator/bulk' },
    { label: 'Dispatch', href: '/dashboard/operator/dispatch' },
    { label: 'Drivers', href: '/dashboard/operator/drivers' },
    { label: 'Customers', href: '/dashboard/operator/customers' },
    { label: 'COD', href: '/dashboard/operator/cod' },
    { label: 'Live Map', href: '/dashboard/operator/live-map' },
    { label: 'Support', href: '/dashboard/operator/support' },
    { label: 'Activity Log', href: '/dashboard/operator/activity' },
  ],
  manager: [
    { label: 'Dashboard', href: '/dashboard/manager' },
    { label: 'Shipments', href: '/dashboard/manager/shipments' },
    { label: 'Bulk Shipments', href: '/dashboard/manager/bulk' },
    { label: 'Live Map', href: '/dashboard/manager/live-map' },
    { label: 'Operators', href: '/dashboard/manager/operators' },
    { label: 'Drivers', href: '/dashboard/manager/drivers' },
    { label: 'Customers', href: '/dashboard/manager/customers' },
    { label: 'Business Accounts', href: '/dashboard/manager/business-accounts' },
    { label: 'Payments', href: '/dashboard/manager/payments' },
    { label: 'COD', href: '/dashboard/manager/cod' },
    { label: 'Pricing', href: '/dashboard/manager/pricing' },
    { label: 'Reports', href: '/dashboard/manager/reports' },
    { label: 'Notifications', href: '/dashboard/manager/notifications' },
    { label: 'Activity Logs', href: '/dashboard/manager/activity' },
    { label: 'Settings', href: '/dashboard/manager/settings' },
  ],
};

export const DASHBOARD_HOME: Record<Role, string> = {
  customer: '/dashboard/customer',
  driver: '/dashboard/driver',
  operator: '/dashboard/operator',
  manager: '/dashboard/manager',
};
