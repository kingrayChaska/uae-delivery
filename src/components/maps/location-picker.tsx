'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  Building2,
  CircleAlert,
  CircleCheck,
  House,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MapPinned,
  Search,
  Signpost,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import LazyMapLocationSelector from '@/components/maps/lazy-map-location-selector';
import { useLocationSearch } from '@/lib/hooks/use-location-search';
import { reverseGeocodeAction } from '@/lib/maps/actions';
import { SEARCH_MIN_CHARS, UAE_DEFAULT_CENTER } from '@/lib/maps/config';
import { isInsideUae, toLocationValue } from '@/lib/maps/location';
import { useAddressParts } from '@/lib/maps/use-address-parts';
import { useMessage } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import type { LocationValue } from '@/lib/maps/location';
import type { LocationSource, LocationSuggestion, ResolvedLocation } from '@/lib/maps/types';
import type { Coordinates } from '@/lib/types';

type LocationPickerProps = {
  id: string;
  label: string;
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  // The other end of the trip, to bias search results nearby.
  proximity?: Coordinates;
  error?: string;
  // Lets the page hide its own map while this one is open (one map at a time).
  onPinModeChange?: (active: boolean) => void;
};

type PinState = {
  coordinates: Coordinates;
  source: Exclude<LocationSource, 'search'>;
  zoom: number;
  // False until the pin has been placed somewhere deliberate — a fresh
  // "drop a pin" starts at a generic map centre that isn't anyone's address.
  placed: boolean;
  lookup: 'idle' | 'loading' | 'done' | 'failed';
  resolved: ResolvedLocation | null;
};

const TYPE_ICONS: Record<string, typeof MapPin> = {
  poi: Building2,
  address: House,
  street: Signpost,
};

