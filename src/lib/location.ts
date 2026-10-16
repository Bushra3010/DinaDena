'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { AREAS, currentPosition, nearestArea, type LatLng } from './geo';

export type Place = LatLng & { area: string; address?: string };

const KEY = 'dinadena.place';
const DEFAULT: Place = { ...AREAS[0]!, area: AREAS[0]!.name };
const listeners = new Set<() => void>();
let cached: { raw: string | null; place: Place } = { raw: null, place: DEFAULT };

function read(): Place {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cached.raw) {
    try {
      cached = { raw, place: raw ? (JSON.parse(raw) as Place) : DEFAULT };
    } catch {
      cached = { raw, place: DEFAULT };
    }
  }
  return cached.place;
}

/** The customer's working location (area + coordinates), remembered on this device. */
export function useMyPlace() {
  const place = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => DEFAULT,
  );
  const setPlace = useCallback((p: Place) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {}
    listeners.forEach((cb) => cb());
  }, []);
  const locate = useCallback(async () => {
    const pos = await currentPosition();
    if (!pos) return null;
    const p: Place = { ...pos, area: nearestArea(pos).name };
    setPlace(p);
    return p;
  }, [setPlace]);
  return { place, setPlace, locate };
}
