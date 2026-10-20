import 'server-only';

import {
  acceptShipmentAction,
  advanceShipmentStatusAction,
  cancelShipmentAsDriverAction,
  declineShipmentAction,
  markCodCollectedAction,
  recordDriverLocationAction,
  reportDeliveryFailedAction,
  requestDeliveryOtpAction,
  returnShipmentAction,
  submitProofOfDeliveryAction,
  updateAvailabilityAction,
} from '@/lib/driver/actions';
import { verifyShipmentQrAction } from '@/lib/driver/verify-qr-action';
import { toDriverShipment } from '@/lib/mobile-api/projections';
import { DRIVER, fail, fromAction, ok } from '@/lib/mobile-api/router';
import { parsePage } from '@/lib/pagination';
import { DRIVER_STATUS_FILTERS, parseShipmentFilters } from '@/lib/shipment/filters';
import { isUuid } from '@/lib/security/validate';
import { getDriverProfileDetail } from '@/services/drivers/get-driver-profile';
import { getShipmentDetail } from '@/services/shipments/get-shipment';
import { listDriverCodTransactions } from '@/services/shipments/list-driver-cod';
import {
  getDriverDashboardSummary,
  listDriverActiveShipments,
  listDriverHistory,
  searchDriverShipments,
} from '@/services/shipments/list-driver-shipments';

import type { MobileRoute, RouteContext } from '@/lib/mobile-api/router';
import type { ShipmentStatus } from '@/lib/types';

// The driver dashboard. Every read is the website's own service, run as the
// driver: RLS only returns shipments assigned to them. Every write is the
// website's own server action, which checks the role again, and the
// database (assignment, status transitions, proof rules) checks the rest.

