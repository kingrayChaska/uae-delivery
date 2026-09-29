'use client';

import mapboxgl from 'mapbox-gl';
import { useTranslations } from 'next-intl';

import { useAppLocale } from '@/i18n/hooks';

// Map labels and controls in the page's language. The map itself (tiles,
// coordinates, routes) is the same in both.
//
// Arabic place names need right-to-left shaping, which mapbox-gl does with
// its RTL text plugin — self-hosted in public/vendor (scripts/
// copy-vendor-assets.mjs) and loaded only the first time an Arabic map
// appears. Its URL must be absolute: the map's web workers load it.
const RTL_PLUGIN_PATH = '/vendor/mapbox-gl-rtl-text.js';

//
// Loaded straight away rather than deferred: UAE maps always have Arabic
// names. And mapbox marks the plugin as failed whenever a map is removed
// while its workers are still syncing it (a language switch, or React's
// double mount in development) — so after an error the next map sets it up
// again instead of showing no Arabic labels at all.
const ensureRtlTextPlugin = () => {
  const status = mapboxgl.getRTLTextPluginStatus();
  if (status !== 'unavailable' && status !== 'error') return;
  mapboxgl.setRTLTextPlugin(
    `${window.location.origin}${RTL_PLUGIN_PATH}`,
    (error) => {
      if (error && error.name !== 'AbortError') console.error('Arabic map labels are unavailable', error);
    },
    false,
  );
};

export const useMapI18n = () => {
  const t = useTranslations('maps.map.controls');
  const locale = useAppLocale();

  return {
    rtl: locale === 'ar',
    // Map constructor options.
    options: (): Pick<mapboxgl.MapOptions, 'language' | 'locale'> => {
      if (locale === 'ar') ensureRtlTextPlugin();
      return {
        language: locale,
        locale: {
          'NavigationControl.ZoomIn': t('zoomIn'),
          'NavigationControl.ZoomOut': t('zoomOut'),
          'NavigationControl.ResetBearing': t('resetBearing'),
          'Map.Title': t('map'),
          'AttributionControl.ToggleAttribution': t('toggleAttribution'),
          'LogoControl.Title': t('logo'),
          'FullscreenControl.Enter': t('enterFullscreen'),
          'FullscreenControl.Exit': t('exitFullscreen'),
          'GeolocateControl.FindMyLocation': t('findMyLocation'),
          'GeolocateControl.LocationNotAvailable': t('locationUnavailable'),
          'ScrollZoomBlocker.CtrlMessage': t('ctrlScroll'),
          'ScrollZoomBlocker.CmdMessage': t('cmdScroll'),
          'TouchPanBlocker.Message': t('twoFingers'),
        },
      };
    },
  };
};
