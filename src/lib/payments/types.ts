export type PaymentIntent = {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_action' | 'succeeded' | 'failed';
  clientSecret: string | null;
};

export type CreatePaymentIntentInput = {
  amount: number;
  currency: string;
  shipmentId: string;
  customerId: string;
};

export type RefundInput = {
  paymentId: string;
  amount?: number;
  reason?: string;
};

// Every payment provider (Stripe, Telr, PayTabs, Ziina, ...) implements this
// shape. Call sites (server actions, route handlers) only ever depend on
// this interface — swapping providers means adding a new file under
// lib/payments/providers/ and updating the export in lib/payments/index.ts,
// nothing else changes.
export type PaymentProvider = {
  createPaymentIntent: (input: CreatePaymentIntentInput) => Promise<PaymentIntent>;
  confirmPayment: (paymentIntentId: string) => Promise<PaymentIntent>;
  refund: (input: RefundInput) => Promise<{ id: string; status: 'refunded' | 'failed' }>;
};
