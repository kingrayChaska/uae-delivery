'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Select from '@/components/ui/select';
import { updateTicketStatusAction } from '@/lib/support/actions';

import type { UpdateTicketStatusInput } from '@/lib/support/actions';

const STATUSES: UpdateTicketStatusInput['status'][] = ['open', 'in_progress', 'resolved', 'closed'];

const TicketStatusSelect = ({ ticketId, status }: { ticketId: string; status: string }) => {
  const t = useTranslations('support');
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [isPending, setIsPending] = useState(false);

  const handleChange = async (next: UpdateTicketStatusInput['status']) => {
    setValue(next);
    setIsPending(true);
    const result = await updateTicketStatusAction({ ticketId, status: next });
    setIsPending(false);
    if (result.success) router.refresh();
    else setValue(status);
  };

  return (
    <Select
      value={value}
      disabled={isPending}
      onChange={(event) => handleChange(event.target.value as UpdateTicketStatusInput['status'])}
      className="w-40"
      aria-label={t('statusLabel')}
    >
      {STATUSES.map((option) => (
        <option key={option} value={option}>
          {t(`status.${option}`)}
        </option>
      ))}
    </Select>
  );
};

export default TicketStatusSelect;
