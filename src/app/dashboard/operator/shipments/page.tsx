import ShipmentsView from '@/components/staff-views/shipments-view';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { parsePage } from '@/lib/pagination';
import { parseShipmentCategory } from '@/lib/shipment/categories';
import { isUuid } from '@/lib/security/validate';

const OperatorShipmentsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; batch?: string; type?: string | string[] }>;
}) => {
  await requireRoleOrRedirect('operator');
  const { page, batch, type } = await searchParams;
  return (
    <ShipmentsView
      basePath="/dashboard/operator"
      page={parsePage(page)}
      batchId={isUuid(batch) ? batch : null}
      category={parseShipmentCategory(type)}
    />
  );
};

export default OperatorShipmentsPage;
