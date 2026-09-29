'use client';

import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import FieldError from '@/components/ui/field-error';
import { useReplyForm } from '@/lib/hooks/use-reply-form';

const ReplyForm = ({ ticketId }: { ticketId: string }) => {
  const t = useTranslations('support.reply');
  const { register, errors, isSubmitting, serverError, onSubmit } = useReplyForm(ticketId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <textarea
        rows={3}
        placeholder={t('placeholder')}
        aria-label={t('label')}
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        {...register('message')}
      />
      <FieldError message={errors.message?.message} />
      {serverError ? <FieldError message={serverError} /> : null}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
};

export default ReplyForm;
