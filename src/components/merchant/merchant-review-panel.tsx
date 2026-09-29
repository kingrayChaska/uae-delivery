'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CircleCheck, MessageSquareWarning, XCircle } from 'lucide-react';

import Button from '@/components/ui/button';
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
} from '@/components/ui/dialog';
import { reviewMerchantApplicationAction } from '@/lib/merchant/actions';

import type { MerchantReviewInput } from '@/lib/merchant/schemas';
import type { MerchantStatus } from '@/lib/types';

type Decision = MerchantReviewInput['decision'];

const COPY: Record<Decision, { title: string; description: string; confirm: string; notePlaceholder: string; noteRequired: boolean }> = {
  approved: {
    title: 'Approve this merchant?',
    description: 'They get merchant pricing and tools immediately, and are notified by email and in the app.',
    confirm: 'Approve merchant',
    notePlaceholder: 'Optional welcome note',
    noteRequired: false,
  },
  requires_changes: {
    title: 'Request changes?',
    description: 'The applicant is asked to update their application and resubmit it.',
    confirm: 'Send back for changes',
    notePlaceholder: 'What needs to change, e.g. “Upload a valid trade licence”',
    noteRequired: true,
  },
  rejected: {
    title: 'Reject this application?',
    description: 'The applicant keeps their individual account and can resubmit later.',
    confirm: 'Reject application',
    notePlaceholder: 'Reason for the applicant',
    noteRequired: true,
  },
};

const MerchantReviewPanel = ({ applicationId, status }: { applicationId: string; status: MerchantStatus }) => {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const open = (next: Decision) => {
    setDecision(next);
    setNote('');
    setError(null);
  };

  const submit = async () => {
    if (!decision) return;
    setIsPending(true);
    setError(null);
    const result = await reviewMerchantApplicationAction({ applicationId, decision, note });
    setIsPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSuccess(
      decision === 'approved' ? 'Merchant approved and notified.' : decision === 'rejected' ? 'Application rejected. The applicant was notified.' : 'Changes requested. The applicant was notified.',
    );
    setDecision(null);
    router.refresh();
  };

  const copy = decision ? COPY[decision] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status !== 'approved' ? (
          <Button type="button" variant="success" onClick={() => open('approved')}>
            <BadgeCheck aria-hidden />
            Approve
          </Button>
        ) : null}
        {status !== 'requires_changes' ? (
          <Button type="button" variant="outline" onClick={() => open('requires_changes')}>
            <MessageSquareWarning aria-hidden />
            Request changes
          </Button>
        ) : null}
        {status !== 'rejected' ? (
          <Button
            type="button"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => open('rejected')}
          >
            <XCircle aria-hidden />
            {status === 'approved' ? 'Revoke merchant access' : 'Reject'}
          </Button>
        ) : null}
      </div>
      {success ? (
        <p role="status" className="flex items-center gap-2 text-sm text-success animate-in fade-in-0 motion-reduce:animate-none">
          <CircleCheck className="size-4" aria-hidden />
          {success}
        </p>
      ) : null}

      <Dialog open={decision !== null} onOpenChange={(next) => (!next && !isPending ? setDecision(null) : null)}>
        <DialogContent>
          {copy ? (
            <>
              <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>{copy.description}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="review-note">
                  Message to the applicant{copy.noteRequired ? '' : ' (optional)'}
                </Label>
                <textarea
                  id="review-note"
                  rows={4}
                  value={note}
                  maxLength={1000}
                  placeholder={copy.notePlaceholder}
                  onChange={(event) => setNote(event.target.value)}
                  aria-required={copy.noteRequired || undefined}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
                />
                <FieldError message={error ?? undefined} />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isPending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant={decision === 'approved' ? 'success' : decision === 'rejected' ? 'destructive' : 'default'}
                  loading={isPending}
                  disabled={copy.noteRequired && note.trim().length < 5}
                  onClick={submit}
                >
                  {copy.confirm}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MerchantReviewPanel;
