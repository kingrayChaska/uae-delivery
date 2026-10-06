import { msg, ref } from "@/i18n/message";

// Database errors must not reach the browser verbatim: messages like
// 'new row violates row-level security policy for table "shipments"' or
// 'duplicate key value violates unique constraint "vehicles_plate_number_key"'
// leak table, policy and constraint names.
//
// The one exception is SQLSTATE P0001 — errors raised by our OWN
// functions and triggers with RAISE EXCEPTION ('Customers can only cancel
// a shipment', 'Arrive at the destination before completing delivery').
// Those were written for users, so they pass through — as translation keys
// (errors.db.*) when we know them, so they're shown in the reader's
// language, else as written.
//
// Everything returned is a message for translateMessage() (i18n/message.ts).

type ErrorLike = { code?: string; message?: string } | null | undefined;

const FRIENDLY_BY_CODE: Record<string, string> = {
  "23505": "errors.duplicate",
  "23503": "errors.relatedMissing",
  "42501": "errors.forbidden",
  "22P02": "errors.invalidInput",
  "23502": "errors.invalidInput",
  "23514": "errors.invalidInput",
  PGRST116: "errors.notFound",
};

// Exact messages from RAISE EXCEPTION in database/migrations.
export const DATABASE_MESSAGES: Record<string, string> = {
  "Not authorized for this shipment": "errors.db.notAuthorizedShipment",
  "Only a manager can change a profile's role": "errors.db.managerChangesRole",
  "Only a manager can activate or deactivate a profile":
    "errors.db.managerActivates",
  "You cannot delete your own account": "errors.db.cannotDeleteSelf",
  "This driver is holding collected cash on delivery. Reconcile it first.":
    "errors.db.driverHoldsCash",
  "This driver has deliveries in progress. Reassign or complete them first.":
    "errors.db.driverHasDeliveries",
  "This account has already been deleted": "errors.db.accountAlreadyDeleted",
  "The manager role cannot be granted or revoked from the application":
    "errors.db.managerRoleLocked",
  "Signature not found for this shipment": "errors.db.signatureNotFound",
  "Shipment not found": "errors.db.shipmentNotFound",
  "Recipient name is required": "errors.db.recipientNameRequired",
  "QR code does not match this shipment": "errors.db.qrMismatch",
  "Provide at least one proof: photo, signature, OTP, or QR scan":
    "errors.db.proofRequired",
  "Photo not found for this shipment": "errors.db.photoNotFound",
  "A delivery photo is required": "errors.db.photoRequired",
  "Confirm the cash on delivery amount was collected":
    "errors.db.codConfirmRequired",
  "Only a shipment that has not been picked up can be cancelled":
    "errors.db.cancelBeforePickup",
  "Only a picked-up shipment can be returned": "errors.db.returnAfterPickup",
  "A reason is required": "errors.db.outcomeReasonRequired",
  "Keep the reason under 500 characters": "errors.db.outcomeReasonTooLong",
  "Only operator and driver accounts can be deleted":
    "errors.db.onlyStaffDeletable",
  "Only a manager can delete staff accounts": "errors.db.managerDeletesStaff",
  "No valid code — request a new one": "errors.db.noValidCode",
  "Arrive at the destination before requesting a code":
    "errors.db.arriveBeforeCode",
  "Arrive at the destination before completing delivery":
    "errors.db.arriveBeforeComplete",
  "Account not found": "errors.db.accountNotFound",
  "A driver may only mark their own expected COD as collected":
    "errors.db.ownCodOnly",
  "Tracking codes cannot be changed": "errors.db.trackingCodeLocked",
  "This shipment can no longer be declined": "errors.db.cannotDecline",
  "Shipments can only be assigned to an active driver":
    "errors.db.activeDriverOnly",
  "Shipment cannot be added to this batch": "errors.db.batchMismatch",
  "Review fields can only be changed by a manager": "errors.db.managerReviews",
  "Pricing and payment_status can only be changed by staff":
    "errors.db.staffPricing",
  "Only read_at may be changed on a notification":
    "errors.db.notificationReadOnly",
  "Only a manager can review merchant applications":
    "errors.db.managerReviewsMerchants",
  "Only a manager can change driver_code, vehicle_id or license fields":
    "errors.db.managerDriverFields",
  "Not authorized to update this shipment": "errors.db.notAuthorizedUpdate",
  "Not authorized to decline this shipment": "errors.db.notAuthorizedDecline",
  "Keep the message under 1000 characters": "errors.db.messageTooLong",
  "Give the applicant a reason": "errors.db.reasonRequired",
  "Drivers may only update delivery status and failure reason":
    "errors.db.driverFieldsOnly",
  "Deliveries can only be completed through proof of delivery":
    "errors.db.completeWithProof",
  "Customers may only cancel a shipment": "errors.db.customerCancelOnly",
  "Customers can only cancel a shipment": "errors.db.customerCancelOnly",
  "Customer is not a member of this business account":
    "errors.db.notBusinessMember",
  "Choose approve, reject or request changes": "errors.db.chooseDecision",
  "Application not found": "errors.db.applicationNotFound",
  "An edited application must be resubmitted for review":
    "errors.db.resubmitApplication",
  "Account type can only change through merchant approval":
    "errors.db.accountTypeLocked",
  "Bulk shipment not found": "errors.db.bulkShipmentNotFound",
  "A cancelled shipment cannot be invoiced": "errors.db.invoiceCancelled",
  "This shipment is billed on its bulk shipment invoice":
    "errors.db.invoiceOnBulk",
  "This shipment's charges are inconsistent and cannot be invoiced":
    "errors.db.invoiceInconsistent",
  "Bulk invoices are for merchant accounts": "errors.db.invoiceBulkMerchantOnly",
  "This bulk shipment has not been booked yet": "errors.db.invoiceBulkNotBooked",
  "This bulk shipment has no shipments to invoice": "errors.db.invoiceBulkEmpty",
  "This bulk shipment mixes currencies and cannot be invoiced":
    "errors.db.invoiceMixedCurrencies",
  "Invoice total does not match its lines": "errors.db.invoiceInconsistent",
  "Issued invoices cannot be changed": "errors.db.invoiceImmutable",
  "A void invoice cannot be changed": "errors.db.invoiceImmutable",
  "Invoices cannot be deleted": "errors.db.invoiceImmutable",
};

