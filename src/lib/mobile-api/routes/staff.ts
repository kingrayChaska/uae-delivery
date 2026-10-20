import 'server-only';

import { getCurrentProfile } from '@/lib/auth/session';
import { decideRemittanceAction, recordRemittanceAction } from '@/lib/cash/actions';
import { parseCashFilters, parseDriverLedgerFilters } from '@/lib/cash/schemas';
import { reconcileCodAction, remitCodAction } from '@/lib/cod/actions';
import {
  adjustShipmentPriceAction,
  assignDriverAction,
  correctShipmentStatusAction,
  getAvailableDriversAction,
  markReturnedAction,
  reassignDriverAction,
  staffCancelShipmentAction,
} from '@/lib/dispatch/actions';
import { MANAGER, STAFF, fail, fromAction, ok } from '@/lib/mobile-api/router';
import { parsePage } from '@/lib/pagination';
import { isUuid } from '@/lib/security/validate';
import { parseShipmentCategory } from '@/lib/shipment/categories';
import { STATUS_FILTERS, parseShipmentFilters } from '@/lib/shipment/filters';
import { correctionTargets } from '@/lib/shipment/status-corrections';
import { getBatchDetail, getBatchLabel, getBatchDispatchBacklog, listBatches } from '@/services/bulk/list-batches';
import {
  countPendingRemittances,
  getDriverCashPosition,
  getDriverCashTotals,
  getDriverIdentity,
  listDriverCash,
  listDriverCollections,
  listDriverRemittances,
} from '@/services/cash/driver-cash';
import { getCodTotals, listCodTransactionsPage } from '@/services/cod/list-all-cod';
import { listCustomers } from '@/services/customers/list-customers';
import { listAllDrivers } from '@/services/drivers/list-all-drivers';
import { getDriverLocationsSnapshot } from '@/services/drivers/get-driver-locations-snapshot';
import { listDriversForLiveMap } from '@/services/drivers/list-drivers-for-live-map';
import { getInvoiceNumberFor } from '@/services/invoices/get-invoice';
import { getProfileAccountType, getProfileName } from '@/services/profiles/get-profile-name';
import { getOperationsSummary } from '@/services/shipments/get-operations-summary';
import { getOutcomeProof } from '@/services/shipments/get-outcome-proof';
import { getProofOfDelivery } from '@/services/shipments/get-proof-of-delivery';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { getStaffActionContext, listStaffShipmentEvents } from '@/services/shipments/get-staff-actions';
import { listUnassignedShipments, searchStaffShipments } from '@/services/shipments/list-all-shipments';

import type { MobileRoute, RouteContext } from '@/lib/mobile-api/router';

// The operator dashboard — and the manager's, which has every operator
// screen too. Reads are the website's staff services; RLS grants staff the
// rows. Writes are the website's server actions: role re-checked, input
// validated, compare-and-set against the state the operator saw, audited.

