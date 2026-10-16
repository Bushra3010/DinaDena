// Demo launch city. Areas double as quick address picks and fallback coordinates.
export const CITY = { name: 'Jaipur', lat: 26.9124, lng: 75.7873 };

export const AREAS = [
  { name: 'Transport Nagar', lat: 26.8984, lng: 75.8382 },
  { name: 'C-Scheme', lat: 26.905, lng: 75.804 },
  { name: 'Malviya Nagar', lat: 26.8549, lng: 75.8243 },
  { name: 'Mansarovar', lat: 26.8505, lng: 75.7628 },
  { name: 'Raja Park', lat: 26.8967, lng: 75.8278 },
  { name: 'Sodala', lat: 26.9006, lng: 75.771 },
  { name: 'Vaishali Nagar', lat: 26.9115, lng: 75.7425 },
  { name: 'Bani Park', lat: 26.926, lng: 75.793 },
  { name: 'Jhotwara', lat: 26.9535, lng: 75.74 },
  { name: 'Vidhyadhar Nagar', lat: 26.956, lng: 75.778 },
  { name: 'Tonk Road', lat: 26.87, lng: 75.8 },
  { name: 'Sanganer', lat: 26.824, lng: 75.79 },
];

export type LatLng = { lat: number; lng: number };

export function distanceKm(a: LatLng, b: LatLng) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function nearestArea(p: LatLng) {
  return AREAS.reduce((best, a) => (distanceKm(p, a) < distanceKm(p, best) ? a : best), AREAS[0]!);
}

/** Browser location, or null if denied/unavailable/outside the launch city. */
export function currentPosition(timeoutMs = 6000): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        resolve(distanceKm(p, CITY) < 40 ? p : null);
      },
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Points along a gently curved path from a to b, for the simulated worker route. */
export function simulatedRoute(a: LatLng, b: LatLng, steps = 30): LatLng[] {
  const pts: LatLng[] = [];
  const bend = { lat: (b.lng - a.lng) * 0.15, lng: -(b.lat - a.lat) * 0.15 };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = Math.sin(Math.PI * t);
    pts.push({
      lat: a.lat + (b.lat - a.lat) * t + bend.lat * k,
      lng: a.lng + (b.lng - a.lng) * t + bend.lng * k,
    });
  }
  return pts;
}
