'use client';

import { useEffect, useRef, useState } from 'react';

import { searchAddressAction } from '@/lib/maps/actions';

import type { GeocodeResult } from '@/lib/maps/types';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

export const useAddressAutocomplete = (onSelect: (result: GeocodeResult) => void) => {
  const [query, setQueryState] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const requestId = useRef(0);

  const isQueryLongEnough = query.trim().length >= MIN_QUERY_LENGTH;

  // The debounced search itself is the one thing this effect does. Whether
  // we're "loading" is decided in the setQuery handler below (a normal
  // event handler, not this effect) — the effect only ever setState from
  // inside the async callback, once the fetch actually resolves.
  useEffect(() => {
    if (!isQueryLongEnough) return;

    const currentRequestId = ++requestId.current;

    const timeout = setTimeout(async () => {
      const result = await searchAddressAction({ query });
      // Ignore stale responses from an earlier keystroke that resolved late.
      if (currentRequestId !== requestId.current) return;

      setIsLoading(false);
      setSuggestions(result.success ? result.results : []);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, isQueryLongEnough]);

  const select = (result: GeocodeResult) => {
    setQueryState(result.formattedAddress);
    setSuggestions([]);
    setIsOpen(false);
    onSelect(result);
  };

  const visibleSuggestions = isQueryLongEnough ? suggestions : [];

  return {
    query,
    setQuery: (value: string) => {
      setQueryState(value);
      setIsOpen(true);
      setIsLoading(value.trim().length >= MIN_QUERY_LENGTH);
    },
    suggestions: visibleSuggestions,
    isLoading: isQueryLongEnough && isLoading,
    isOpen: isOpen && visibleSuggestions.length > 0,
    select,
    close: () => setIsOpen(false),
  };
};