// Request bodies are untrusted and go to the actions as received: each
// action validates its input with its own zod schema (hence `as never` where
// a field is typed as an enum or a parsed value).
const body = (ctx: RouteContext) => (ctx.body && typeof ctx.body === 'object' ? (ctx.body as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const param = (ctx: RouteContext, name: string) => ctx.query.get(name) ?? undefined;
const page = (ctx: RouteContext) => parsePage(param(ctx, 'page'));

// Everything the website's staff shipment page shows and decides
// (components/staff-views/shipment-detail-view.tsx), as data: which actions
// to offer is worked out here, by the website's rules, not by the app.
const shipmentDetail = async (id: string) => {
  const detail = await getShipmentDetail(id);
  if (!detail) return null;
  const { shipment, history, packageImageUrl } = detail;
  const [viewer, driverName, customerName, bookedByName, batch, proof, outcomeProof, invoiceNumber, actionContext, staffEvents, accountType] =
    await Promise.all([
      getCurrentProfile(),
      getProfileName(shipment.driverId),
      getProfileName(shipment.customerId),
      shipment.bookedBy && shipment.bookedBy !== shipment.customerId ? getProfileName(shipment.bookedBy) : Promise.resolve(null),
      getBatchLabel(shipment.batchId),
      shipment.status === 'delivered' ? getProofOfDelivery(shipment.id) : Promise.resolve(null),
      shipment.status === 'cancelled' || shipment.status === 'returned' ? getOutcomeProof(shipment.id) : Promise.resolve(null),
      getInvoiceNumberFor({ shipmentId: shipment.id }),
      getStaffActionContext(shipment.id),
      listStaffShipmentEvents(shipment.id),
      getProfileAccountType(shipment.customerId),
    ]);

  return {
    shipment,
    history,
    packageImageUrl,
    driverName,
    customerName,
    bookedByName,
    accountType,
    batch,
    proof,
    outcomeProof,
    invoiceNumber,
    actionContext,
    staffEvents,
    allowed: {
      assign: shipment.status === 'confirmed' && !shipment.driverId,
      reassign: shipment.status === 'assigned' || shipment.status === 'delivery_failed',
      markReturned: shipment.status === 'delivery_failed',
      correctTo: correctionTargets(shipment.status, { isManager: viewer?.role === 'manager', hasDriver: shipment.driverId !== null }),
      // Offered with an explanation when blocked, as on the website.
      priceEdit: actionContext !== null && actionContext.priceEditBlock !== 'closed',
      cancel: actionContext !== null && (actionContext.cancelBlock === null || actionContext.cancelBlock === 'picked_up'),
    },
    refundOutstanding: shipment.status === 'cancelled' && shipment.paymentStatus === 'paid',
  };
};

export const staffRoutes: readonly MobileRoute[] = [
  {
    method: 'GET',
    path: 'staff/summary',
    access: STAFF,
    handle: async () => {
      const [summary, backlog, pendingRemittances] = await Promise.all([
        getOperationsSummary(),
        getBatchDispatchBacklog(),
        countPendingRemittances(),
      ]);
      return ok({ ...summary, bulkBacklog: backlog, pendingRemittances });
    },
  },
  {
    // The staff Shipments list's search (search_staff_shipments):
    // ?q=&status=&from=&to=&type=individual|merchant|bulk&batch=&page=
    method: 'GET',
    path: 'staff/shipments',
    access: STAFF,
    handle: async (ctx) => {
      const filters = parseShipmentFilters(
        { q: param(ctx, 'q'), status: param(ctx, 'status'), from: param(ctx, 'from'), to: param(ctx, 'to') },
        STATUS_FILTERS,
      );
      const batch = param(ctx, 'batch');
      return ok(
        await searchStaffShipments(page(ctx), filters, {
          category: parseShipmentCategory(param(ctx, 'type')),
          batchId: batch && isUuid(batch) ? batch : null,
        }),
      );
    },
  },
  {
    // The dispatch queue: confirmed and not yet assigned, oldest first.
    method: 'GET',
    path: 'staff/dispatch',
    access: STAFF,
    handle: async () => ok(await listUnassignedShipments()),
  },
  {
    method: 'GET',
    path: 'staff/shipments/:id',
    access: STAFF,
    handle: async ({ params }) => {
      if (!isUuid(params.id)) return fail(404, 'operator.errors.shipmentNotFound');
      const detail = await shipmentDetail(params.id);
      return detail ? ok(detail) : fail(404, 'operator.errors.shipmentNotFound');
    },
  },
  {
    // Drivers to choose from, nearest the pickup first (the website's
    // assign / reassign panel). The pickup comes from the shipment itself.
    method: 'GET',
    path: 'staff/shipments/:id/drivers',
    access: STAFF,
    handle: async ({ params }) => {
      if (!isUuid(params.id)) return fail(404, 'operator.errors.shipmentNotFound');
      const detail = await getShipmentDetail(params.id);
      if (!detail) return fail(404, 'operator.errors.shipmentNotFound');
      return ok(await getAvailableDriversAction(detail.shipment.pickup.coordinates));
    },
  },
  {
    method: 'POST',
    path: 'staff/shipments/:id/assign',
    access: STAFF,
    handle: async (ctx) => fromAction(await assignDriverAction(ctx.params.id, text(body(ctx).driverId))),
  },
  {
    method: 'POST',
    path: 'staff/shipments/:id/reassign',
    access: STAFF,
    handle: async (ctx) => {
      const input = body(ctx);
      const expected = input.expectedDriverId === null ? null : text(input.expectedDriverId);
      return fromAction(await reassignDriverAction(ctx.params.id, text(input.driverId), expected));
    },
  },
  {
    method: 'POST',
    path: 'staff/shipments/:id/mark-returned',
    access: STAFF,
    handle: async (ctx) => fromAction(await markReturnedAction({ shipmentId: ctx.params.id, reason: text(body(ctx).reason) })),
  },
  {
    method: 'POST',
    path: 'staff/shipments/:id/correct-status',
    access: STAFF,
    handle: async (ctx) => {
      const input = body(ctx);
      return fromAction(
        await correctShipmentStatusAction({
          shipmentId: ctx.params.id,
          expectedStatus: text(input.expectedStatus),
          newStatus: text(input.newStatus),
          reason: text(input.reason),
        } as never),
      );
    },
  },
  {
    // Only the service charge travels; the database works out the total.
    method: 'POST',
    path: 'staff/shipments/:id/price',
    access: STAFF,
    handle: async (ctx) => {
      const input = body(ctx);
      return fromAction(
        await adjustShipmentPriceAction({
          shipmentId: ctx.params.id,
          expectedStatus: text(input.expectedStatus),
          expectedPrice: Number(input.expectedPrice),
          serviceCharge: text(input.serviceCharge),
          reason: text(input.reason),
          requestId: text(input.requestId),
        } as never),
      );
    },
  },
  {
    method: 'POST',
    path: 'staff/shipments/:id/cancel',
    access: STAFF,
    handle: async (ctx) => {
      const input = body(ctx);
      return fromAction(
        await staffCancelShipmentAction({
          shipmentId: ctx.params.id,
          expectedStatus: text(input.expectedStatus),
          reason: text(input.reason),
          requestId: text(input.requestId),
        } as never),
      );
    },
  },
  {
    method: 'GET',
    path: 'staff/drivers',
    access: STAFF,
    handle: async () => ok(await listAllDrivers()),
  },
  {
    // Latest known positions (drivers share them only while a delivery is
    // open). The app shows them as a list with "open in Maps".
    method: 'GET',
    path: 'staff/drivers/locations',
    access: STAFF,
    handle: async () => {
      const [drivers, snapshot] = await Promise.all([listDriversForLiveMap(), getDriverLocationsSnapshot()]);
      return ok({ drivers, locations: snapshot.locations });
    },
  },
  {
    // Driver cash (migration 0042): balances worked out in the database.
    method: 'GET',
    path: 'staff/cash',
    access: STAFF,
    handle: async (ctx) => {
      const filters = parseCashFilters({ q: param(ctx, 'q'), from: param(ctx, 'from'), to: param(ctx, 'to') });
      const [list, totals] = await Promise.all([listDriverCash(page(ctx), filters), getDriverCashTotals(filters)]);
      return ok({ ...list, totals });
    },
  },
  {
    method: 'GET',
    path: 'staff/cash/:driverId',
    access: STAFF,
    handle: async (ctx) => {
      const { driverId } = ctx.params;
      if (!isUuid(driverId)) return fail(404, 'errors.db.driverNotFound');
      const filters = parseDriverLedgerFilters({
        from: param(ctx, 'from'),
        to: param(ctx, 'to'),
        collection: param(ctx, 'collection'),
        remittance: param(ctx, 'remittance'),
      });
      const [driver, position, collections, remittances] = await Promise.all([
        getDriverIdentity(driverId),
        getDriverCashPosition(driverId, filters),
        listDriverCollections(driverId, filters, parsePage(param(ctx, 'collectionsPage'))),
        listDriverRemittances(driverId, filters, parsePage(param(ctx, 'remittancesPage'))),
      ]);
      if (!driver) return fail(404, 'errors.db.driverNotFound');
      return ok({ driver, position, collections, remittances });
    },
  },
  {
    // Idempotent: clientRequestId makes a retried submission return the
    // first remittance instead of recording it twice.
    method: 'POST',
    path: 'staff/cash/:driverId/remittances',
    access: STAFF,
    handle: async (ctx) => {
      const input = body(ctx);
      return fromAction(
        await recordRemittanceAction({
          driverId: ctx.params.driverId,
          amount: Number(input.amount),
          method: text(input.method),
          receivedOn: text(input.receivedOn),
          reference: text(input.reference) || undefined,
          notes: text(input.notes) || undefined,
          clientRequestId: text(input.clientRequestId),
        } as never),
      );
    },
  },
  {
    method: 'POST',
    path: 'staff/remittances/:id/decide',
    access: MANAGER,
    handle: async (ctx) => {
      const input = body(ctx);
      return fromAction(
        await decideRemittanceAction({
          remittanceId: ctx.params.id,
          decision: text(input.decision),
          note: text(input.note) || undefined,
        } as never),
      );
    },
  },
  {
    method: 'GET',
    path: 'staff/cod',
    access: STAFF,
    handle: async (ctx) => {
      const [list, totals] = await Promise.all([listCodTransactionsPage(page(ctx)), getCodTotals()]);
      return ok({ ...list, totals });
    },
  },
  {
    method: 'POST',
    path: 'staff/cod/:id/reconcile',
    access: STAFF,
    handle: async ({ params }) => fromAction(await reconcileCodAction(params.id)),
  },
  {
    method: 'POST',
    path: 'staff/cod/:id/remit',
    access: STAFF,
    handle: async ({ params }) => fromAction(await remitCodAction(params.id)),
  },
  {
    method: 'GET',
    path: 'staff/bulk',
    access: STAFF,
    handle: async (ctx) => ok(await listBatches(page(ctx))),
  },
  {
    method: 'GET',
    path: 'staff/bulk/:id',
    access: STAFF,
    handle: async (ctx) => {
      if (!isUuid(ctx.params.id)) return fail(404, 'errors.db.bulkShipmentNotFound');
      const detail = await getBatchDetail(ctx.params.id, page(ctx));
      return detail ? ok(detail) : fail(404, 'errors.db.bulkShipmentNotFound');
    },
  },
  {
    method: 'GET',
    path: 'staff/customers',
    access: STAFF,
    handle: async (ctx) => ok(await listCustomers(page(ctx), (param(ctx, 'q') ?? '').trim().slice(0, 100) || null)),
  },
];
