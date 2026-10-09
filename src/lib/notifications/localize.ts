// In-app notifications are written by database triggers (migrations 0017,
// 0018, 0020, 0022) in English, with a stable `type`. This maps a stored
// notification to translation keys (messages/*/notifications.json) plus the
// values pulled out of its text — tracking IDs, references, counts — so it
// reads in the reader's language. Anything that doesn't match a known
// pattern is shown exactly as stored, so nothing is ever lost.

export type StoredNotification = { type: string; title: string; body: string };

export type LocalizedNotification = {
  key: string;
  values: Record<string, string>;
};

type Rule = {
  type: string;
  // Tells apart notifications that share a type (the customer's and the
  // operators' versions of the same event).
  title?: string;
  key: string;
  body: RegExp;
  values?: (match: RegExpMatchArray) => Record<string, string>;
};

const code = (match: RegExpMatchArray) => ({ code: match[1] });

const RULES: Rule[] = [
  { type: 'shipment.booked', key: 'booked', body: /^Your shipment (\S+) has been booked\.$/, values: code },
  { type: 'shipment.ready_for_dispatch', key: 'readyForDispatch', body: /^(\S+) is confirmed and awaiting a driver\.$/, values: code },
  { type: 'shipment.driver_declined', key: 'driverDeclined', body: /^(\S+) needs a new driver\.$/, values: code },
  { type: 'payment.success', key: 'paymentSuccess', body: /^Payment for (\S+) was received\.$/, values: code },
  { type: 'shipment.driver_arriving', key: 'driverArriving', body: /^Your driver has arrived for pickup of (\S+)\.$/, values: code },
  { type: 'shipment.picked_up', key: 'pickedUp', body: /^(\S+) has been picked up\.$/, values: code },
  { type: 'shipment.in_transit', key: 'inTransit', body: /^(\S+) is on its way\.$/, values: code },
  { type: 'shipment.delivered', key: 'delivered', body: /^(\S+) has been delivered\.$/, values: code },
  {
    type: 'shipment.delivery_failed',
    title: 'Delivery failed',
    key: 'deliveryFailed',
    body: /^A delivery attempt for (\S+) failed\.$/,
    values: code,
  },
  {
    type: 'shipment.delivery_failed',
    title: 'Delivery failed — needs attention',
    key: 'deliveryFailedStaff',
    body: /^(\S+) failed delivery and needs action\.$/,
    values: code,
  },
  { type: 'shipment.cancelled', key: 'cancelled', body: /^(\S+) was cancelled by the customer\.$/, values: code },
  // Driver cancellations and returns (migration 0028).
  { type: 'shipment.cancelled_by_driver', key: 'cancelledByDriver', body: /^(\S+) was cancelled by the driver\.$/, values: code },
  {
    type: 'shipment.cancelled_by_driver',
    key: 'cancelledByDriverStaff',
    body: /^(\S+) was cancelled by the driver before pickup\.$/,
    values: code,
  },
  { type: 'shipment.returned', key: 'returned', body: /^(\S+) is being returned to the sender\.$/, values: code },
  {
    type: 'shipment.returned',
    key: 'returnedStaff',
    body: /^(\S+) was not delivered and is being returned to the sender\.$/,
    values: code,
  },
  { type: 'shipment.assigned', key: 'assigned', body: /^You've been assigned (\S+)\.$/, values: code },
  // The driver a shipment was reassigned away from (migration 0039).
  { type: 'shipment.unassigned', key: 'unassigned', body: /^(\S+) has been reassigned to another driver\.$/, values: code },
  {
    type: 'delivery.otp',
    key: 'deliveryOtp',
    body: /^Share this code with your driver to confirm delivery of (\S+): (\d+)$/,
    values: (match) => ({ code: match[1], otp: match[2] }),
  },
  {
    type: 'batch.submitted',
    title: 'Shipments booked',
    key: 'batchBooked',
    body: /^(\S+): (\d+) of (\d+) shipments booked\.$/,
    values: (match) => ({ reference: match[1], created: match[2], total: match[3] }),
  },
  {
    type: 'batch.submitted',
    title: 'Bulk list submitted',
    key: 'batchSubmitted',
    body: /^(\S+) \((.*)\): (\d+) of (\d+) shipments created\.$/,
    values: (match) => ({ reference: match[1], name: match[2], created: match[3], total: match[4] }),
  },
  {
    type: 'batch.submitted',
    title: 'New multi-shipment booking',
    key: 'batchNewBooking',
    body: /^(.*) booked (\d+) shipments \((\S+)\)(?: for pickup on (.+))?\.$/,
    values: (match) => ({ sender: match[1], count: match[2], reference: match[3], date: match[4] ?? '' }),
  },
  {
    type: 'batch.submitted',
    title: 'New bulk shipment list',
    key: 'batchNewList',
    body: /^(.*) submitted (\S+) with (\d+) shipments(?: for pickup on (.+))?\.$/,
    values: (match) => ({ sender: match[1], reference: match[2], count: match[3], date: match[4] ?? '' }),
  },
  {
    type: 'merchant.application_submitted',
    key: 'merchantApplied',
    body: /^([\s\S]*) applied for a merchant account\.$/,
    values: (match) => ({ company: match[1] }),
  },
  {
    type: 'merchant.approved',
    key: 'merchantApproved',
    body: /^You now have merchant pricing and tools\. Book your first merchant shipment from your dashboard\.$/,
  },
  {
    type: 'merchant.requires_changes',
    key: 'merchantChanges',
    body: /^([\s\S]*?) ?Update your application and resubmit it from the Merchant page\.$/,
    values: (match) => ({ note: match[1].trim() }),
  },
  {
    type: 'merchant.rejected',
    key: 'merchantRejected',
    body: /^([\s\S]*?) ?You can edit and resubmit your application from the Merchant page\.$/,
    values: (match) => ({ note: match[1].trim() }),
  },
];

export const localizeNotification = (notification: StoredNotification): LocalizedNotification | null => {
  for (const rule of RULES) {
    if (rule.type !== notification.type) continue;
    if (rule.title && rule.title !== notification.title) continue;
    const match = notification.body.match(rule.body);
    if (match) return { key: rule.key, values: rule.values?.(match) ?? {} };
  }
  return null;
};

// Triggers write this when a customer has no name on file.
export const UNKNOWN_SENDER = 'A customer';
