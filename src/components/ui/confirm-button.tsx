'use client';

import { useState } from 'react';

import Button from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import type { ComponentProps, ReactNode } from 'react';

type ConfirmButtonProps = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  // Resolves true when the action succeeded, which closes the dialog.
  onConfirm: () => Promise<boolean> | boolean;
  isPending?: boolean;
  error?: string | null;
  confirmVariant?: ComponentProps<typeof Button>['variant'];
  children: ReactNode;
} & Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>;

// A button that asks first. Used for anything that's hard to undo —
// cancelling a delivery, activating a pricing rule, reviewing a merchant.
const ConfirmButton = ({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Go back',
  onConfirm,
  isPending = false,
  error = null,
  confirmVariant = 'default',
  children,
  ...buttonProps
}: ConfirmButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(next) => (isPending ? null : setOpen(next))}>
      <DialogTrigger asChild>
        <Button type="button" {...buttonProps}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={confirmVariant}
            loading={isPending}
            onClick={async () => {
              if (await onConfirm()) setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmButton;
