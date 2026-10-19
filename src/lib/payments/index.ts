import { stubProvider } from '@/lib/payments/providers/stub';
import { PAYMENT_METHODS } from '@/lib/types';

import type { PaymentProvider } from '@/lib/payments/types';
import type { PaymentMethod } from '@/lib/types';

// Swap this line once a real provider is chosen — nothing else in the app
// should need to change, since everything depends on the PaymentProvider
// interface rather than a concrete provider.
export const paymentProvider: PaymentProvider = stubProvider;

// Whether a real card provider is wired up (the stub can't take a payment).
export const cardPaymentsLive = (): boolean => paymentProvider !== stubProvider;

// Whether customers may pay by card at all. Off unless an administrator
// turns it on deliberately: CARD_PAYMENTS_ENABLED=true AND a real provider
// above. The database has its own switch too (payment_settings, migration
// 0048) and refuses card bookings from any client session while it is off,
// so a request that skips this code is still refused. Read on the server
// only; the browser is told the outcome (the payment methods it may offer).
export const cardPaymentsEnabled = (env: Record<string, string | undefined> = process.env): boolean =>
  env.CARD_PAYMENTS_ENABLED?.trim().toLowerCase() === 'true' && cardPaymentsLive();

// The payment methods a booking may use right now: cash only while card
// payments are off.
export const availablePaymentMethods = (enabled: boolean = cardPaymentsEnabled()): PaymentMethod[] =>
  PAYMENT_METHODS.filter((method) => method === 'cod' || enabled);

// Server-side gate for every booking path: a card booking while card
// payments are off is refused, whatever the browser sent.
export const assertPaymentMethodAllowed = (method: PaymentMethod, enabled: boolean = cardPaymentsEnabled()): string | null =>
  method === 'card' && !enabled ? 'booking.errors.cardUnavailable' : null;

export type { PaymentIntent, CreatePaymentIntentInput, RefundInput } from '@/lib/payments/types';
