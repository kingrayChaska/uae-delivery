'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

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
            aria-label={`Delete ${fullName}'s account`}
          >
            <Trash2 aria-hidden />
            Delete
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden />
            Delete {role} account
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {fullName}’s account?</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              <p>This permanently removes their sign-in, contact details{role === 'driver' ? ', vehicle link and location history' : ''}. It can’t be undone.</p>
              <p>
                Past {role === 'driver' ? 'deliveries, proof of delivery and COD records' : 'actions in the activity log'} are kept and
                still show their name.
              </p>
              {role === 'driver' ? (
                <p>A driver with deliveries in progress or unreconciled cash can’t be deleted until those are dealt with.</p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-name">
            Type <span className="font-semibold">{fullName}</span> to confirm
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
              Keep account
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={!matches} loading={isDeleting} loadingText="Deleting…" onClick={remove}>
            <Trash2 aria-hidden />
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteStaffAccount;
