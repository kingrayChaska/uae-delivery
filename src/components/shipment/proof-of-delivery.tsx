'use client';

import { BadgeCheck, Camera, Clock, FileCheck2, KeyRound, MapPin, PenLine, QrCode, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useFormat } from '@/i18n/hooks';

import type { ProofOfDelivery } from '@/services/shipments/get-proof-of-delivery';
import type { ShipmentStatus } from '@/lib/types';

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
  const t = useTranslations('shipments.pod');
  const format = useFormat();
  if (status !== 'delivered') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileCheck2 className="size-4" aria-hidden />
        {t('notYet')}
      </p>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="default">
          <FileCheck2 aria-hidden />
          {t('view')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="size-5 text-success" aria-hidden />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('shipment', { code: trackingCode })}</DialogDescription>
        </DialogHeader>

        {proof ? (
          <div className="flex flex-col gap-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="flex gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">{t('delivered')}</dt>
                  <dd className="font-medium">
                    <time dateTime={proof.deliveredAt}>{format.dateTimeLong(proof.deliveredAt)}</time>
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <UserRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <dt className="text-muted-foreground">{t('receivedBy')}</dt>
                  <dd className="font-medium">{proof.recipientName || '—'}</dd>
                </div>
              </div>
              {proof.location ? (
                <div className="flex gap-3 sm:col-span-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <div>
                    <dt className="text-muted-foreground">{t('location')}</dt>
                    <dd className="font-medium">{proof.location.address}</dd>
                    <dd dir="ltr" className="font-brand-mono text-xs text-muted-foreground rtl:text-right">
                      {proof.location.coordinates.lat.toFixed(5)}, {proof.location.coordinates.lng.toFixed(5)}
                    </dd>
                  </div>
                </div>
              ) : null}
            </dl>

            <div>
              <p className="mb-2 text-sm font-medium">{t('confirmation')}</p>
              <ul className="flex flex-wrap gap-2 text-sm">
                {proof.otpVerified ? (
                  <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                    <KeyRound className="size-3.5" aria-hidden /> {t('otp')}
                  </li>
                ) : null}
                {proof.qrVerified ? (
                  <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                    <QrCode className="size-3.5" aria-hidden /> {t('qr')}
                  </li>
                ) : null}
                {proof.photoUrl ? (
                  <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                    <Camera className="size-3.5" aria-hidden /> {t('photo')}
                  </li>
                ) : null}
                {proof.signatureUrl ? (
                  <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-success">
                    <PenLine className="size-3.5" aria-hidden /> {t('signature')}
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
                      alt={t('photoAlt', { code: trackingCode })}
                      className="aspect-[4/3] w-full rounded-xl border object-cover"
                    />
                    <figcaption className="text-xs text-muted-foreground">{t('photoCaption')}</figcaption>
                  </figure>
                ) : null}
                {proof.signatureUrl ? (
                  <figure className="flex flex-col gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Supabase Storage URL */}
                    <img
                      src={proof.signatureUrl}
                      alt={proof.recipientName ? t('signatureAltNamed', { name: proof.recipientName }) : t('signatureAlt')}
                      className="aspect-[4/3] w-full rounded-xl border bg-white object-contain p-2"
                    />
                    <figcaption className="text-xs text-muted-foreground">{t('signatureCaption')}</figcaption>
                  </figure>
                ) : null}
              </div>
            ) : null}

            {proof.notes ? (
              <div className="rounded-xl bg-muted/50 p-3 text-sm">
                <p className="text-xs text-muted-foreground">{t('notes')}</p>
                <p>{proof.notes}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
            {t('missing')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProofOfDeliveryButton;