const LocationPicker = ({ id, label, value, onChange, proximity, error, onPinModeChange }: LocationPickerProps) => {
  const t = useTranslations('maps');
  const tCommon = useTranslations('common');
  const translate = useMessage();
  const splitAddress = useAddressParts();
  const search = useLocationSearch(proximity);
  const [mode, setMode] = useState<'search' | 'pin' | 'selected'>(value ? 'selected' : 'search');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pin, setPin] = useState<PinState | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'error'>('idle');
  const lookupId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // If the step is left while a pin is open, let the page show its map again.
  const onPinModeChangeRef = useRef(onPinModeChange);
  useEffect(() => {
    onPinModeChangeRef.current = onPinModeChange;
  }, [onPinModeChange]);
  useEffect(() => () => onPinModeChangeRef.current?.(false), []);

  const enterMode = (next: 'search' | 'pin' | 'selected') => {
    setMode(next);
    onPinModeChange?.(next === 'pin');
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const showDropdown = open && search.query.trim().length >= SEARCH_MIN_CHARS;
  const options = search.status === 'results' ? search.suggestions : [];
  // The last two keyboard stops are always "Use my current location" and
  // "Drop a pin", so there's a way forward whatever the search returns.
  const optionCount = options.length + 2;

  const choose = async (suggestion: LocationSuggestion) => {
    const resolved = await search.resolve(suggestion);
    if (!resolved) return;
    onChange(toLocationValue(resolved.coordinates, 'search', resolved));
    setOpen(false);
    search.reset();
    enterMode('selected');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % optionCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? optionCount - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      if (activeIndex < options.length) choose(options[activeIndex]);
      else if (activeIndex === options.length) locateMe();
      else startPin();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  // ── Pin ───────────────────────────────────────────────────────────────────
  const lookUp = async (coordinates: Coordinates) => {
    const current = ++lookupId.current;
    setPin((state) => (state ? { ...state, coordinates, placed: true, lookup: 'loading' } : state));
    if (!isInsideUae(coordinates)) {
      setPin((state) => (state ? { ...state, lookup: 'done', resolved: null } : state));
      return;
    }
    // Failure (or a thrown action) keeps the coordinates; only the address
    // text is missing, and the customer adds details by hand.
    const result = await reverseGeocodeAction(coordinates).catch(() => ({ success: false as const, error: 'lookup failed' }));
    if (current !== lookupId.current) return; // the pin has moved again
    setPin((state) =>
      state
        ? { ...state, lookup: result.success ? 'done' : 'failed', resolved: result.success ? result.location : null }
        : state,
    );
  };

  function startPin() {
    setOpen(false);
    const start = value
      ? { lat: value.lat, lng: value.lng }
      : (proximity ?? { lat: UAE_DEFAULT_CENTER[1], lng: UAE_DEFAULT_CENTER[0] });
    setPin({ coordinates: start, source: 'pin', zoom: value || proximity ? 15 : 11, placed: Boolean(value), lookup: 'idle', resolved: null });
    enterMode('pin');
    if (value) lookUp(start);
  }

  // Permission is only asked for when the customer taps the button.
  const locateMe = () => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('error');
      return;
    }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoStatus('idle');
        const coordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPin({ coordinates, source: 'current_location', zoom: 17, placed: true, lookup: 'idle', resolved: null });
        enterMode('pin');
        lookUp(coordinates);
      },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const confirmPin = () => {
    if (!pin) return;
    // Even if the address lookup failed, the coordinates are kept and used.
    onChange(toLocationValue(pin.coordinates, pin.source, pin.resolved));
    setPin(null);
    search.reset();
    enterMode('selected');
  };

  const cancelPin = () => {
    lookupId.current++;
    setPin(null);
    enterMode(value ? 'selected' : 'search');
  };

  // ── Selected ──────────────────────────────────────────────────────────────
  if (mode === 'selected' && value) {
    const { title, subtitle } = splitAddress(value.address);
    const pinned = value.place.source !== 'search';
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-start gap-3 rounded-xl border-2 border-primary/30 bg-secondary/40 p-4 animate-in fade-in-0 zoom-in-[0.98] duration-200 motion-reduce:animate-none">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium">{title}</p>
            {subtitle ? <p className="break-words text-sm text-muted-foreground">{subtitle}</p> : null}
            {pinned ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/20">
                <MapPinned className="size-3.5" aria-hidden />
                {value.place.source === 'current_location' ? t('currentSelected') : t('pinSelected')}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              enterMode('search');
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            {t.rich('change', { label, sr: (chunks) => <span className="sr-only">{chunks}</span> })}
          </Button>
        </div>
      </div>
    );
  }

  // ── Pin mode ──────────────────────────────────────────────────────────────
  if (mode === 'pin' && pin) {
    const outside = pin.placed && !isInsideUae(pin.coordinates);
    const { title, subtitle } = pin.resolved ? splitAddress(pin.resolved.formattedAddress) : { title: '', subtitle: '' };
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
          <LazyMapLocationSelector
            initial={pin.coordinates}
            initialZoom={pin.zoom}
            onMove={lookUp}
            className="h-[min(55svh,420px)] w-full"
          />
          <div className="flex flex-col gap-3 p-4" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('pin.selectedLocation')}</p>
            {!pin.placed ? (
              <p className="text-sm">{t('pin.instructions')}</p>
            ) : outside ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t('pin.outsideUae')}
              </p>
            ) : pin.lookup === 'loading' ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                {t('pin.finding')}
              </p>
            ) : pin.lookup === 'failed' || (pin.lookup === 'done' && !pin.resolved) ? (
              <div className="text-sm">
                <p className="font-medium">{t('pin.saved')}</p>
                <p className="text-muted-foreground">{t('pin.savedHint')}</p>
              </div>
            ) : pin.resolved ? (
              <div>
                <p className="break-words font-medium">{title}</p>
                {subtitle ? <p className="break-words text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>
            ) : null}
            {pin.placed ? (
              <p dir="ltr" className="font-brand-mono text-[0.6875rem] text-muted-foreground rtl:text-right">
                {pin.coordinates.lat.toFixed(5)}, {pin.coordinates.lng.toFixed(5)}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={cancelPin}>
                {tCommon('actions.cancel')}
              </Button>
              <Button type="button" onClick={confirmPin} disabled={!pin.placed || outside || pin.lookup === 'loading'}>
                <CircleCheck aria-hidden />
                {t('pin.confirm')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Search mode ───────────────────────────────────────────────────────────
  const highlighted = showDropdown ? activeIndex : -1;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-search`}>{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          id={`${id}-search`}
          value={search.query}
          placeholder={t('search.placeholder')}
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-activedescendant={highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-12 ps-9 pe-10 sm:h-11"
          onChange={(event) => {
            search.setQuery(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={(event) => {
            setOpen(true);
            // Keep the field above the on-screen keyboard on phones.
            if (window.matchMedia('(pointer: coarse)').matches) {
              const field = event.currentTarget;
              setTimeout(() => field.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
            }
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {search.query ? (
          <button
            type="button"
            aria-label={t('search.clear')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              search.reset();
              inputRef.current?.focus();
            }}
            className="absolute end-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}

        {showDropdown ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none">
            <ul id={listId} role="listbox" aria-label={t('search.suggestions', { label })} className="max-h-[min(20rem,45svh)] overflow-y-auto overscroll-contain p-1">
              {search.status === 'loading'
                ? [0, 1, 2].map((row) => (
                    <li key={row} aria-hidden className="flex items-center gap-3 px-3 py-3">
                      <span className="size-8 shrink-0 animate-pulse rounded-lg bg-muted" />
                      <span className="flex flex-1 flex-col gap-1.5">
                        <span className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                        <span className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                      </span>
                    </li>
                  ))
                : null}
              {options.map((suggestion, index) => {
                const Icon = TYPE_ICONS[suggestion.featureType] ?? MapPin;
                const resolving = search.resolvingId === suggestion.id;
                return (
                  <li key={suggestion.id} id={`${listId}-${index}`} role="option" aria-selected={index === highlighted}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(suggestion)}
                      disabled={search.resolvingId !== null}
                      className={cn(
                        'flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-accent disabled:opacity-60',
                        index === highlighted && 'bg-accent',
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                        {resolving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate text-start font-medium">{suggestion.name}</span>
                        <span dir="auto" className="block truncate text-start text-sm text-muted-foreground">{suggestion.secondary}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {search.status === 'empty' ? (
              <p className="border-t px-4 py-3 text-sm">
                <span className="font-medium">{t('search.noMatch')}</span>{' '}
                <span className="text-muted-foreground">{t('search.noMatchHint')}</span>
              </p>
            ) : null}
            {search.status === 'error' || search.error ? (
              <p role="alert" className="border-t px-4 py-3 text-sm text-destructive">
                {translate(search.error)}
              </p>
            ) : null}
            <button
              type="button"
              id={`${listId}-${options.length}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false);
                locateMe();
              }}
              className={cn(
                'flex min-h-12 w-full items-center gap-3 border-t px-4 py-2.5 text-start font-medium transition-colors hover:bg-accent',
                highlighted === options.length && 'bg-accent',
              )}
            >
              <LocateFixed className="size-5 shrink-0 text-primary" aria-hidden />
              {t('currentLocation')}
            </button>
            <button
              type="button"
              id={`${listId}-${options.length + 1}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={startPin}
              className={cn(
                'flex min-h-14 w-full items-center gap-3 border-t px-4 py-3 text-start transition-colors hover:bg-accent',
                highlighted === options.length + 1 && 'bg-accent',
              )}
            >
              <MapPinned className="size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm text-muted-foreground">{t('cantFind')}</span>
                <span className="block font-medium text-primary">{t('dropPin')}</span>
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={locateMe} loading={geoStatus === 'locating'} loadingText={t('locating')}>
          <LocateFixed aria-hidden />
          {t('currentLocation')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={startPin}>
          <MapPin aria-hidden />
          {t('dropPin')}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => enterMode('selected')}>
            {t('keepCurrent')}
          </Button>
        ) : null}
      </div>
      {geoStatus === 'error' ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {t('geolocationError')}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
};

export default LocationPicker;
