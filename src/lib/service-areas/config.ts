// Where ParcelLink delivers — the single source of truth for the emirate
// rules. The booking wizard uses it for instant feedback; the server
// (lib/service-areas/verify.ts, called by quoteShipment) enforces it for
// every booking, whoever makes it and however it's submitted.
//
// To open or close an emirate, move it between these two lists.

import { msg, ref } from '@/i18n/message';

export const EMIRATES = [
  // code: ISO 3166-2:AE, which Mapbox returns as region_code / region_code_full.
  // aliases: spellings Mapbox (and people) use for the emirate's name.
  // key: its translated name, serviceAreas.emirates.<key>.
  { name: 'Dubai', key: 'dubai', code: 'DU', aliases: ['dubai', 'dubayy'] },
  { name: 'Sharjah', key: 'sharjah', code: 'SH', aliases: ['sharjah', 'sharja', 'ash shariqah', 'al shariqah', 'al sharjah'] },
  { name: 'Ajman', key: 'ajman', code: 'AJ', aliases: ['ajman', 'ujman'] },
  { name: 'Abu Dhabi', key: 'abuDhabi', code: 'AZ', aliases: ['abu dhabi', 'abu zabi', 'abu zaby', 'abudhabi'] },
  {
    name: 'Ras Al Khaimah',
    key: 'rasAlKhaimah',
    code: 'RK',
    aliases: ['ras al khaimah', 'ras al khaima', 'ras al khaymah', 'ras alkhaimah', 'rak'],
  },
  { name: 'Fujairah', key: 'fujairah', code: 'FU', aliases: ['fujairah', 'al fujairah', 'fujeirah', 'al fujayrah'] },
  {
    name: 'Umm Al Quwain',
    key: 'ummAlQuwain',
    code: 'UQ',
    aliases: ['umm al quwain', 'umm al qaiwain', 'umm al qiwain', 'umm al quwayn', 'uaq'],
  },
] as const;

export type Emirate = (typeof EMIRATES)[number]['name'];

