'use client';

import { useState } from 'react';
import { ArrowRight, Banknote, CreditCard, PackagePlus, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Badge from '@/components/ui/badge';
import PriceBreakdownList from '@/components/pricing/price-breakdown-list';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MAX_SHIPMENTS_PER_BOOKING } from '@/lib/shipment/schemas';
import { useFormat } from '@/i18n/hooks';

import type { ReactNode } from 'react';
import type { ShipmentDraft } from '@/lib/hooks/use-booking-wizard';
import type { PaymentMethod } from '@/lib/types';

const PAYMENT_METHOD_ICONS: Record<PaymentMethod, typeof CreditCard> = { card: CreditCard, cod: Banknote };

const sr = (chunks: ReactNode) => <span className="sr-only">{chunks}</span>;

type ReviewStepProps = {
  drafts: ShipmentDraft[];
  lastAddedKey: string | null;
  canAddMore: boolean;
  total: number;
  collectTotal: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onEdit: (key: string) => void;
  onRemove: (key: string) => void;
  onAddAnother: () => void;
};

const ReviewStep = ({
  drafts,
  lastAddedKey,
  canAddMore,
  total,
  collectTotal,
  paymentMethod,
  onPaymentMethodChange,
  onEdit,
  onRemove,
  onAddAnother,
}: ReviewStepProps) => {
  const t = useTranslations('booking.review');
  const tShipments = useTranslations('shipments');
  const format = useFormat();
  const [confirmRemove, setConfirmRemove] = useState<ShipmentDraft | null>(null);
  const currency = drafts[0]?.price.currency ?? 'AED';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t('count', { count: drafts.length })}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onAddAnother} disabled={!canAddMore}>
          <PackagePlus aria-hidden />
          {t('addAnother')}
        </Button>
      </div>
      {!canAddMore ? (
        <p className="text-sm text-muted-foreground">{t('maxShipments', { max: MAX_SHIPMENTS_PER_BOOKING })}</p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {drafts.map((draft, index) => {
          const { values, price } = draft;
          const number = index + 1;
          return (
            <li
              key={draft.key}
              className={`rounded-2xl border bg-card p-4 shadow-sm sm:p-5 ${
                draft.key === lastAddedKey ? 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none' : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('shipment', { number })}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 font-medium">
                    <span className="wrap-break-word">{values.pickup.address}</span>
                    <ArrowRight className="size-4 shrink-0 text-primary rtl:rotate-180" aria-label={t('to')} />
                    <span className="wrap-break-word">{values.dropoff.address}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('recipient', { name: values.dropoff.contactName, phone: values.dropoff.contactPhone })}
                    {values.dropoff.building || values.dropoff.unit
                      ? ` · ${[values.dropoff.building, values.dropoff.unit].filter(Boolean).join(', ')}`
                      : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{tShipments(`deliveryType.${values.deliveryType}.label`)}</Badge>
                    <Badge variant="outline">{format.km(price.distanceKm)}</Badge>
                    <Badge variant="outline">
                      {format.number(values.packageQuantity)} × {values.packageDescription}
                    </Badge>
                    {values.packageWeightKg ? <Badge variant="outline">{format.kg(values.packageWeightKg)}</Badge> : null}
                    {values.isFragile ? <Badge variant="warning">{tShipments('fragile')}</Badge> : null}
                    {values.recipientPaymentType === 'postpaid' ? (
                      <Badge variant="default">{t('collect', { amount: format.money(values.codAmount ?? 0, currency) })}</Badge>
                    ) : (
                      <Badge variant="success">{tShipments('recipientPaymentShort.prepaid')}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(draft.key)}>
                    <Pencil aria-hidden />
                    {t.rich('edit', { number, sr })}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmRemove(draft)}
                  >
                    <Trash2 aria-hidden />
                    {t.rich('remove', { number, sr })}
                  </Button>
                </div>
              </div>

              <PriceBreakdownList
                className="mt-4 rounded-xl bg-muted/50 p-3"
                currency={price.currency}
                total={price.totalPrice}
                basePrice={price.basePrice}
                distanceCharge={price.distanceCharge}
                weightCharge={price.weightCharge}
                codCharge={price.codCharge}
                additionalDistanceKm={price.additionalDistanceKm}
                additionalWeightKg={price.additionalWeightKg}
              />
            </li>
          );
        })}
      </ol>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t('paymentTitle')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PAYMENT_METHOD_ICONS) as PaymentMethod[]).map((method) => {
            const Icon = PAYMENT_METHOD_ICONS[method];
            const selected = paymentMethod === method;
            return (
              <label
                key={method}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring ${
                  selected ? 'border-primary bg-secondary/60' : 'border-input hover:border-primary/40'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method}
                  checked={selected}
                  onChange={() => onPaymentMethodChange(method)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className="size-4 text-primary" aria-hidden />
                    {t(`payment.${method}.label`)}
                  </span>
                  <span className="block text-sm text-muted-foreground">{t(`payment.${method}.description`)}</span>
                </span>
              </label>
            );
          })}
        </div>
        {paymentMethod === 'card' ? <p className="text-sm text-muted-foreground">{t('cardNotLive')}</p> : null}
      </fieldset>

      <div className="rounded-2xl border-2 border-primary/20 bg-secondary/40 p-4 sm:p-5">
        <dl className="flex flex-col gap-2 font-brand-mono text-sm">
          {drafts.map((draft, index) => (
            <div key={draft.key} className="flex justify-between gap-4 text-muted-foreground">
              <dt className="font-sans">{t('shipment', { number: index + 1 })}</dt>
              <dd>{format.money(draft.price.totalPrice, draft.price.currency)}</dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-4 border-t pt-3 text-lg font-semibold text-foreground">
            <dt className="font-sans">{t('totalFees')}</dt>
            <dd aria-live="polite">{format.money(total, currency)}</dd>
          </div>
          {collectTotal > 0 ? (
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt className="font-sans">{t('cashToCollect')}</dt>
              <dd>{format.money(collectTotal, currency)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <Dialog open={confirmRemove !== null} onOpenChange={(open) => (open ? null : setConfirmRemove(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('removeTitle')}</DialogTitle>
            <DialogDescription>
              {confirmRemove
                ? t('removeDescription', { pickup: confirmRemove.values.pickup.address, dropoff: confirmRemove.values.dropoff.address })
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('keepIt')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirmRemove) onRemove(confirmRemove.key);
                setConfirmRemove(null);
              }}
            >
              <Trash2 aria-hidden />
              {t('removeShipment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReviewStep;
