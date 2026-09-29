import { ImageResponse } from 'next/og';

// The preview card shown when the site is shared (Open Graph / Twitter).
export const alt = 'ParcelLink — same-day and next-day parcel delivery across the UAE';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const OpengraphImage = () =>
  new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #2a1541 0%, #4a2270 60%, #7b3fa7 100%)',
          color: '#f8f6fb',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 40, fontWeight: 700 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#1a98a2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
            }}
          >
            P
          </div>
          ParcelLink
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, maxWidth: 980 }}>
            Parcel delivery across the UAE, tracked door to door
          </div>
          <div style={{ fontSize: 32, color: 'rgba(248,246,251,0.78)' }}>
            Same-day · Next-day · Merchant logistics · Cash on delivery
          </div>
        </div>
      </div>
    ),
    size,
  );

export default OpengraphImage;
