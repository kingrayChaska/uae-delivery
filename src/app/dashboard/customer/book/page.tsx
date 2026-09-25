import CustomerBookingWizard from '@/components/shipment/booking/customer-booking-wizard';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getActivePricingRule } from '@/lib/pricing/get-active-rule';

const BookDeliveryPage = async () => {
  const profile = await requireRoleOrRedirect('customer');
  const activeRule = await getActivePricingRule();

  return <CustomerBookingWizard customerId={profile.id} activeRule={activeRule} />;
};

export default BookDeliveryPage;
