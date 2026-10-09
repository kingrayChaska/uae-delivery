import ShipmentsView from '@/components/staff-views/shipments-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { parseShipmentCategory } from '@/lib/shipment/categories';
import { parseShipmentFilters } from '@/lib/shipment/filters';
import { isUuid } from '@/lib/security/validate';

const OperatorShipmentsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    batch?: string;
    type?: string | string[];
    q?: string | string[];
    status?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) => {
  await requireRoleOrRedirect('operator');
  const params = await searchParams;
  const { page, batch, type } = params;
  return (
    <ShipmentsView
      basePath="/dashboard/operator"
      page={parsePage(page)}
      batchId={isUuid(batch) ? batch : null}
      category={parseShipmentCategory(type)}
      // Search, status and booking date, as on the merchant and driver lists.
      filters={parseShipmentFilters({ q: params.q, status: params.status, from: params.from, to: params.to })}
    />
  );
};

export default OperatorShipmentsPage;
