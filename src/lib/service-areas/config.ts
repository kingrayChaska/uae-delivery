// Where ParcelLink delivers — the single source of truth for service
// coverage. The emirate is the boundary: every valid address in an active
// emirate is covered, whatever its neighbourhood, building or street. There
// is deliberately no list of neighbourhoods anywhere.
//
// Both ends of every trip go through classifyServiceArea: the booking
// wizard for instant feedback, and the server (lib/service-areas/verify.ts,
// called by quoteShipment) for every booking, whoever makes it.
//
// To open or close an emirate, change its entry in EMIRATE_COVERAGE.

import { msg, ref } from '@/i18n/message';

// ── Emirates ────────────────────────────────────────────────────────────────
// code: ISO 3166-2:AE, kept on older (Mapbox-era) bookings' places.
// aliases: how Google (in English or Arabic) and people spell the emirate —
//   matched against the place's emirate (administrative_area_level_1) or,
//   when Google gives none, its city (locality): the cities of Dubai,
//   Sharjah, Ajman... lie inside the emirates of the same name.
// towns: other towns wholly inside the emirate (exclaves and inland towns),
//   trusted only when Google also says the place is in the UAE.
// key: its translated name, serviceAreas.emirates.<key>.
export const EMIRATES = [
  { name: 'Dubai', key: 'dubai', code: 'DU', aliases: ['dubai', 'dubayy', 'دبي'], towns: ['hatta', 'حتا'] },
  {
    name: 'Sharjah',
    key: 'sharjah',
    code: 'SH',
    aliases: ['sharjah', 'sharja', 'ash shariqah', 'al shariqah', 'al sharjah', 'الشارقة'],
    towns: ['khor fakkan', 'khorfakkan', 'خورفكان', 'kalba', 'كلباء', 'dibba al hisn', 'دبا الحصن', 'al dhaid', 'dhaid', 'الذيد', 'mleiha', 'مليحة'],
  },
  { name: 'Ajman', key: 'ajman', code: 'AJ', aliases: ['ajman', 'ujman', 'عجمان'], towns: ['masfout', 'مصفوت', 'manama', 'المنامة'] },
  {
    name: 'Abu Dhabi',
    key: 'abuDhabi',
    code: 'AZ',
    aliases: ['abu dhabi', 'abu zabi', 'abu zaby', 'abudhabi', 'أبو ظبي', 'أبوظبي'],
    towns: ['al ain', 'العين', 'ruwais', 'al ruwais', 'الرويس', 'madinat zayed', 'مدينة زايد'],
  },
  {
    name: 'Ras Al Khaimah',
    key: 'rasAlKhaimah',
    code: 'RK',
    aliases: ['ras al khaimah', 'ras al khaima', 'ras al khaymah', 'ras alkhaimah', 'rak', 'رأس الخيمة'],
    towns: [],
  },
  {
    name: 'Fujairah',
    key: 'fujairah',
    code: 'FU',
    aliases: ['fujairah', 'al fujairah', 'fujeirah', 'al fujayrah', 'الفجيرة'],
    towns: ['dibba al fujairah', 'دبا الفجيرة'],
  },
  {
    name: 'Umm Al Quwain',
    key: 'ummAlQuwain',
    code: 'UQ',
    aliases: ['umm al quwain', 'umm al qaiwain', 'umm al qiwain', 'umm al quwayn', 'uaq', 'أم القيوين'],
    towns: ['falaj al mualla', 'فلج المعلا'],
  },
] as const;

export type Emirate = (typeof EMIRATES)[number]['name'];

// ── Coverage ────────────────────────────────────────────────────────────────

export type CoverageStatus = 'active' | 'contact_support';

export const EMIRATE_COVERAGE = {
  // Same-day delivery: booked, priced, paid, assigned and tracked as normal.
  Dubai: 'active',
  Sharjah: 'active',
  Ajman: 'active',
  // Can be chosen on the map, but not booked online: the customer is asked
  // to contact support, who check availability.
  'Abu Dhabi': 'contact_support',
  'Ras Al Khaimah': 'contact_support',
  Fujairah: 'contact_support',
  'Umm Al Quwain': 'contact_support',
} as const satisfies Record<Emirate, CoverageStatus>;

export const ACTIVE_EMIRATES = EMIRATES.map((emirate) => emirate.name).filter((name) => EMIRATE_COVERAGE[name] === 'active');

