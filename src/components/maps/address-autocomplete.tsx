'use client';

import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import { useAddressAutocomplete } from '@/lib/hooks/use-address-autocomplete';

import type { GeocodeResult } from '@/lib/maps/types';

type AddressAutocompleteProps = {
  id: string;
  label: string;
  placeholder?: string;
  onSelect: (result: GeocodeResult) => void;
};

const AddressAutocomplete = ({ id, label, placeholder, onSelect }: AddressAutocompleteProps) => {
  const { query, setQuery, suggestions, isLoading, isOpen, select, close } =
    useAddressAutocomplete(onSelect);

  return (
    <div className="relative flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        onBlur={() => close()}
      />

      {isOpen ? (
        <ul className="absolute top-full z-10 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.coordinates.lat}-${suggestion.coordinates.lng}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(suggestion)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                {suggestion.formattedAddress}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {isLoading ? <p className="text-xs text-muted-foreground">Searching…</p> : null}
    </div>
  );
};

export default AddressAutocomplete;
