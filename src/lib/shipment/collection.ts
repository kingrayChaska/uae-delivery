import type { Shipment } from '@/lib/types';

// THE cash a shipment involves, split by who pays it. Three amounts live on
// a shipment (see shipments.cod_amount, migration 0022) and only one of
// them is collected at the door:
//
//   fromRecipient  the goods amount, collected from the recipient on a
//                  postpaid shipment. Never includes the delivery fee —
//                  the recipient pays exactly what the sender entered.
//   senderCashFee  the delivery fee when the sender chose to pay it in
//                  cash. It's the sender's charge, already part of the
//                  shipment price, and is never added to fromRecipient.
//                  Never for a merchant: their fee is billed to the
//                  account (feeBilled, migration 0050), not handed to the
//                  driver.
//
// The database mirrors this split: complete_delivery() (0028) asks for COD
// confirmation exactly when fromRecipient > 0, and the COD record
// (sync_shipment_cod_transaction, 0022) stores the two as product_amount
// and delivery_fee_amount.
export type CashCollection = {
  fromRecipient: number;
  senderCashFee: number;
  currency: string;
};

type CollectionFields = Pick<Shipment, 'recipientPaymentType' | 'codAmount' | 'paymentMethod' | 'price' | 'currency' | 'feeBilled'>;

export const cashCollection = (shipment: CollectionFields): CashCollection => ({
  fromRecipient: shipment.recipientPaymentType === 'postpaid' ? Number(shipment.codAmount) : 0,
  senderCashFee: shipment.paymentMethod === 'cod' && !shipment.feeBilled ? Number(shipment.price) : 0,
  currency: shipment.currency,
});

// A card booking still waiting for its payment (made before card payments
// were turned off, migration 0048): it can move to cash.
export const awaitingCardPayment = (shipment: Pick<Shipment, 'status' | 'paymentMethod' | 'paymentStatus'>) =>
  shipment.status === 'pending_payment' && shipment.paymentMethod === 'card' && shipment.paymentStatus === 'pending';
