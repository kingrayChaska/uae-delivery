import type { PaymentProvider } from '@/lib/payments/types';

// Placeholder provider so the rest of the app (booking flow, server actions)
// can be built and typechecked against the real PaymentProvider interface
// before a payment provider is chosen. Every method fails loudly rather
// than pretending to succeed — see section "PAYMENT_PROVIDER_API_KEY" in
// .env.example for how to wire up a real provider later.
const notConfigured = (): never => {
  throw new Error(
    'No payment provider is configured yet. Implement lib/payments/providers/<name>.ts ' +
      'against the PaymentProvider interface and export it from lib/payments/index.ts.',
  );
};

export const stubProvider: PaymentProvider = {
  createPaymentIntent: async () => notConfigured(),
  confirmPayment: async () => notConfigured(),
  refund: async () => notConfigured(),
};
