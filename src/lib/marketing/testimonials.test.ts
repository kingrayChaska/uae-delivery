import { describe, expect, it } from 'vitest';

import { localizedText, visibleTestimonials } from '@/lib/marketing/testimonials';

import type { Testimonial } from '@/lib/marketing/testimonials';

const entry = (id: string, sample: boolean): Testimonial => ({
  id,
  quote: 'Quote',
  name: 'Name',
  role: 'Role',
  location: 'Dubai',
  rating: 5,
  service: 'sameDay',
  sample,
});

describe('visibleTestimonials', () => {
  it('never shows sample testimonials in production', () => {
    expect(visibleTestimonials([entry('a', true), entry('b', true)], true)).toEqual([]);
  });

  it('shows real testimonials in production', () => {
    expect(visibleTestimonials([entry('a', true), entry('real', false)], true).map((t) => t.id)).toEqual(['real']);
  });

  it('shows samples in development so the section can be designed', () => {
    expect(visibleTestimonials([entry('a', true), entry('real', false)], false)).toHaveLength(2);
  });
});

describe('localizedText', () => {
  it('shows a plain string as written in every language', () => {
    expect(localizedText('Great service', 'ar')).toBe('Great service');
  });

  it('picks the page language, falling back to English', () => {
    expect(localizedText({ en: 'Dubai Marina', ar: 'دبي مارينا' }, 'ar')).toBe('دبي مارينا');
    expect(localizedText({ en: 'Deira' }, 'ar')).toBe('Deira');
  });
});
