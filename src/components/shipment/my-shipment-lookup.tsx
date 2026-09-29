'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import { findMyShipmentByCodeAction } from '@/lib/shipment/actions';

// Finds one of the signed-in customer's own shipments by tracking ID and
// opens its tracking page. Case and spaces don't matter.
const MyShipmentLookup = () => {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!code.trim()) {
      setError('Enter a tracking ID');
      return;
    }
    setIsSearching(true);
    const result = await findMyShipmentByCodeAction({ trackingNumber: code });
    if (!result.success) {
      setIsSearching(false);
      setError(result.error);
      return;
    }
    router.push(`/dashboard/customer/deliveries/${result.shipmentId}`);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2" role="search">
      <Label htmlFor="tracking-id">Tracking ID</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="tracking-id"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="e.g. PL7K29X4"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'tracking-id-error' : undefined}
          className="font-brand-mono tracking-widest sm:max-w-xs"
        />
        <Button type="submit" loading={isSearching} loadingText="Searching…">
          <Search aria-hidden />
          Track
        </Button>
      </div>
      <FieldError id="tracking-id-error" message={error ?? undefined} />
    </form>
  );
};

export default MyShipmentLookup;
