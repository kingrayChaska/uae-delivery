'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
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
import { deleteStaffAction } from '@/lib/staff/actions';

type DeleteStaffAccountProps = {
  profileId: string;
  fullName: string;
  role: 'operator' | 'driver';
  // Small button for a table row. On a list page the row simply disappears
  // after deleting; on the detail page we go back to the list.
  compact?: boolean;
};

// Deleting can't be undone, so the manager types the person's name to
// confirm — a plain "Are you sure?" is too easy to click through.
const DeleteStaffAccount = ({ profileId, fullName, role, compact = false }: DeleteStaffAccountProps) => {
  const t = useTranslations('manager.staff.delete');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const matches = typed.trim().toLowerCase() === fullName.trim().toLowerCase();

  const remove = async () => {
    setIsDeleting(true);
    setError(null);
    const result = await deleteStaffAction(profileId);
    if (!result.success) {
      setIsDeleting(false);
      setError(result.error);
      return;
    }
    setOpen(false);
    setIsDeleting(false);
    router.push(`/dashboard/manager/${role === 'driver' ? 'drivers' : 'operators'}?deleted=1`);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isDeleting) return;
        setOpen(next);
        setTyped('');
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        {compact ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={t('compactLabel', { name: fullName })}
          >
            <Trash2 aria-hidden />
            {t('button')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden />
            {role === 'driver' ? t('buttonDriver') : t('buttonOperator')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { name: fullName })}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              <p>{role === 'driver' ? t('removesDriver') : t('removesOperator')}</p>
              <p>{role === 'driver' ? t('keptDriver') : t('keptOperator')}</p>
              {role === 'driver' ? <p>{t('driverBlocked')}</p> : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-name">
            {t.rich('confirm', { name: fullName, strong: (chunks) => <span className="font-semibold">{chunks}</span> })}
          </Label>
          <Input
            id="confirm-name"
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby={error ? 'delete-error' : undefined}
          />
          <FieldError id="delete-error" message={error ?? undefined} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isDeleting}>
              {t('keep')}
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={!matches} loading={isDeleting} loadingText={t('deleting')} onClick={remove}>
            <Trash2 aria-hidden />
            {t('deletePermanently')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteStaffAccount;
