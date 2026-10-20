// The files Android (App Links) and iOS (Universal Links) fetch from the
// website to let the ParcelLink app open https://<site>/auth/confirm links —
// the password-reset and staff-invitation emails. Only that path: every other
// link stays in the browser. Built from server configuration; with nothing
// configured there is nothing to serve (404), exactly as before the app.
//
//   MOBILE_ANDROID_PACKAGE          e.g. ae.parcellink.app
//   MOBILE_ANDROID_SHA256_CERTS     the signing certificate fingerprint(s),
//                                   comma-separated (Play Console → App signing)
//   MOBILE_IOS_APP_IDS              <TeamID>.<bundle id>, comma-separated
export const APP_LINK_PATH = '/auth/confirm';

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const androidAssetLinks = (env: Record<string, string | undefined> = process.env) => {
  const packageName = env.MOBILE_ANDROID_PACKAGE?.trim();
  const fingerprints = list(env.MOBILE_ANDROID_SHA256_CERTS).filter((print) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(print));
  if (!packageName || fingerprints.length === 0) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
    },
  ];
};

export const appleAppSiteAssociation = (env: Record<string, string | undefined> = process.env) => {
  const appIDs = list(env.MOBILE_IOS_APP_IDS).filter((id) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(id));
  if (appIDs.length === 0) return null;
  return { applinks: { details: [{ appIDs, components: [{ '/': APP_LINK_PATH, comment: 'Password reset and staff invitation links' }] }] } };
};
