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
  "A photo is required": "errors.db.outcomePhotoRequired",
  "A delivery note is required": "errors.db.deliveryNoteRequired",
  "Keep the delivery note under 500 characters": "errors.db.deliveryNoteTooLong",
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
  // Guest bookings (0040)
  "This customer has no ParcelLink account to receive a code. Use the delivery photo as proof.":
    "errors.db.guestNoOtp",
  // Status corrections (0041)
  "Only operators and managers can correct a shipment status":
    "errors.db.correctionStaffOnly",
  "Give a reason for the correction": "errors.db.correctionReason",
  "The shipment already has this status": "errors.db.correctionSameStatus",
  "Delivered shipments have proof of delivery and can't be corrected here":
    "errors.db.correctionDelivered",
  "Only a manager can re-open a cancelled or returned shipment":
    "errors.db.correctionManagerReopens",
  "Assign a driver before correcting this shipment's delivery status":
    "errors.db.correctionNeedsDriver",
  // Driver cash (0042)
  "Only operators and managers can manage driver cash": "errors.db.cashStaffOnly",
  "Only a manager can confirm or reject a remittance": "errors.db.remittanceManagerDecides",
  "Choose confirm or reject": "errors.db.remittanceChooseDecision",
  "Give a reason for rejecting this remittance": "errors.db.remittanceRejectReason",
  "Keep the note under 500 characters": "errors.db.remittanceNoteTooLong",
  "Remittance not found": "errors.db.remittanceNotFound",
  "Driver not found": "errors.db.driverNotFound",
  "Enter an amount greater than zero": "errors.db.remittanceAmountPositive",
  "Use at most two decimal places": "errors.db.remittanceTwoDecimals",
  "Choose how the money was received": "errors.db.remittanceMethod",
  "The date received can't be in the future": "errors.db.remittanceFutureDate",
  "This request was already used for a different remittance": "errors.db.remittanceRequestReused",
  "Record a driver remittance to settle this cash": "errors.db.settleWithRemittance",
  "A recorded collection can't be changed": "errors.db.collectionLocked",
  "A remittance can only be confirmed or rejected once": "errors.db.remittanceLocked",
  "Remittances can't be deleted": "errors.db.remittanceLocked",
  // Financial reporting (0044)
  "Only a manager can manage merchant statements": "errors.db.statementManagerOnly",
  "Only a manager can view the performance report": "errors.db.performanceManagerOnly",
  "Merchant not found": "errors.db.statementMerchantNotFound",
  "Statement not found": "errors.db.statementNotFound",
  "Choose a valid reporting period": "errors.db.statementPeriod",
  "A reporting period can be at most 366 days": "errors.db.statementPeriodTooLong",
  "A reporting period can't end in the future": "errors.db.statementPeriodFuture",
  "A published statement already covers part of this period": "errors.db.statementOverlap",
  "There are no completed deliveries or returns in this period": "errors.db.statementEmpty",
  "This statement mixes currencies and cannot be generated": "errors.db.statementCurrencies",
  "Statement total does not match its lines": "errors.db.statementInconsistent",
  "Only a published statement can be corrected": "errors.db.statementCorrectPublished",
  "A correction covers the same period as the statement it replaces": "errors.db.statementCorrectionPeriod",
  "Give a reason for the correction (5 to 500 characters)": "errors.db.statementCorrectionReason",
  "Only a draft statement can be published": "errors.db.statementNotDraft",
  "Only a draft statement can be discarded": "errors.db.statementDiscardDraft",
  "The statement this corrects has already been replaced": "errors.db.statementAlreadySuperseded",
  "A shipment on this statement is already on another published statement": "errors.db.statementDuplicateShipment",
  "Published statements cannot be changed": "errors.db.statementImmutable",
  "Expenses cannot be deleted. Void the expense instead.": "errors.db.expenseNoDelete",
  "Void expenses cannot be changed": "errors.db.expenseVoidLocked",
  "Give a reason for voiding this expense": "errors.db.expenseVoidReason",
  "Void an expense without changing it": "errors.db.expenseVoidUnchanged",
  "Expense categories cannot be deleted. Deactivate the category instead.": "errors.db.expenseCategoryNoDelete",
  "Built-in expense categories cannot be renamed, regrouped or deactivated": "errors.db.expenseCategoryLocked",
  // Rates, settlements (0045)
  "New rates can only take effect from today onwards": "errors.db.rateBackdated",
  "The return charge rate must be between 0% and 100%": "errors.db.rateReturnRange",
  "The cash-handling rate must be between 0% and 20%": "errors.db.rateHandlingRange",
  // Migration 0051.
  "The cash-handling charge has been removed; merchants are billed the flat delivery rates": "errors.db.cashHandlingRemoved",
  "Rates already in force can't be changed": "errors.db.rateLocked",
  "Payments are recorded against the current published statement": "errors.db.settlementCurrentOnly",
  "Choose how the money was paid": "errors.db.settlementMethod",
  "The payment date can't be in the future": "errors.db.settlementFutureDate",
  "This statement is already settled": "errors.db.settlementAlreadySettled",
  "This request was already used for a different settlement": "errors.db.settlementRequestReused",
  "Settlements can't be deleted. Void the settlement instead.": "errors.db.settlementLocked",
  "A settlement can only be voided": "errors.db.settlementLocked",
  "Give a reason for voiding this payment (5 to 500 characters)": "errors.db.settlementVoidReason",
  "Payment not found": "errors.db.settlementNotFound",
  // Staff price changes and cancellation (0046)
  "Only operators and managers can change a shipment's price": "errors.db.priceStaffOnly",
  "Enter a delivery charge between AED 0 and AED 10,000": "errors.db.priceRange",
  "Give a reason for the price change (5 to 500 characters)": "errors.db.priceReason",
  "The price is unchanged": "errors.db.priceUnchanged",
  "This shipment changed since you opened it — reload and try again": "errors.db.staffChangedSinceOpened",
  "A delivered, cancelled or returned shipment's price can't be changed": "errors.db.priceClosed",
  "The delivery fee has already been paid, so the price can't be changed here": "errors.db.priceFeePaid",
  "The driver has already collected the delivery fee, so the price can't be changed here": "errors.db.priceFeeCollected",
  "This shipment is on a merchant statement, so the price can't be changed here": "errors.db.priceOnStatement",
  "Prices can only be changed with the Edit price action": "errors.db.priceDirectUpdate",
  "Only operators and managers can cancel a shipment here": "errors.db.cancelStaffOnly",
  "Give a reason for the cancellation (5 to 500 characters)": "errors.db.cancelReason",
  "This parcel has been picked up. The driver must return it to the sender instead": "errors.db.cancelPickedUp",
  "This delivery failed. Mark it returned instead of cancelling it": "errors.db.cancelFailed",
  "Delivered shipments can't be cancelled": "errors.db.cancelDelivered",
  "Returned shipments can't be cancelled": "errors.db.cancelReturned",
  "This shipment is already cancelled": "errors.db.cancelAlready",
  "Cancel shipments with the Cancel shipment action": "errors.db.cancelDirectUpdate",
  // Cash only and weekly remittances (0048)
  "Card payments are turned off. Choose cash.": "errors.db.cardPaymentsOff",
  "Only a shipment still waiting for its card payment can switch to cash": "errors.db.switchNotWaiting",
  "This shipment already has a card payment, so it can't switch to cash": "errors.db.switchAlreadyPaid",
  "Enter an amount of AED 0 or more": "errors.db.cashAmount",
  "Only drivers can submit a cash remittance": "errors.db.cashDriverOnly",
  "A manager decides remittances recorded by staff": "errors.db.cashStaffRecorded",
  "This remittance was already disputed": "errors.db.cashAlreadyDisputed",
  "You can't confirm more than the driver submitted": "errors.db.cashMoreThanSubmitted",
  "You can't confirm more than the operator submitted": "errors.db.cashMoreThanSubmitted",
  "Explain the difference (at least 5 characters)": "errors.db.cashDiscrepancyReason",
  "Give a reason for the dispute (5 to 500 characters)": "errors.db.cashDisputeReason",
  "Only operators can submit a remittance to the manager": "errors.db.cashOperatorOnly",
  "Only a manager can confirm an operator's remittance": "errors.db.cashManagerOnly",
};

