import { describe, expect, it } from 'vitest';

import { androidAssetLinks, appleAppSiteAssociation } from '@/lib/mobile-api/app-links';

const PRINT = Array.from({ length: 32 }, () => 'AB').join(':');

describe('app link association files', () => {
  it('serve nothing until configured (the website before the app)', () => {
    expect(androidAssetLinks({})).toBeNull();
    expect(appleAppSiteAssociation({})).toBeNull();
  });

  it('ignore malformed values rather than publish them', () => {
    expect(androidAssetLinks({ MOBILE_ANDROID_PACKAGE: 'ae.parcellink.app', MOBILE_ANDROID_SHA256_CERTS: 'not-a-print' })).toBeNull();
    expect(appleAppSiteAssociation({ MOBILE_IOS_APP_IDS: 'ae.parcellink.app' })).toBeNull();
  });

  it('describe the Android app and its signing certificates', () => {
    expect(androidAssetLinks({ MOBILE_ANDROID_PACKAGE: 'ae.parcellink.app', MOBILE_ANDROID_SHA256_CERTS: ` ${PRINT} ,bad` })).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'ae.parcellink.app', sha256_cert_fingerprints: [PRINT] },
      },
    ]);
  });

  it('let iOS open only the emailed /auth/confirm links in the app', () => {
    const file = appleAppSiteAssociation({ MOBILE_IOS_APP_IDS: 'ABCDE12345.ae.parcellink.app' });
    expect(file?.applinks.details).toEqual([
      { appIDs: ['ABCDE12345.ae.parcellink.app'], components: [{ '/': '/auth/confirm', comment: expect.any(String) }] },
    ]);
  });
});
