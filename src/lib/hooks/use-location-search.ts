'use client';

import { useEffect, useRef, useState } from 'react';

import { useAppLocale } from '@/i18n/hooks';
import { retrieveLocationAction, searchLocationsAction } from '@/lib/maps/actions';
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS, SEARCH_UNAVAILABLE_MESSAGE } from '@/lib/maps/config';

import type { LocationSuggestion, MapsLanguage, ResolvedLocation } from '@/lib/maps/types';
import type { Coordinates } from '@/lib/types';

export type SearchStatus = 'idle' | 'loading' | 'results' | 'empty' | 'error';

// Shared by every search box on the page: typing "Dubai Marina" again (or in
// the delivery field after the pickup field) doesn't repeat the request.
const CACHE_LIMIT = 60;
const cache = new Map<string, LocationSuggestion[]>();
const cacheKey = (query: string, language: MapsLanguage, proximity?: Coordinates) =>
  `${language}|${query.trim().toLowerCase()}|${proximity ? `${proximity.lat.toFixed(2)},${proximity.lng.toFixed(2)}` : ''}`;
const remember = (key: string, suggestions: LocationSuggestion[]) => {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, suggestions);
};

// Debounced location search: waits for a pause in typing, ignores responses
// that arrive after a newer keystroke, and resolves the chosen suggestion to
// coordinates. One Google Places session per search (typing → choosing),
// in the page's language (results in Arabic or English; the query is sent
// exactly as typed).
export const useLocationSearch = (proximity?: Coordinates) => {
  const language = useAppLocale();
  const [query, setQueryState] = useState('');
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const requestId = useRef(0);
  const sessionToken = useRef<string | null>(null);
  const session = () => (sessionToken.current ??= crypto.randomUUID());

  const trimmed = query.trim();
  const key = cacheKey(trimmed, language, proximity);
  const shouldFetch = status === 'loading' && trimmed.length >= SEARCH_MIN_CHARS && !cache.has(key);

  useEffect(() => {
    if (!shouldFetch) return;
    const current = ++requestId.current;
    const timeout = setTimeout(async () => {
      // A thrown action (network drop, expired session) is treated like an
      // unavailable search, so "Drop a pin" is always the way forward.
      const result = await searchLocationsAction({ query: trimmed, sessionToken: session(), proximity, language }).catch(() => ({
        success: false as const,
        error: SEARCH_UNAVAILABLE_MESSAGE,
      }));
      if (current !== requestId.current) return; // a newer keystroke won
      if (!result.success) {
        setSuggestions([]);
        setError(result.error);
        setStatus('error');
        return;
      }
      remember(key, result.suggestions);
      setSuggestions(result.suggestions);
      setStatus(result.suggestions.length ? 'results' : 'empty');
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // proximity and language are part of `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetch, key]);

  const setQuery = (value: string) => {
    setQueryState(value);
    setError(null);
    const next = value.trim();
    if (next.length < SEARCH_MIN_CHARS) {
      requestId.current++;
      setSuggestions([]);
      setStatus('idle');
      return;
    }
    const cached = cache.get(cacheKey(next, language, proximity));
    if (cached) {
      requestId.current++;
      setSuggestions(cached);
      setStatus(cached.length ? 'results' : 'empty');
    } else {
      setStatus('loading');
    }
  };

  // Autocomplete predictions need Place Details for their coordinates (which
  // also ends the billing session); Text Search results already have them.
  const resolve = async (suggestion: LocationSuggestion): Promise<ResolvedLocation | null> => {
    if (suggestion.resolved) {
      sessionToken.current = null;
      return suggestion.resolved;
    }
    setResolvingId(suggestion.id);
    setError(null);
    const result = await retrieveLocationAction({ id: suggestion.id, sessionToken: session(), language }).catch(() => ({
      success: false as const,
      error: 'maps.search.loadFailed',
    }));
    setResolvingId(null);
    // The session ends with Place Details; the next search starts a new one.
    sessionToken.current = null;
    if (!result.success) {
      setError(result.error);
      return null;
    }
    return result.location;
  };

  const reset = () => {
    requestId.current++;
    setQueryState('');
    setSuggestions([]);
    setStatus('idle');
    setError(null);
  };

  return { query, setQuery, suggestions, status, error, resolve, resolvingId, reset };
};
