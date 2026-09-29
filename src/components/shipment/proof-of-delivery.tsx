'use client';

import { BadgeCheck, Camera, Clock, FileCheck2, KeyRound, MapPin, PenLine, QrCode, UserRound } from 'lucide-react';

import Button from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import type { ProofOfDelivery } from '@/services/shipments/get-proof-of-delivery';
import type { ShipmentStatus } from '@/lib/types';

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('en-AE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Dubai' }).format(new Date(value));

type ProofOfDeliveryButtonProps = {
  proof: ProofOfDelivery | null;
  status: ShipmentStatus;
  trackingCode: string;
};

// "View Proof of Delivery" for a delivered shipment. Only what the driver
// actually captured is shown; a delivered shipment with no proof on record
// (e.g. marked delivered before proof capture existed) gets a clear note
// rather than an empty panel.
const ProofOfDeliveryButton = ({ proof, status, trackingCode }: ProofOfDeliveryButtonProps) => {
  if (status !== 'delivered') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileCheck2 className="size-4" aria-hidden />
        Proof of delivery will be available here once your parcel is delivered.
      </p>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="default">
          <FileCheck2 aria-hidden />
          View Proof of Delivery
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="size-5 text-success" aria-hidden />
            Proof of Delivery
          </DialogTitle>
          <DialogDescription>Shipment {trackingCode}</DialogDescription>
        </DialogHeader>

        {proof ? (
          <div className="flex flex-col gap-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="flex gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Delivered</dt>
                  <dd className="font-medium">
                    <time dateTime={proof.deliveredAt}>{formatTime(proof.deliveredAt)}</time>
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <UserRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">Received by</dt>
                  <dd className="font-medium">{proof.recipientName || '—'}</dd>
                </div>
              </div>
              {proof.location ? (
                <div className="flex gap-3 sm:col-span-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <div>
                    <dt className="text-muted-foreground">Delivery location</dt>
                    <dd className="font-medium">{proof.location.address}</dd>
                    <dd className="font-brand-mono text-xs text-muted-foreground">
                      {proof.location.coordinates.lat.toFixed(5)}, {proof.location.coordinates.lng.toFixed(5)}
                    </dd>
                  </div>
                </div>
              ) : null}
            </dl>

            <div>
              <p className="mb-2 text-sm font-medium">Delivery confirmation</p>
              <ul className="flex flex-wrap gap-2 text-sm">
                {proof.otpVerified ? (
                  <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                    <KeyRound className="size-3.5" aria-hidden /> Recipient code verified
                  </li>
                ) : null}
                {proof.qrVerified ? (
                  <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                    <QrCode className="size-3.5" aria-hidden /> Label QR scanned
                  </li>
                ) : null}
                {proof.photoUrl ? (
                  <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                    <Camera className="size-3.5" aria-hidden /> Photo taken
                  </li>
                ) : null}
                {proof.signatureUrl ? (
                  <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                    <PenLine className="size-3.5" aria-hidden /> Signed for
                  </li>
                ) : null}
              </ul>
            </div>

            {proof.photoUrl || proof.signatureUrl ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {proof.photoUrl ? (
                  <figure className="flex flex-col gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Supabase Storage URL */}
                    <img
                      src={proof.photoUrl}
                      alt={`Photo taken by the driver at delivery of shipment ${trackingCode}`}
                      className="aspect-[4/3] w-full rounded-xl border object-cover"
                    />
                    <figcaption className="text-xs text-muted-foreground">Delivery photo</figcaption>
                  </figure>
                ) : null}
                {proof.signatureUrl ? (
                  <figure className="flex flex-col gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Supabase Storage URL */}
                    <img
                      src={proof.signatureUrl}
                      alt={`Recipient signature${proof.recipientName ? ` of ${proof.recipientName}` : ''}`}
                      className="aspect-[4/3] w-full rounded-xl border bg-white object-contain p-2"
                    />
                    <figcaption className="text-xs text-muted-foreground">Recipient signature</figcaption>
                  </figure>
                ) : null}
              </div>
            ) : null}

            {proof.notes ? (
              <div className="rounded-xl bg-muted/50 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Driver’s note</p>
                <p>{proof.notes}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
            This shipment is marked delivered, but no proof of delivery was recorded for it. If anything looks wrong, contact
            support and we’ll look into it.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProofOfDeliveryButton;