// Messages that carry values (RAISE EXCEPTION '... %', value).
const DATABASE_PATTERNS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [
    /^This is more than is outstanding on the statement \(AED ([\d.]+)\)$/,
    ([, amount]) => msg("errors.db.settlementTooLarge", { amount }),
  ],
  [
    /^This shipment's cash on delivery is paid out through statement (\S+)$/,
    ([, number]) => msg("errors.db.codPaidThroughStatement", { number }),
  ],
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
    /^This shipment is now (\w+), not (\w+) — reload it before correcting$/,
    ([, status]) =>
      msg("errors.db.correctionStale", {
        status: ref(`shipments.status.${status}`),
      }),
  ],
  [
    /^A shipment can't be corrected from (\w+) to (\w+)$/,
    ([, from, to]) =>
      msg("errors.db.correctionNotAllowed", {
        from: ref(`shipments.status.${from}`),
        to: ref(`shipments.status.${to}`),
      }),
  ],
  [
    /^This is more than the driver owes: AED ([\d.]+) outstanding, AED ([\d.]+) already awaiting confirmation$/,
    ([, outstanding, pending]) =>
      msg("errors.db.remittanceTooLarge", { outstanding, pending }),
  ],
  [
    /^This is more COD than you hold: AED ([\d.]+) available$/,
    ([, amount]) => msg("errors.db.cashMoreCod", { amount }),
  ],
  [
    /^This is more in delivery fees than you hold: AED ([\d.]+) available$/,
    ([, amount]) => msg("errors.db.cashMoreFee", { amount }),
  ],
  [
    /^This is more than you hold: AED ([\d.]+) available$/,
    ([, amount]) => msg("errors.db.cashMoreTotal", { amount }),
  ],
  [
    /^This is more than the operator now holds \(AED ([\d.]+)\)$/,
    ([, amount]) => msg("errors.db.cashOperatorNowHolds", { amount }),
  ],
  [
    /^This is more than the driver now owes \(AED ([\d.]+)\)$/,
    ([, outstanding]) => msg("errors.db.remittanceTooLargeNow", { outstanding }),
  ],
  [
    /^This remittance was already (confirmed|rejected|disputed)$/,
    ([, status]) =>
      msg("errors.db.remittanceAlreadyDecided", {
        status: ref(`operator.cash.status.${status}`),
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