const body = (ctx: RouteContext) => (ctx.body && typeof ctx.body === 'object' ? (ctx.body as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === 'string' ? value : '');

// The statuses a driver moves a shipment to by tapping "next" — everything
// else (delivered, failed, cancelled, returned) has its own route and rules.
const ADVANCE_STATUSES: readonly Exclude<ShipmentStatus, 'delivered'>[] = [
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
];

const driverId = (ctx: RouteContext) => ctx.profile!.id;

export const driverRoutes: readonly MobileRoute[] = [
  {
    method: 'GET',
    path: 'driver/summary',
    access: DRIVER,
    handle: async (ctx) => {
      const summary = await getDriverDashboardSummary(driverId(ctx));
      return ok({ ...summary, recent: summary.recent.map(toDriverShipment) });
    },
  },
  {
    method: 'GET',
    path: 'driver/shipments/active',
    access: DRIVER,
    handle: async (ctx) => ok((await listDriverActiveShipments(driverId(ctx))).map(toDriverShipment)),
  },
  {
    method: 'GET',
    path: 'driver/shipments/history',
    access: DRIVER,
    handle: async (ctx) => {
      const page = await listDriverHistory(driverId(ctx), parsePage(ctx.query.get('page') ?? undefined));
      return ok({ ...page, items: page.items.map(toDriverShipment) });
    },
  },
  {
    // The website's driver search (?q=&status=&from=&to=&page=), matched in
    // the database over this driver's own shipments only.
    method: 'GET',
    path: 'driver/shipments/search',
    access: DRIVER,
    handle: async ({ query }) => {
      const filters = {
        ...parseShipmentFilters(
          {
            q: query.get('q') ?? undefined,
            status: query.get('status') ?? undefined,
            from: query.get('from') ?? undefined,
            to: query.get('to') ?? undefined,
          },
          DRIVER_STATUS_FILTERS,
        ),
        scope: 'mine' as const,
      };
      const page = await searchDriverShipments(parsePage(query.get('page') ?? undefined), filters);
      return ok({ ...page, items: page.items.map(toDriverShipment) });
    },
  },
  {
    method: 'GET',
    path: 'driver/shipments/:id',
    access: DRIVER,
    handle: async ({ params }) => {
      if (!isUuid(params.id)) return fail(404, 'driver.errors.shipmentNotFound');
      // Null for a shipment that isn't assigned to this driver — the same
      // answer as for one that doesn't exist.
      const detail = await getShipmentDetail(params.id);
      if (!detail) return fail(404, 'driver.errors.shipmentNotFound');
      return ok({ shipment: toDriverShipment(detail.shipment), packageImageUrl: detail.packageImageUrl });
    },
  },
  {
    method: 'POST',
    path: 'driver/shipments/:id/accept',
    access: DRIVER,
    handle: async ({ params }) => fromAction(await acceptShipmentAction(params.id)),
  },
  {
    method: 'POST',
    path: 'driver/shipments/:id/decline',
    access: DRIVER,
    handle: async ({ params }) => fromAction(await declineShipmentAction(params.id)),
  },
  {
    method: 'POST',
    path: 'driver/shipments/:id/advance',
    access: DRIVER,
    handle: async (ctx) => {
      const status = text(body(ctx).status) as Exclude<ShipmentStatus, 'delivered'>;
      if (!ADVANCE_STATUSES.includes(status)) return fail(422, 'driver.errors.statusUpdate');
      return fromAction(await advanceShipmentStatusAction(ctx.params.id, status));
    },
  },
  {
    method: 'POST',
    path: 'driver/shipments/:id/fail',
    access: DRIVER,
    handle: async (ctx) =>
      fromAction(await reportDeliveryFailedAction({ shipmentId: ctx.params.id, reason: text(body(ctx).reason) })),
  },
  {
    method: 'POST',
    path: 'driver/shipments/:id/cancel',
    access: DRIVER,
    handle: async (ctx) =>
      fromAction(
        await cancelShipmentAsDriverAction({
          shipmentId: ctx.params.id,
          reason: text(body(ctx).reason),
          photoPath: text(body(ctx).photoPath),
        }),
      ),
  },
  {
    method: 'POST',
    path: 'driver/shipments/:id/return',
    access: DRIVER,
    handle: async (ctx) =>
      fromAction(
        await returnShipmentAction({
          shipmentId: ctx.params.id,
          reason: text(body(ctx).reason),
          photoPath: text(body(ctx).photoPath),
        }),
      ),
  },
  {
    method: 'POST',
    path: 'driver/shipments/:id/otp',
    access: DRIVER,
    handle: async ({ params }) => fromAction(await requestDeliveryOtpAction(params.id)),
  },
  {
    method: 'POST',
    path: 'driver/shipments/:id/verify-qr',
    access: DRIVER,
    handle: async (ctx) => {
      if (!isUuid(ctx.params.id)) return fail(404, 'driver.errors.notFound');
      const token = text(body(ctx).token).slice(0, 512);
      return ok({ match: token ? await verifyShipmentQrAction(ctx.params.id, token) : false });
    },
  },
  {
    // Proof of delivery. complete_delivery() is the only path to
    // 'delivered' and checks the photo really is in this shipment's folder,
    // the code or QR, and the COD confirmation — whatever the app sends.
    method: 'POST',
    path: 'driver/shipments/:id/complete',
    access: DRIVER,
    handle: async (ctx) => {
      const input = body(ctx);
      if (!isUuid(ctx.params.id)) return fail(404, 'driver.errors.shipmentNotFound');
      // Whether there's COD to confirm comes from the shipment itself, as on
      // the website, not from what the app claims.
      const detail = await getShipmentDetail(ctx.params.id);
      if (!detail) return fail(404, 'driver.errors.shipmentNotFound');
      const collectsCod = toDriverShipment(detail.shipment).collection.fromRecipient > 0;
      return fromAction(
        await submitProofOfDeliveryAction({
          shipmentId: ctx.params.id,
          photoPath: text(input.photoPath) || null,
          signaturePath: text(input.signaturePath) || null,
          otpCode: text(input.otpCode) || null,
          qrToken: text(input.qrToken) || null,
          notes: text(input.notes),
          collectsCod,
          codCollected: input.codCollected === true,
        }),
      );
    },
  },
  {
    method: 'GET',
    path: 'driver/cod',
    access: DRIVER,
    handle: async (ctx) => ok(await listDriverCodTransactions(driverId(ctx), parsePage(ctx.query.get('page') ?? undefined))),
  },
  {
    method: 'POST',
    path: 'driver/cod/:id/collected',
    access: DRIVER,
    handle: async ({ params }) => fromAction(await markCodCollectedAction(params.id)),
  },
  {
    // A position ping while a delivery is open (the app, like the website,
    // never tracks in the background).
    method: 'POST',
    path: 'driver/location',
    access: DRIVER,
    handle: async (ctx) => {
      const input = body(ctx);
      const result = await recordDriverLocationAction(text(input.shipmentId), Number(input.lat), Number(input.lng));
      return result.success ? ok(result) : fail(422, 'errors.invalidInput');
    },
  },
  {
    method: 'GET',
    path: 'driver/profile',
    access: DRIVER,
    handle: async (ctx) => ok(await getDriverProfileDetail(driverId(ctx))),
  },
  {
    method: 'POST',
    path: 'driver/availability',
    access: DRIVER,
    handle: async (ctx) =>
      fromAction(await updateAvailabilityAction(text(body(ctx).availability) as 'available' | 'busy' | 'offline')),
  },
];
