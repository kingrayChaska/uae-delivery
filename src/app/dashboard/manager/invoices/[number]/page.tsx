import { getTranslations } from 'next-intl/server';

import InvoiceView from '@/components/invoices/invoice-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { isInvoiceNumber } from '@/lib/invoices/types';

import type { Metadata } from 'next';

type Params = Promise<{ number: string }>;

export const generateMetadata = async ({ params }: { params: Params }): Promise<Metadata> => {
  const [t, { number }] = await Promise.all([getTranslations('invoices'), params]);
  return { title: isInvoiceNumber(number) ? t('meta', { number }) : t('title') };
};

// RLS decides which invoices this manager may open (migration 0031).
const ManagerInvoicePage = async ({ params, searchParams }: { params: Params; searchParams: Promise<{ issued?: string }> }) => {
  await requireRoleOrRedirect('manager');
  const [{ number }, { issued }] = await Promise.all([params, searchParams]);
  return (
    <InvoiceView
      invoiceNumber={number}
      issued={issued === '1'}
      shipmentHref={(id) => `/dashboard/manager/shipments/${id}`}
      batchHref={(id) => `/dashboard/manager/bulk/${id}`}
    />
  );
};

export default ManagerInvoicePage;
