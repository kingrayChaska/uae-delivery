import { describe, expect, it } from 'vitest';

import {
  ACTIVE_EMIRATES,
  EMIRATES,
  EMIRATE_COVERAGE,
  classifyServiceArea,
  identifyEmirate,
  isBookable,
  normalizePlaceName,
  serviceAreaError,
  serviceAreaNotice,
  serviceAreaRequest,
} from '@/lib/service-areas/config';
import { parsePlaceDetailsResponse, parseReverseGeocodeResponse } from '@/lib/maps/google-client';
import { renderMessage } from '@/i18n/test-utils';

const en = renderMessage('en');
const ar = renderMessage('ar');

// ── Google-shaped fixtures ──────────────────────────────────────────────────
// A selected place as Places API (New) Place Details returns it. Google
// describes UAE places in two ways, and both must work:
//   'region' — the emirate as administrative_area_level_1 (plus the city);
//   'city'   — only the city (locality), no administrative_area_level_1.
type Shape = 'region' | 'city';
const UAE = { longText: 'United Arab Emirates', shortText: 'AE', types: ['country', 'political'] };

const selectedPlace = (name: string, area: string, emirate: string, shape: Shape, country = UAE) =>
  parsePlaceDetailsResponse({
    id: `ChIJ-${name.replace(/\W+/g, '-')}`,
    displayName: { text: name },
    location: { latitude: 25.2, longitude: 55.3 },
    types: ['point_of_interest', 'establishment'],
    addressComponents: [
      { longText: area, shortText: area, types: ['sublocality_level_1', 'sublocality', 'political'] },
      { longText: emirate, shortText: emirate, types: ['locality', 'political'] },
      ...(shape === 'region' ? [{ longText: emirate, shortText: emirate, types: ['administrative_area_level_1', 'political'] }] : []),
      country,
    ],
  }).place;

const verdict = (place: Parameters<typeof classifyServiceArea>[0]) => classifyServiceArea(place);

// ── Acceptance: active emirates ─────────────────────────────────────────────

const DUBAI = ['Downtown Dubai', 'JBR', 'Deira', 'Al Quoz', 'Business Bay', 'Dubai Investment Park', 'Jumeirah', 'Al Barsha'];
const SHARJAH = ['Industrial Area 6', 'Al Nahda', 'Muwaileh', 'Al Majaz (Sharjah Corniche)', 'Al Khan'];
const AJMAN = ['Ajman City Centre', 'Al Nuaimiya', 'Al Rawda', 'Al Jurf'];

describe.each<Shape>(['region', 'city'])('active emirates, from the selected Google place (%s shape)', (shape) => {
  it.each(DUBAI)('Dubai: %s → active', (area) => {
    expect(verdict(selectedPlace(`Somewhere in ${area}`, area, 'Dubai', shape))).toEqual({ status: 'active', emirate: 'Dubai' });
  });

  it.each(SHARJAH)('Sharjah: %s → active', (area) => {
    expect(verdict(selectedPlace(`Somewhere in ${area}`, area, 'Sharjah', shape))).toEqual({ status: 'active', emirate: 'Sharjah' });
  });

  it.each(AJMAN)('Ajman: %s → active', (area) => {
    expect(verdict(selectedPlace(`Somewhere in ${area}`, area, 'Ajman', shape))).toEqual({ status: 'active', emirate: 'Ajman' });
  });
});