export const SERVICE_AREAS = {
  // Booked, priced, paid, assigned and tracked as normal.
  fullySupported: ['Dubai', 'Sharjah', 'Ajman'],
  // Can be chosen on the map, but not booked online: the customer is asked
  // to contact ParcelLink instead.
  requestOnly: ['Abu Dhabi', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'],
} as const satisfies Record<string, readonly Emirate[]>;

export type ServiceArea =
  | { status: 'supported'; emirate: Emirate }
  | { status: 'request_only'; emirate: Emirate }
  // Not confidently inside any emirate — never assumed to be supported.
  | { status: 'unknown'; emirate: null };

export const UNKNOWN_SERVICE_AREA: ServiceArea = { status: 'unknown', emirate: null };

// The parts of a Mapbox place that say which emirate it's in.
export type EmiratePlace = {
  regionCode?: string | null;
  region?: string | null;
  country?: string | null;
};

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-‐‑'’`.]/g, ' ')
    .replace(/^emirate of\s+/, '')
    .replace(/\s+emirate$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const isUae = (country: string | null | undefined) =>
  !country || ['united arab emirates', 'uae', 'ae'].includes(normalize(country));

// Which emirate a place is in, from the region Mapbox reported for it:
// its ISO code first ("AE-DU" / "DU"), then its name. Only the region is
// trusted — a city or neighbourhood name ("Dubai Marina", "Al Ain") isn't
// enough to be sure, and an unsure answer must never become "supported".
export const identifyEmirate = (place: EmiratePlace | null | undefined): Emirate | null => {
  if (!place || !isUae(place.country)) return null;

  const code = place.regionCode?.trim().toUpperCase();
  if (code) {
    const match = code.match(/^(?:AE-)?([A-Z]{2})$/);
    const byCode = match ? EMIRATES.find((emirate) => emirate.code === match[1]) : undefined;
    // A code from another country (e.g. "OM-MU") means it isn't in the UAE.
    if (byCode) return byCode.name;
    if (code.includes('-') && !code.startsWith('AE-')) return null;
  }

  if (!place.region) return null;
  const name = normalize(place.region);
  return EMIRATES.find((emirate) => (emirate.aliases as readonly string[]).includes(name))?.name ?? null;
};

export const serviceAreaFor = (emirate: Emirate | null): ServiceArea => {
  if (!emirate) return UNKNOWN_SERVICE_AREA;
  if ((SERVICE_AREAS.fullySupported as readonly Emirate[]).includes(emirate)) return { status: 'supported', emirate };
  if ((SERVICE_AREAS.requestOnly as readonly Emirate[]).includes(emirate)) return { status: 'request_only', emirate };
  return UNKNOWN_SERVICE_AREA;
};

export const classifyServiceArea = (place: EmiratePlace | null | undefined): ServiceArea =>
  serviceAreaFor(identifyEmirate(place));

// ── Customer-facing wording ─────────────────────────────────────────────────
// Everything below is a translatable message (i18n/message.ts), shown in the
// reader's language wherever it ends up: the booking form, a refused
// booking, a failed CSV row.

export type EmirateKey = (typeof EMIRATES)[number]['key'];

export const emirateKey = (emirate: Emirate): EmirateKey => EMIRATES.find((entry) => entry.name === emirate)!.key;

// ref() to an emirate's translated name.
export const emirateRef = (emirate: Emirate) => ref(`serviceAreas.emirates.${emirateKey(emirate)}`);

// "Dubai, Sharjah and Ajman", as a list value for msg() (joined in the
// reader's language).
export const SUPPORTED_EMIRATES = SERVICE_AREAS.fullySupported.map(emirateRef);

export type LocationEnd = 'pickup' | 'dropoff';

export type ServiceAreaNotice = {
  title: string;
  // One paragraph each.
  body: string[];
};

// What to show when a location can't be booked normally, or null when it can.
export const serviceAreaNotice = (area: ServiceArea, end: LocationEnd): ServiceAreaNotice | null => {
  if (area.status === 'supported') return null;
  if (area.status === 'request_only') {
    return {
      title: msg(end === 'pickup' ? 'serviceAreas.notice.pickupOnRequest' : 'serviceAreas.notice.deliveryOnRequest'),
      body: [
        msg('serviceAreas.notice.supported', { supported: SUPPORTED_EMIRATES }),
        msg(end === 'pickup' ? 'serviceAreas.notice.pickupBody' : 'serviceAreas.notice.deliveryBody', {
          emirate: emirateRef(area.emirate),
        }),
      ],
    };
  }
  return {
    title: msg('serviceAreas.notice.unavailable'),
    body: [msg('serviceAreas.notice.unavailableBody'), msg('serviceAreas.notice.unavailableAction')],
  };
};

// The same notice as one sentence-run, for places that show a single error
// string (a refused booking, a failed CSV row).
export const serviceAreaError = (area: ServiceArea, end: LocationEnd): string | null => {
  if (area.status === 'supported') return null;
  if (area.status === 'request_only') {
    return msg(end === 'pickup' ? 'serviceAreas.errors.pickupOnRequest' : 'serviceAreas.errors.deliveryOnRequest', {
      emirate: emirateRef(area.emirate),
      supported: SUPPORTED_EMIRATES,
    });
  }
  return msg(end === 'pickup' ? 'serviceAreas.errors.pickupUnavailable' : 'serviceAreas.errors.deliveryUnavailable');
};

// Pre-fills a support request for a request-only delivery: a subject and
// the message's lines, each a translatable message.
export const serviceAreaRequest = (
  area: ServiceArea,
  addresses: { pickup?: string; dropoff?: string },
): { subject: string; lines: string[] } => {
  const route = [
    addresses.pickup ? msg('serviceAreas.request.from', { address: addresses.pickup }) : null,
    addresses.dropoff ? msg('serviceAreas.request.to', { address: addresses.dropoff }) : null,
  ].filter((line): line is string => line !== null);
  if (area.status === 'request_only') {
    const emirate = emirateRef(area.emirate);
    return {
      subject: msg('serviceAreas.request.subject', { emirate }),
      lines: [msg('serviceAreas.request.body', { emirate }), ...route],
    };
  }
  return {
    subject: msg('serviceAreas.request.subjectUnknown'),
    lines: [msg('serviceAreas.request.bodyUnknown'), ...route],
  };
};
