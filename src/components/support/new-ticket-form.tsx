'use client';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import { useNewTicketForm } from '@/lib/hooks/use-new-ticket-form';

type NewTicketFormProps = {
  defaultSubject?: string;
  defaultMessage?: string;
};

const NewTicketForm = ({ defaultSubject = '', defaultMessage = '' }: NewTicketFormProps) => {
  const { register, errors, isSubmitting, serverError, onSubmit } = useNewTicketForm({ subject: defaultSubject, message: defaultMessage });

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" {...register('subject')} />
        <FieldError message={errors.subject?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          rows={5}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          {...register('message')}
        />
        <FieldError message={errors.message?.message} />
      </div>

      {serverError ? <FieldError message={serverError} /> : null}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Opening…' : 'Open Ticket'}
      </Button>
    </form>
  );
};

export default NewTicketForm;