describe('regression: the emirate decides, not a list of neighbourhoods', () => {
  // Places no code anywhere has heard of: all that matters is the emirate.
  it.each([
    ['Warehouse 14, Street 31b', 'Ras Al Khor Industrial Area 2', 'Dubai'],
    ['Villa 7', 'Mirdif', 'Dubai'],
    ['Al Hudaiba Awards Building', 'Al Satwa', 'Dubai'],
    ['Tower B', 'Dubai South', 'Dubai'],
    ['Block C', 'Al Taawun', 'Sharjah'],
    ['Shop 3', 'Al Qasimia', 'Sharjah'],
    ['Building 12', 'Al Rashidiya 3', 'Ajman'],
    ['Villa 40', 'Al Zahya', 'Ajman'],
  ])('%s, %s → active in %s', (name, area, emirate) => {
    expect(verdict(selectedPlace(name, area, emirate, 'region')).status).toBe('active');
    expect(verdict(selectedPlace(name, area, emirate, 'city')).status).toBe('active');
  });

  it('ignores the neighbourhood even when it sounds like another emirate', () => {
    // "Sharjah" in the area name, but Google says the emirate is Dubai.
    expect(verdict(selectedPlace('Shop', 'Al Nahda (next to Sharjah border)', 'Dubai', 'region'))).toEqual({ status: 'active', emirate: 'Dubai' });
  });

  it('reads Arabic results (a customer searching in Arabic)', () => {
    const arabic = { longText: 'الإمارات العربية المتحدة', shortText: 'AE', types: ['country', 'political'] };
    expect(verdict(selectedPlace('برج خليفة', 'وسط مدينة دبي', 'دبي', 'region', arabic)).status).toBe('active');
    expect(verdict(selectedPlace('مويلح', 'مويلح التجارية', 'الشارقة', 'city', arabic)).status).toBe('active');
    expect(verdict(selectedPlace('النعيمية', 'النعيمية', 'عجمان', 'region', arabic)).status).toBe('active');
    expect(verdict(selectedPlace('المصفح', 'المصفح', 'أبوظبي', 'region', arabic)).status).toBe('contact_support');
  });

  it('reads the emirate from a dropped pin (reverse geocoding), even when only a plus code and city describe it', () => {
    const pin = { lat: 24.98, lng: 55.17 };
    const { place } = parseReverseGeocodeResponse(
      {
        status: 'OK',
        results: [
          {
            place_id: 'plus',
            types: ['plus_code'],
            formatted_address: 'XW8C+2F Dubai - United Arab Emirates',
            address_components: [
              { long_name: 'XW8C+2F', short_name: 'XW8C+2F', types: ['plus_code'] },
              { long_name: 'Dubai', short_name: 'Dubai', types: ['locality', 'political'] },
              { long_name: 'United Arab Emirates', short_name: 'AE', types: ['country', 'political'] },
            ],
          },
        ],
      },
      pin,
    );
    expect(verdict(place)).toEqual({ status: 'active', emirate: 'Dubai' });
  });
});

// ── Acceptance: contact support ─────────────────────────────────────────────

describe('other emirates need Contact Support', () => {
  it.each([
    ['Mussafah', 'Abu Dhabi', 'Abu Dhabi'],
    ['Al Reem Island', 'Abu Dhabi', 'Abu Dhabi'],
    ['Khalifa City', 'Abu Dhabi', 'Abu Dhabi'],
    ['Al Hamra Village', 'Ras Al Khaimah', 'Ras Al Khaimah'],
    ['Dibba', 'Fujairah', 'Fujairah'],
    ['Old Town', 'Umm Al Quwain', 'Umm Al Quwain'],
  ])('%s, %s → contact support', (area, emirate, expected) => {
    for (const shape of ['region', 'city'] as const) {
      const area_ = verdict(selectedPlace(area, area, emirate, shape));
      expect(area_).toEqual({ status: 'contact_support', emirate: expected });
      expect(isBookable(area_)).toBe(false);
    }
  });

  it('knows towns inside an emirate that Google gives as the city', () => {
    expect(verdict({ city: 'Al Ain', countryCode: 'AE' })).toEqual({ status: 'contact_support', emirate: 'Abu Dhabi' });
    expect(verdict({ city: 'Hatta', countryCode: 'AE' })).toEqual({ status: 'active', emirate: 'Dubai' });
    expect(verdict({ city: 'Khor Fakkan', countryCode: 'AE' })).toEqual({ status: 'active', emirate: 'Sharjah' });
  });
});

// ── Acceptance: not a normal delivery ───────────────────────────────────────

