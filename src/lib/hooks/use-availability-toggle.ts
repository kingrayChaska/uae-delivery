'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { updateAvailabilityAction } from '@/lib/driver/actions';

type Availability = 'available' | 'busy' | 'offline';

export const useAvailabilityToggle = (initial: Availability) => {
  const router = useRouter();
  const [availability, setAvailability] = useState(initial);
  const [isUpdating, setIsUpdating] = useState(false);

  const update = async (next: Availability) => {
    setIsUpdating(true);
    const result = await updateAvailabilityAction(next);
    setIsUpdating(false);

    if (result.success) {
      setAvailability(next);
      router.refresh();
    }
  };

  return { availability, update, isUpdating };
};
