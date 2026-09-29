// Customer testimonials for the landing page.
//
// Only publish testimonials real customers actually gave you, with their
// permission to show their name. Entries marked `sample: true` are
// placeholders for designing the section: they're shown in development and
// automatically hidden in production, so invented reviews can never reach
// real visitors. To go live, add real entries (sample: false) and delete the
// samples. The section stays hidden in production until at least one real
// testimonial exists.
//
// Text can be a plain string (shown as written, whatever the page language —
// a customer's own words) or { en, ar } when you have both versions.

import type { Locale } from '@/i18n/config';

export type LocalizedText = string | { en: string; ar?: string };

export const localizedText = (text: LocalizedText, locale: Locale) =>
  typeof text === 'string' ? text : (text[locale] ?? text.en);

export const TESTIMONIAL_SERVICES = ['sameDay', 'nextDay', 'merchant', 'cod'] as const;

export type Testimonial = {
  id: string;
  quote: LocalizedText;
  name: string;
  // e.g. "Online boutique owner" or "Individual customer"
  role: LocalizedText;
  location: LocalizedText;
  // Whole stars, 1–5.
  rating: 1 | 2 | 3 | 4 | 5;
  service: (typeof TESTIMONIAL_SERVICES)[number];
  sample: boolean;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'sample-1',
    quote: {
      en: 'I booked a same-day pickup at lunchtime and the documents were in Business Bay before 5pm. The tracking ID made it easy to share with the recipient.',
      ar: 'حجزت استلامًا في نفس اليوم وقت الظهيرة، ووصلت المستندات إلى الخليج التجاري قبل الساعة الخامسة مساءً. وسهّل رقم التتبّع مشاركتها مع المستلم.',
    },
    name: 'Sample customer',
    role: { en: 'Individual customer', ar: 'عميل فرد' },
    location: { en: 'Dubai Marina', ar: 'دبي مارينا' },
    rating: 5,
    service: 'sameDay',
    sample: true,
  },
  {
    id: 'sample-2',
    quote: {
      en: 'We send around 40 orders a week. Adding them all to one booking and seeing the total up front saves our team a lot of back and forth.',
      ar: 'نرسل نحو 40 طلبًا أسبوعيًا. إضافتها كلها إلى حجز واحد ومعرفة الإجمالي مسبقًا يوفّر على فريقنا الكثير من المتابعة.',
    },
    name: 'Sample merchant',
    role: { en: 'Online store owner', ar: 'صاحب متجر إلكتروني' },
    location: { en: 'Al Quoz', ar: 'القوز' },
    rating: 5,
    service: 'merchant',
    sample: true,
  },
  {
    id: 'sample-3',
    quote: {
      en: 'Cash on delivery is collected and recorded properly, so reconciling at the end of the week is simple.',
      ar: 'يُحصَّل الدفع عند الاستلام ويُسجَّل بدقة، فتصبح تسوية الحسابات في نهاية الأسبوع سهلة.',
    },
    name: 'Sample merchant',
    role: { en: 'Electronics retailer', ar: 'تاجر إلكترونيات' },
    location: { en: 'Deira', ar: 'ديرة' },
    rating: 4,
    service: 'cod',
    sample: true,
  },
  {
    id: 'sample-4',
    quote: {
      en: 'Next-day delivery is great value for parcels that aren’t urgent, and the proof-of-delivery photo gave me peace of mind.',
      ar: 'التوصيل في اليوم التالي خيار موفّر للطرود غير العاجلة، وصورة إثبات التسليم منحتني راحة البال.',
    },
    name: 'Sample customer',
    role: { en: 'Individual customer', ar: 'عميل فرد' },
    location: { en: 'Jumeirah', ar: 'جميرا' },
    rating: 5,
    service: 'nextDay',
    sample: true,
  },
  {
    id: 'sample-5',
    quote: {
      en: 'Our villa wasn’t on the map search, so I dropped a pin and added the gate number. The driver came straight to the door.',
      ar: 'لم تظهر فيلتنا في البحث على الخريطة، فحدّدت الموقع بدبوس وأضفت رقم البوابة. ووصل السائق مباشرةً إلى الباب.',
    },
    name: 'Sample customer',
    role: { en: 'Individual customer', ar: 'عميل فرد' },
    location: { en: 'Arabian Ranches', ar: 'المرابع العربية' },
    rating: 5,
    service: 'sameDay',
    sample: true,
  },
];

// Real testimonials always show; samples only outside production.
export const visibleTestimonials = (all: Testimonial[] = TESTIMONIALS, isProduction = process.env.NODE_ENV === 'production') =>
  all.filter((testimonial) => !testimonial.sample || !isProduction);