describe('locations that can\'t proceed as a normal delivery', () => {
  it('outside the UAE', () => {
    expect(verdict(selectedPlace('Khasab Port', 'Khasab', 'Musandam', 'region', { longText: 'Oman', shortText: 'OM', types: ['country'] }))).toEqual({
      status: 'outside_uae',
      emirate: null,
    });
    // Named like an emirate, but Google says it's in another country.
    expect(verdict({ region: 'Dubai', countryCode: 'OM' }).status).toBe('outside_uae');
    expect(verdict({ region: 'Dubai', country: 'Oman' }).status).toBe('outside_uae');
    expect(verdict({ regionCode: 'OM-MU' }).status).toBe('outside_uae');
  });

  it('a UAE place whose emirate can\'t be determined is unverified — not unsupported, not active', () => {
    const area = verdict({ region: null, city: null, country: 'United Arab Emirates', countryCode: 'AE' });
    expect(area).toEqual({ status: 'unverified', emirate: null });
    expect(isBookable(area)).toBe(false);
    // A neighbourhood alone is never used to guess.
    expect(verdict({ city: 'Dubai Marina', countryCode: 'AE' }).status).toBe('unverified');
  });

  it('no address information at all (an invalid location) is unverified', () => {
    expect(verdict(undefined).status).toBe('unverified');
    expect(verdict({}).status).toBe('unverified');
  });
});

// ── Pickup + delivery: each end on its own ──────────────────────────────────

describe('pickup and delivery are validated independently', () => {
  const at = (emirate: string) => verdict({ region: emirate, countryCode: 'AE' });
  const trip = (pickup: string, dropoff: string) => (isBookable(at(pickup)) && isBookable(at(dropoff)) ? 'allow' : 'contact support');

  it.each([
    ['Dubai', 'Sharjah', 'allow'],
    ['Ajman', 'Dubai', 'allow'],
    ['Sharjah', 'Ajman', 'allow'],
    ['Dubai', 'Abu Dhabi', 'contact support'],
    ['Dubai', 'Fujairah', 'contact support'],
    ['Ras Al Khaimah', 'Dubai', 'contact support'],
  ])('%s → %s: %s', (pickup, dropoff, expected) => {
    expect(trip(pickup, dropoff)).toBe(expected);
  });
});

// ── Configuration and name matching ─────────────────────────────────────────

describe('EMIRATE_COVERAGE', () => {
  it('covers every emirate', () => {
    expect(Object.keys(EMIRATE_COVERAGE).toSorted()).toEqual(EMIRATES.map((emirate) => emirate.name).toSorted());
  });

  it('is active in Dubai, Sharjah and Ajman only', () => {
    expect(ACTIVE_EMIRATES).toEqual(['Dubai', 'Sharjah', 'Ajman']);
  });
});

describe('identifyEmirate: Google\'s spelling variations', () => {
  it.each([
    ['Dubai', 'Dubai'],
    ['DUBAI', 'Dubai'],
    ['  dubai  ', 'Dubai'],
    ['Dubai Emirate', 'Dubai'],
    ['Emirate of Dubai', 'Dubai'],
    ['دبي', 'Dubai'],
    ['‏دبي‏', 'Dubai'],
    ['إمارة دبي', 'Dubai'],
    ['Sharjah', 'Sharjah'],
    ['Sharjah Emirate', 'Sharjah'],
    ['Ash Shāriqah', 'Sharjah'],
    ['الشارقة', 'Sharjah'],
    ['الشارقه', 'Sharjah'],
    ['Ajman', 'Ajman'],
    ['Ajman Emirate', 'Ajman'],
    ['Ajman City', 'Ajman'],
    ['عجمان', 'Ajman'],
    ['Abu Dhabi', 'Abu Dhabi'],
    ['ابوظبي', 'Abu Dhabi'],
    ['أبو ظبي', 'Abu Dhabi'],
    ['Ras al-Khaimah', 'Ras Al Khaimah'],
    ['رأس الخيمة', 'Ras Al Khaimah'],
    ['Al Fujairah', 'Fujairah'],
    ['Umm al-Qaiwain', 'Umm Al Quwain'],
    ['أم القيوين', 'Umm Al Quwain'],
  ])('%j → %s', (region, emirate) => {
    expect(identifyEmirate({ region })).toBe(emirate);
  });

  it('still reads the ISO codes saved on older bookings', () => {
    expect(identifyEmirate({ regionCode: 'AE-DU' })).toBe('Dubai');
    expect(identifyEmirate({ regionCode: 'SH' })).toBe('Sharjah');
    expect(identifyEmirate({ regionCode: 'ae-aj' })).toBe('Ajman');
  });

  it('prefers the emirate Google reports over the city', () => {
    expect(identifyEmirate({ region: 'Sharjah', city: 'Dubai' })).toBe('Sharjah');
  });

  it('normalises names consistently', () => {
    expect(normalizePlaceName('  Emirate of  SHARJAH ')).toBe('sharjah');
    expect(normalizePlaceName('أبوظبي')).toBe(normalizePlaceName('ابوظبي'));
  });
});

