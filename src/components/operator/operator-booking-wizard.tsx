'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import FieldError from '@/components/ui/field-error';
import BookingWizard from '@/components/shipment/booking/booking-wizard';
import { createBookingForCustomerAction, createGuestBookingAction } from '@/lib/shipment/actions';
import { guestCustomerSchema } from '@/lib/shipment/schemas';

import type { AccountType, PaymentMethod, PricingRuleSet } from '@/lib/types';

type CustomerOption = { id: string; fullName: string; email: string; accountType: AccountType };

// Who the booking is for: a registered customer, or someone with no
// ParcelLink account who sent their details by WhatsApp or phone.
export type BookingFor = 'registered' | 'guest';

type OperatorBookingWizardProps = {
  operatorId: string;
  rules: PricingRuleSet;
  customers: CustomerOption[];
  basePath?: string;
  initialFor?: BookingFor;
};

// A customer with no account has nowhere to pay by card.
const GUEST_PAYMENT_METHODS: readonly PaymentMethod[] = ['cod'];

const OperatorBookingWizard = ({
  operatorId,
  rules,
  customers,
  basePath = '/dashboard/operator',
  initialFor = 'registered',
}: OperatorBookingWizardProps) => {
  const t = useTranslations('operator.booking');
  const ids = useId();
  const [bookingFor, setBookingFor] = useState<BookingFor>(initialFor);
  const [customerId, setCustomerId] = useState('');
  const [guest, setGuest] = useState({ name: '', phone: '' });
  const [guestError, setGuestError] = useState<{ field: 'name' | 'phone'; message: string } | null>(null);
  const isGuest = bookingFor === 'guest';
  const customer = customers.find((option) => option.id === customerId);
  // Quotes follow the selected customer's account type; the server prices
  // the booking from the customer's real account type either way. A guest
  // is priced as an individual.
  const accountType: AccountType = isGuest ? 'individual' : (customer?.accountType ?? 'individual');

  const validateGuest = () => {
    const parsed = guestCustomerSchema.safeParse(guest);
    if (parsed.success) {
      setGuestError(null);
      return null;
    }
    const issue = parsed.error.issues[0];
    const field = issue?.path[0] === 'phone' ? 'phone' : 'name';
    setGuestError({ field, message: issue?.message ?? 'validation.invalid' });
    return 'booking.errors.guestDetailsFirst';
  };

  const header = (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('bookingFor')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['registered', 'guest'] as const).map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring ${
                bookingFor === option ? 'border-primary bg-secondary/60' : 'border-input hover:border-primary/40'
              }`}
            >
              <input
                type="radio"
                name={`${ids}-for`}
                value={option}
                checked={bookingFor === option}
                onChange={() => setBookingFor(option)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">{t(`for.${option}.label`)}</span>
                <span className="block text-muted-foreground">{t(`for.${option}.description`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {isGuest ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-guest-name`}>{t('guestName')}</Label>
            <Input
              id={`${ids}-guest-name`}
              value={guest.name}
              maxLength={120}
              autoComplete="off"
              aria-invalid={guestError?.field === 'name' || undefined}
              onChange={(event) => setGuest((current) => ({ ...current, name: event.target.value }))}
            />
            <FieldError message={guestError?.field === 'name' ? guestError.message : null} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-guest-phone`}>{t('guestPhone')}</Label>
            <Input
              id={`${ids}-guest-phone`}
              type="tel"
              dir="ltr"
              value={guest.phone}
              maxLength={25}
              autoComplete="off"
              aria-invalid={guestError?.field === 'phone' || undefined}
              onChange={(event) => setGuest((current) => ({ ...current, phone: event.target.value }))}
            />
            <FieldError message={guestError?.field === 'phone' ? guestError.message : null} />
          </div>
          <p className="text-sm text-muted-foreground sm:col-span-2">{t('guestHint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-customer`}>{t('onBehalfOf')}</Label>
          <Select id={`${ids}-customer`} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">{t('selectCustomer')}</option>
            {customers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.accountType === 'merchant'
                  ? t('customerMerchant', { name: option.fullName, email: option.email })
                  : t('customer', { name: option.fullName, email: option.email })}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );

  return (
    <BookingWizard
      // Switching between an individual and a merchant (or a guest) changes
      // the rules, payment options and whether weight is required, so start
      // the booking over.
      key={`${bookingFor}-${accountType}`}
      uploaderId={operatorId}
      rules={rules[accountType]}
      accountType={accountType}
      header={header}
      showPrices
      paymentMethods={isGuest ? GUEST_PAYMENT_METHODS : undefined}
      validateBeforeSubmit={() =>
        isGuest ? validateGuest() : customerId ? null : 'booking.errors.selectCustomerFirst'
      }
      onSubmit={(input) =>
        isGuest ? createGuestBookingAction(guest, input) : createBookingForCustomerAction(customerId, input)
      }
      getSuccessPath={(result) =>
        result.batchId
          ? `${basePath}/bulk/${result.batchId}`
          : result.shipmentIds.length === 1
            ? `${basePath}/shipments/${result.shipmentIds[0]}`
            : `${basePath}/shipments?q=${encodeURIComponent(guest.phone)}`
      }
    />
  );
};

export default OperatorBookingWizard;
