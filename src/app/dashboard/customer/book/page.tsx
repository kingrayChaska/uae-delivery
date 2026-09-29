import CustomerBookingWizard from '@/components/shipment/booking/customer-booking-wizard';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';

import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations('booking.meta'))('title'),
});

const BookDeliveryPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  // The account type comes from the database (only a manager's approval
  // makes someone a merchant); the server re-prices every booking anyway.
  const rules = await getActivePricingRules();

  return (
    <CustomerBookingWizard
      customerId={profile.id}
      accountType={profile.accountType}
      rules={rules[profile.accountType]}
    />
  );
};

export default BookDeliveryPage;
