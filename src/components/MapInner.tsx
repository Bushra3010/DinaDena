'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { MapMarker, MapProps } from './Map';

const pinColors: Record<MapMarker['kind'], string> = {
  home: '#3a2318', job: '#d9540b', worker: '#2563eb', me: '#2563eb',
};

function icon(m: MapMarker) {
  const color = pinColors[m.kind];
  const html = m.kind === 'me'
    ? `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 6px ${color}33"></div>`
    : m.kind === 'worker'
      ? `<div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px #0004;color:#fff;font:700 12px/28px system-ui;text-align:center">${m.label ?? ''}</div>`
      : `<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 39C15 39 28 24 28 14A13 13 0 0 0 2 14C2 24 15 39 15 39Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg>`;
  const size: [number, number] = m.kind === 'me' ? [18, 18] : m.kind === 'worker' ? [34, 34] : [30, 40];
  const anchor: [number, number] = m.kind === 'job' || m.kind === 'home' ? [15, 39] : [size[0] / 2, size[1] / 2];
  return L.divIcon({ html, className: '', iconSize: size, iconAnchor: anchor });
}

function FitBounds({ markers, fit }: { markers: MapMarker[]; fit: boolean }) {
  const map = useMap();
  const key = fit ? markers.map((m) => `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`).join('|') : '';
  useEffect(() => {
    if (!fit || markers.length < 2) return;
    map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng])), { padding: [40, 40], maxZoom: 15 });
    // Only refit when the set of points changes enough to alter the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function MapInner({ center, zoom = 13, markers = [], route, fit = true, onPick, recenter, onMarkerClick }: MapProps) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom={false} className="size-full" attributionControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {route && route.length > 1 && (
        <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#d9540b', weight: 4, dashArray: '8 8' }} />
      )}
      {markers.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={icon(m)}
          eventHandlers={onMarkerClick ? { click: () => onMarkerClick(m.id) } : undefined}>
          {m.tooltip && <Tooltip direction="top" offset={[0, -30]} permanent={m.permanent}>{m.tooltip}</Tooltip>}
        </Marker>
      ))}
      <FitBounds markers={markers} fit={fit} />
      {recenter && <Recenter lat={center.lat} lng={center.lng} />}
      {onPick && <ClickPicker onPick={onPick} />}
    </MapContainer>
  );
}
