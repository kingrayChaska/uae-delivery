import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en';
import ar from '../../../../messages/ar';

// The label every path prints (single labels, the staff label pages, a
// bulk shipment's sheet and its PDF), rendered to HTML with the real
// messages: a merchant label never mentions the delivery fee.

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

const { default: ShipmentLabel } = await import('@/components/shipment/label/shipment-label');

const label = {
  trackingNumber: 'U8YTZMTF',
  pickupAddress: 'Jebel Ali Freezone, Dubai',
  pickupContactName: 'Shop A',
  pickupContactPhone: '04 111 2222',
  pickupBuilding: null,
  pickupUnit: null,
  pickupFloor: null,
  pickupInstructions: null,
  dropoffAddress: '30B Street, Al Barsha, Dubai',
  dropoffContactName: 'Ahmed Khan',
  dropoffContactPhone: '050 123 4567',
  dropoffBuilding: null,
  dropoffUnit: null,
  dropoffFloor: null,
  dropoffInstructions: null,
  deliveryType: 'next_day' as const,
  deliveryDate: '2026-10-07',
  currency: 'AED',
  paymentMethod: 'cod' as const,
  recipientPaymentType: 'postpaid' as const,
  codAmount: 233,
  packageType: 'parcel' as const,
  packageDescription: 'Shoes',
  packageQuantity: 1,
  packageWeightKg: 2,
  packageLengthCm: null,
  packageWidthCm: null,
  packageHeightCm: null,
  isFragile: false,
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
};

const render = (deliveryFee: number | null, locale: 'en' | 'ar' = 'en') =>
  renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale, messages: locale === 'ar' ? ar : en, timeZone: 'Asia/Dubai' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(ShipmentLabel, { ...label, deliveryFee }),
    ),
  );

describe('ShipmentLabel', () => {
  it('prints no delivery fee on a merchant label (fee null), in English', () => {
    const html = render(null);
    expect(html).not.toMatch(/delivery fee/i);
    expect(html).not.toContain('15.00');
    // What the recipient pays for the goods is still there.
    expect(html).toContain('233.00');
  });

  it('prints no delivery fee on a merchant label, in Arabic', () => {
    expect(render(null, 'ar')).not.toContain(ar.shipments.label.deliveryFee);
  });

  it("prints an individual customer's fee", () => {
    const html = render(21.6);
    expect(html).toContain(`${en.shipments.label.deliveryFee}: AED`);
    expect(html).toContain('21.60');
  });
});
