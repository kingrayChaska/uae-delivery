import { stubProvider } from '@/lib/payments/providers/stub';

import type { PaymentProvider } from '@/lib/payments/types';

// Swap this line once a real provider is chosen — nothing else in the app
// should need to change, since everything depends on the PaymentProvider
// interface rather than a concrete provider.
export const paymentProvider: PaymentProvider = stubProvider;

// Whether card payment actually works. While the stub is in place a card
// booking can only wait at 'pending_payment', so flows that would create
// many of them at once (merchant bulk shipments) offer cash only.
export const cardPaymentsLive = (): boolean => paymentProvider !== stubProvider;

export type { PaymentIntent, CreatePaymentIntentInput, RefundInput } from '@/lib/payments/types';