// ── Customer messages ───────────────────────────────────────────────────────

describe('customer messages (as English and Arabic readers see them)', () => {
  it('offers Contact Support for another emirate, naming it', () => {
    const notice = serviceAreaNotice({ status: 'contact_support', emirate: 'Abu Dhabi' }, 'dropoff');
    expect(notice?.contact).toBe(true);
    expect(en(notice?.title)).toBe('Delivery available on request');
    expect(notice?.body.map(en)).toEqual([
      'This location in Abu Dhabi is outside our standard same-day delivery coverage.',
      'We currently provide same-day delivery in Dubai, Sharjah, and Ajman.',
      'For deliveries to this location, please contact our support team and we’ll check availability for you.',
    ]);
    expect(ar(notice?.title)).toBe('التوصيل متاح عند الطلب');
    expect(notice?.body.map(ar)[1]).toBe('نقدم حالياً خدمة التوصيل في نفس اليوم في دبي والشارقة وعجمان.');
  });

  it('words a pickup as a pickup', () => {
    const notice = serviceAreaNotice({ status: 'contact_support', emirate: 'Fujairah' }, 'pickup');
    expect(en(notice?.title)).toBe('Pickup available on request');
    expect(en(notice?.body[2])).toContain('For pickups from this location');
  });

  it('asks support to confirm an unverified location, rather than refusing it', () => {
    const notice = serviceAreaNotice({ status: 'unverified', emirate: null }, 'dropoff');
    expect(notice?.contact).toBe(true);
    expect(en(notice?.title)).toBe('We couldn’t verify delivery availability for this location.');
    expect(en(notice?.body[0])).toBe('Please contact ParcelLink Support so we can confirm whether delivery is available.');
    expect(ar(notice?.title)).toBe('تعذّر علينا التحقق من إمكانية التوصيل لهذا الموقع.');
  });

  it('says a location outside the UAE is not supported', () => {
    const notice = serviceAreaNotice({ status: 'outside_uae', emirate: null }, 'dropoff');
    expect(notice?.contact).toBe(false);
    expect(en(notice?.title)).toBe('This location is outside the UAE');
  });

  it('has nothing to say about active locations', () => {
    expect(serviceAreaNotice({ status: 'active', emirate: 'Ajman' }, 'pickup')).toBeNull();
    expect(serviceAreaError({ status: 'active', emirate: 'Ajman' }, 'pickup')).toBeNull();
  });

  it('gives the server a single sentence-run that says which end is the problem', () => {
    expect(en(serviceAreaError({ status: 'contact_support', emirate: 'Umm Al Quwain' }, 'dropoff'))).toMatch(
      /^Delivery location: Umm Al Quwain is outside our standard same-day delivery coverage\./,
    );
    expect(en(serviceAreaError({ status: 'unverified', emirate: null }, 'pickup'))).toMatch(/^Pickup location: We couldn’t verify/);
    expect(ar(serviceAreaError({ status: 'contact_support', emirate: 'Umm Al Quwain' }, 'dropoff'))).toMatch(/^موقع التسليم: أم القيوين/);
  });

  it('pre-fills a support request with the emirate and the addresses', () => {
    const request = serviceAreaRequest(
      { status: 'contact_support', emirate: 'Ras Al Khaimah' },
      { pickup: 'Dubai Marina Mall, Dubai, UAE', dropoff: 'Al Hamra Village, Ras Al Khaimah, UAE' },
    );
    expect(en(request.subject)).toBe('Delivery request: Ras Al Khaimah');
    expect(request.lines.map(en)).toContain('From: Dubai Marina Mall, Dubai, UAE');
    expect(request.lines.map(en)).toContain('To: Al Hamra Village, Ras Al Khaimah, UAE');
    expect(ar(request.subject)).toBe('طلب توصيل: رأس الخيمة');
    expect(en(serviceAreaRequest({ status: 'unverified', emirate: null }, {}).subject)).toBe('Delivery availability check');
  });
});
