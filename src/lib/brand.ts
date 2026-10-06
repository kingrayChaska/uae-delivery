// ParcelLink brand colours for code that can't read CSS variables (Google
// Maps markers and route lines, Recharts). Keep in sync with --parcellink-* in
// app/globals.css.
export const BRAND = {
  name: 'ParcelLink',
  purple: '#7b3fa7',
  teal: '#1a98a2',
  logoSrc: '/brand/parcellink-logo.png',
  // Intrinsic size of the logo file, for next/image's aspect ratio.
  logoWidth: 960,
  logoHeight: 238,
} as const;

// ParcelLink's contact details: the marketing contact section and the
// header of every invoice. One place, so the two never disagree.
export const COMPANY = {
  name: 'ParcelLink UAE',
  phone: '+971 52 612 3313',
  whatsapp: '971526123313',
  email: 'admin@parcellinkuae.com',
  website: 'parcellinkuae.com',
} as const;
