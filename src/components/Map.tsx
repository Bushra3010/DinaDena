'use client';

import dynamic from 'next/dynamic';
import { cx } from './ui';

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  kind: 'home' | 'job' | 'worker' | 'me';
  label?: string;
  tooltip?: string;
  permanent?: boolean;
};

export type MapProps = {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  route?: { lat: number; lng: number }[];
  fit?: boolean;
  recenter?: boolean;
  onPick?: (p: { lat: number; lng: number }) => void;
  onMarkerClick?: (id: string) => void;
};

// Leaflet touches `window`, so it only loads in the browser.
const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-stone-200" />,
});

export function MapView({ className, ...props }: MapProps & { className?: string }) {
  return (
    <div className={cx('relative isolate overflow-hidden rounded-2xl border border-line bg-stone-100', className)}>
      <MapInner {...props} />
    </div>
  );
}