// The verdict for one location.
export type ServiceArea =
  | { status: 'active'; emirate: Emirate }
  | { status: 'contact_support'; emirate: Emirate }
  // A UAE location whose emirate couldn't be confirmed. Never assumed to be
  // covered — and never called unsupported either: support confirms it.
  | { status: 'unverified'; emirate: null }
  // Google places it in another country.
  | { status: 'outside_uae'; emirate: null };

export const UNVERIFIED_SERVICE_AREA: ServiceArea = { status: 'unverified', emirate: null };
export const OUTSIDE_UAE_SERVICE_AREA: ServiceArea = { status: 'outside_uae', emirate: null };

export const coverageFor = (emirate: Emirate): ServiceArea =>
  EMIRATE_COVERAGE[emirate] === 'active' ? { status: 'active', emirate } : { status: 'contact_support', emirate };

// Only an active emirate continues through normal booking, pricing and payment.
export const isBookable = (area: ServiceArea) => area.status === 'active';

// ── Reading the emirate from a Google place ─────────────────────────────────

// The address parts that say where a place is (lib/maps PlaceDetails).
export type EmiratePlace = {
  // Google's administrative_area_level_1 — the emirate.
  region?: string | null;
  // Google's locality.
  city?: string | null;
  country?: string | null;
  // ISO 3166-1 ("AE").
  countryCode?: string | null;
  // ISO 3166-2 ("AE-DU"), on places saved before Google.
  regionCode?: string | null;
};