// Messages that carry values (RAISE EXCEPTION '... %', value).
const DATABASE_PATTERNS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [
    /^This delivery is ([\d.]+) km, beyond the ([\d.]+) km ParcelLink delivery limit$/,
    ([, distance, limit]) =>
      msg("errors.db.distanceLimit", { distance, limit }),
  ],
  [
    /^Invalid shipment status transition: (\w+) -> (\w+)$/,
    ([, from, to]) =>
      msg("errors.db.invalidTransition", {
        from: ref(`shipments.status.${from}`),
        to: ref(`shipments.status.${to}`),
      }),
  ],
  [
    /^Drivers cannot set status (\w+)$/,
    ([, status]) =>
      msg("errors.db.driverStatus", {
        status: ref(`shipments.status.${status}`),
      }),
  ],
  [
    /^This application can't be edited while it is (\w+)$/,
    ([, status]) =>
      msg("errors.db.applicationLocked", {
        status: ref(`merchant.status.${status}`),
      }),
  ],
];

const databaseMessage = (message: string): string => {
  if (DATABASE_MESSAGES[message]) return DATABASE_MESSAGES[message];
  for (const [pattern, toMessage] of DATABASE_PATTERNS) {
    const match = message.match(pattern);
    if (match) return toMessage(match);
  }
  return message;
};

export const safeErrorMessage = (
  error: ErrorLike,
  fallback = "errors.generic",
): string => {
  if (!error) return fallback;
  if (error.code === "P0001" && error.message)
    return databaseMessage(error.message);
  if (error.code && FRIENDLY_BY_CODE[error.code])
    return FRIENDLY_BY_CODE[error.code];
  return fallback;
};
