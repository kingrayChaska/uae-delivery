'use client';

import { useState } from 'react';
import { ArrowRight, Banknote, CreditCard, PackagePlus, Pencil, Trash2 } from 'lucide-react';

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
import { DELIVERY_TYPE_COPY } from '@/lib/pricing/config';
import { MAX_SHIPMENTS_PER_BOOKING } from '@/lib/shipment/schemas';

import type { ShipmentDraft } from '@/lib/hooks/use-booking-wizard';
import type { PaymentMethod } from '@/lib/types';

const PAYMENT_METHOD_COPY: Record<PaymentMethod, { label: string; description: string; icon: typeof CreditCard }> = {
  card: { label: 'Card', description: 'Pay the delivery fee now by card.', icon: CreditCard },
  cod: { label: 'Cash', description: 'Pay the delivery fee in cash to the driver.', icon: Banknote },
};

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
  const [confirmRemove, setConfirmRemove] = useState<ShipmentDraft | null>(null);
  const currency = drafts[0]?.price.currency ?? 'AED';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Review your booking</h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {drafts.length} {drafts.length === 1 ? 'shipment' : 'shipments'} in this booking
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onAddAnother} disabled={!canAddMore}>
          <PackagePlus aria-hidden />
          Add another shipment
        </Button>
      </div>
      {!canAddMore ? (
        <p className="text-sm text-muted-foreground">A booking can hold up to {MAX_SHIPMENTS_PER_BOOKING} shipments.</p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {drafts.map((draft, index) => {
          const { values, price } = draft;
          return (
            <li
              key={draft.key}
              className={`rounded-2xl border bg-card p-4 shadow-sm sm:p-5 ${
                draft.key === lastAddedKey ? 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none' : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shipment {index + 1}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 font-medium">
                    <span className="break-words">{values.pickup.address}</span>
                    <ArrowRight className="size-4 shrink-0 text-primary" aria-label="to" />
                    <span className="break-words">{values.dropoff.address}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    To {values.dropoff.contactName} · {values.dropoff.contactPhone}
                    {values.dropoff.building || values.dropoff.unit
                      ? ` · ${[values.dropoff.building, values.dropoff.unit && `Unit ${values.dropoff.unit}`].filter(Boolean).join(', ')}`
                      : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{DELIVERY_TYPE_COPY[values.deliveryType].label}</Badge>
                    <Badge variant="outline">{price.distanceKm.toFixed(1)} km</Badge>
                    <Badge variant="outline">
                      {values.packageQuantity} × {values.packageDescription}
                    </Badge>
                    {values.packageWeightKg ? <Badge variant="outline">{values.packageWeightKg} kg</Badge> : null}
                    {values.isFragile ? <Badge variant="warning">Fragile</Badge> : null}
                    {values.recipientPaymentType === 'postpaid' ? (
                      <Badge variant="default">
                        Collect {currency} {(values.codAmount ?? 0).toFixed(2)}
                      </Badge>
                    ) : (
                      <Badge variant="success">Prepaid</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(draft.key)}>
                    <Pencil aria-hidden />
                    Edit<span className="sr-only"> shipment {index + 1}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmRemove(draft)}
                  >
                    <Trash2 aria-hidden />
                    Remove<span className="sr-only"> shipment {index + 1}</span>
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
        <legend className="mb-1 text-lg font-semibold">How will you pay the delivery fee?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PAYMENT_METHOD_COPY) as PaymentMethod[]).map((method) => {
            const { label, description, icon: Icon } = PAYMENT_METHOD_COPY[method];
            const selected = paymentMethod === method;
            return (
              <label
                key={method}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
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
                    {label}
                  </span>
                  <span className="block text-sm text-muted-foreground">{description}</span>
                </span>
              </label>
            );
          })}
        </div>
        {paymentMethod === 'card' ? (
          <p className="text-sm text-muted-foreground">
            Card payments aren&apos;t live yet — your booking is saved as pending payment until a payment provider is connected.
          </p>
        ) : null}
      </fieldset>

      <div className="rounded-2xl border-2 border-primary/20 bg-secondary/40 p-4 sm:p-5">
        <dl className="flex flex-col gap-2 font-brand-mono text-sm">
          {drafts.map((draft, index) => (
            <div key={draft.key} className="flex justify-between gap-4 text-muted-foreground">
              <dt>Shipment {index + 1}</dt>
              <dd>
                {draft.price.currency} {draft.price.totalPrice.toFixed(2)}
              </dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-4 border-t pt-3 text-lg font-semibold text-foreground">
            <dt>Total delivery fees</dt>
            <dd aria-live="polite">
              {currency} {total.toFixed(2)}
            </dd>
          </div>
          {collectTotal > 0 ? (
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Cash to collect from recipients</dt>
              <dd>
                {currency} {collectTotal.toFixed(2)}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <Dialog open={confirmRemove !== null} onOpenChange={(open) => (open ? null : setConfirmRemove(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this shipment?</DialogTitle>
            <DialogDescription>
              {confirmRemove
                ? `${confirmRemove.values.pickup.address} → ${confirmRemove.values.dropoff.address} will be taken out of this booking.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Keep it
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
              Remove shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReviewStep;