// Makes Google's spellings comparable: case, spacing, punctuation, Latin
// accents ("Ash Shāriqah"), "Emirate"/"Emirate of"/"إمارة", "City", and
// Arabic variants (hamza/madda forms of alef, harakat, tatweel, ى/ي, ة/ه,
// and the invisible direction marks Google puts around Arabic names).
export const normalizePlaceName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[ـً-ٰٟ]/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[-‐‑–—'’`.,،()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the )?emirate of /, '')
    .replace(/ (emirate|city|municipality)$/, '')
    .replace(/^(اماره|مدينه|بلديه) /, '');

const index = (entries: [string, Emirate][]) => new Map(entries.map(([name, emirate]) => [normalizePlaceName(name), emirate]));
const BY_NAME = index(EMIRATES.flatMap((emirate) => emirate.aliases.map((alias): [string, Emirate] => [alias, emirate.name])));
const BY_TOWN = index(EMIRATES.flatMap((emirate) => emirate.towns.map((town): [string, Emirate] => [town, emirate.name])));
const UAE_NAMES = new Set(
  ['united arab emirates', 'uae', 'u a e', 'ae', 'emirates', 'الإمارات العربية المتحدة', 'الإمارات'].map(normalizePlaceName),
);

// 'uae' / 'foreign' when Google says, null when it doesn't.
const countryOf = (place: EmiratePlace): 'uae' | 'foreign' | null => {
  const code = place.countryCode?.trim().toUpperCase();
  if (code) return code === 'AE' || code === 'ARE' ? 'uae' : 'foreign';
  if (place.country?.trim()) return UAE_NAMES.has(normalizePlaceName(place.country)) ? 'uae' : 'foreign';
  return null;
};

export type EmirateLookup = { kind: 'emirate'; emirate: Emirate } | { kind: 'outside_uae' } | { kind: 'unknown' };

// Which emirate a place is in, from Google's structured address — never
// from the text the customer typed or the formatted address:
//   1. a country other than the UAE → outside the UAE;
//   2. the emirate Google reports (administrative_area_level_1);
//   3. failing that, the city (locality) — "Dubai", or a town wholly inside
//      one emirate, like Hatta or Khor Fakkan;
//   4. an ISO code saved on older bookings.
// Anything else is unknown. Neighbourhood, street and building names are
// never used: they don't decide coverage, and some cross emirate borders.
export const locateEmirate = (place: EmiratePlace | null | undefined): EmirateLookup => {
  if (!place) return { kind: 'unknown' };
  let country = countryOf(place);

  const code = place.regionCode?.trim().toUpperCase();
  const iso = code?.match(/^(?:([A-Z]{2})-)?([A-Z]{2})$/);
  if (iso?.[1] && iso[1] !== 'AE') country = 'foreign';
  if (country === 'foreign') return { kind: 'outside_uae' };

  const byRegion = place.region ? BY_NAME.get(normalizePlaceName(place.region)) : undefined;
  if (byRegion) return { kind: 'emirate', emirate: byRegion };

  const city = place.city ? normalizePlaceName(place.city) : null;
  const byCity = city ? (BY_NAME.get(city) ?? (country === 'uae' ? BY_TOWN.get(city) : undefined)) : undefined;
  if (byCity) return { kind: 'emirate', emirate: byCity };

  const byCode = iso ? EMIRATES.find((emirate) => emirate.code === iso[2]) : undefined;
  if (byCode) return { kind: 'emirate', emirate: byCode.name };

  return { kind: 'unknown' };
};

export const identifyEmirate = (place: EmiratePlace | null | undefined): Emirate | null => {
  const found = locateEmirate(place);
  return found.kind === 'emirate' ? found.emirate : null;
};

// The one coverage decision, used for pickup and delivery alike.
export const classifyServiceArea = (place: EmiratePlace | null | undefined): ServiceArea => {
  const found = locateEmirate(place);
  if (found.kind === 'emirate') return coverageFor(found.emirate);
  return found.kind === 'outside_uae' ? OUTSIDE_UAE_SERVICE_AREA : UNVERIFIED_SERVICE_AREA;
};

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
export const SUPPORTED_EMIRATES = ACTIVE_EMIRATES.map(emirateRef);

export type LocationEnd = 'pickup' | 'dropoff';

export type ServiceAreaNotice = {
  title: string;
  // One paragraph each.
  body: string[];
  // Whether to offer "Contact Support".
  contact: boolean;
  tone: 'warning' | 'error';
};

const side = (end: LocationEnd, pickup: string, delivery: string) => (end === 'pickup' ? pickup : delivery);

// What to show when a location can't be booked normally, or null when it can.
export const serviceAreaNotice = (area: ServiceArea, end: LocationEnd): ServiceAreaNotice | null => {
  switch (area.status) {
    case 'active':
      return null;
    case 'contact_support':
      return {
        title: msg(side(end, 'serviceAreas.notice.pickupOnRequest', 'serviceAreas.notice.deliveryOnRequest')),
        body: [
          msg('serviceAreas.notice.outsideCoverage', { emirate: emirateRef(area.emirate) }),
          msg('serviceAreas.notice.sameDayIn', { supported: SUPPORTED_EMIRATES }),
          msg(side(end, 'serviceAreas.notice.pickupContact', 'serviceAreas.notice.deliveryContact')),
        ],
        contact: true,
        tone: 'warning',
      };
    case 'unverified':
      return {
        title: msg('serviceAreas.notice.unverified'),
        body: [msg('serviceAreas.notice.unverifiedBody')],
        contact: true,
        tone: 'warning',
      };
    case 'outside_uae':
      return {
        title: msg('serviceAreas.notice.outsideUae'),
        body: [msg('serviceAreas.notice.outsideUaeBody', { supported: SUPPORTED_EMIRATES }), msg('serviceAreas.notice.outsideUaeAction')],
        contact: false,
        tone: 'error',
      };
  }
};

// The same notice as one sentence-run, for places that show a single error
// string (a refused booking, a failed CSV row).
export const serviceAreaError = (area: ServiceArea, end: LocationEnd): string | null => {
  switch (area.status) {
    case 'active':
      return null;
    case 'contact_support':
      return msg(side(end, 'serviceAreas.errors.pickupOnRequest', 'serviceAreas.errors.deliveryOnRequest'), {
        emirate: emirateRef(area.emirate),
        supported: SUPPORTED_EMIRATES,
      });
    case 'unverified':
      return msg(side(end, 'serviceAreas.errors.pickupUnverified', 'serviceAreas.errors.deliveryUnverified'));
    case 'outside_uae':
      return msg(side(end, 'serviceAreas.errors.pickupOutsideUae', 'serviceAreas.errors.deliveryOutsideUae'));
  }
};

// Pre-fills a support request: a subject and the message's lines, each a
// translatable message.
export const serviceAreaRequest = (
  area: ServiceArea,
  addresses: { pickup?: string; dropoff?: string },
): { subject: string; lines: string[] } => {
  const route = [
    addresses.pickup ? msg('serviceAreas.request.from', { address: addresses.pickup }) : null,
    addresses.dropoff ? msg('serviceAreas.request.to', { address: addresses.dropoff }) : null,
  ].filter((line): line is string => line !== null);
  if (area.status === 'contact_support') {
    const emirate = emirateRef(area.emirate);
    return {
      subject: msg('serviceAreas.request.subject', { emirate }),
      lines: [msg('serviceAreas.request.body', { emirate }), ...route],
    };
  }
  return {
    subject: msg('serviceAreas.request.subjectUnverified'),
    lines: [msg('serviceAreas.request.bodyUnverified'), ...route],
  };
};
