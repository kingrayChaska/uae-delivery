'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

import { UAE_DEFAULT_CENTER, UAE_DEFAULT_ZOOM } from '@/lib/maps/config';

import type { Coordinates } from '@/lib/types';
import type { RouteResult } from '@/lib/maps/types';

import 'mapbox-gl/dist/mapbox-gl.css';

type RouteMapProps = {
  pickup?: Coordinates;
  dropoff?: Coordinates;
  route?: RouteResult;
  className?: string;
};

const ROUTE_SOURCE_ID = 'route';
const ROUTE_LAYER_ID = 'route-line';

const RouteMap = ({ pickup, dropoff, route, className }: RouteMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      // Fails loudly in development rather than silently rendering a blank
      // box — see .env.example for NEXT_PUBLIC_MAPBOX_TOKEN.
      console.error('NEXT_PUBLIC_MAPBOX_TOKEN is not configured');
      return;
    }

    mapboxgl.accessToken = token;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: UAE_DEFAULT_CENTER,
      zoom: UAE_DEFAULT_ZOOM,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep markers and the route line in sync with props.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncContent = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      const bounds = new mapboxgl.LngLatBounds();
      let hasPoints = false;

      if (pickup) {
        const marker = new mapboxgl.Marker({ color: '#0e5c63' })
          .setLngLat([pickup.lng, pickup.lat])
          .addTo(map);
        markersRef.current.push(marker);
        bounds.extend([pickup.lng, pickup.lat]);
        hasPoints = true;
      }

      if (dropoff) {
        const marker = new mapboxgl.Marker({ color: '#e8a33d' })
          .setLngLat([dropoff.lng, dropoff.lat])
          .addTo(map);
        markersRef.current.push(marker);
        bounds.extend([dropoff.lng, dropoff.lat]);
        hasPoints = true;
      }

      const geojsonSource = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (route) {
        const data: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {},
          geometry: route.geometry,
        };

        if (geojsonSource) {
          geojsonSource.setData(data);
        } else if (map.isStyleLoaded()) {
          map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data });
          map.addLayer({
            id: ROUTE_LAYER_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#0e5c63', 'line-width': 4 },
          });
        }
      } else if (geojsonSource) {
        geojsonSource.setData({ type: 'FeatureCollection', features: [] });
      }

      if (hasPoints) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
      }
    };

    if (map.isStyleLoaded()) {
      syncContent();
    } else {
      map.once('load', syncContent);
    }
  }, [pickup, dropoff, route]);

  return <div ref={containerRef} className={className ?? 'h-80 w-full rounded-md'} />;
};

export default RouteMap;
