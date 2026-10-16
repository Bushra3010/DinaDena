// In-browser stand-in for the Supabase database. Data lives in localStorage so every tab
// shares it; a BroadcastChannel tells other tabs what changed (the "realtime" feed).

import { buildSeed } from './seed';

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Tables = Record<string, Row[]>;
type Change = { table: string; rows: Row[] };

const KEY = 'dinadena.mockdb.v1';
const FILES_KEY = 'dinadena.mockfiles.v1';

let db: Tables | null = null;
const listeners = new Set<(c: Change) => void>();
let channel: BroadcastChannel | null = null;

function ensureChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel('dinadena.mockdb');
  channel.onmessage = (e: MessageEvent<Change[]>) => {
    db = load(); // another tab wrote; re-read before notifying
    e.data.forEach((c) => listeners.forEach((l) => l(c)));
  };
}

function load(): Tables {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Tables;
  } catch {}
  const seeded = buildSeed();
  persist(seeded);
  return seeded;
}

function persist(t: Tables) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch (e) {
    console.warn('[mock db] could not save', e);
  }
}

export function tables(): Tables {
  ensureChannel();
  if (!db) db = load();
  return db;
}

export function table(name: string): Row[] {
  const t = tables();
  t[name] ??= [];
  return t[name]!;
}

/** Saves and announces changed rows to this tab and the others. */
export function commit(changes: Change[]) {
  if (!changes.length) return;
  persist(tables());
  // Notify after the current call stack so callers finish their own work first.
  setTimeout(() => changes.forEach((c) => listeners.forEach((l) => l(c))), 0);
  channel?.postMessage(changes);
}

export function onChange(fn: (c: Change) => void) {
  ensureChannel();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetMockDb() {
  db = buildSeed();
  persist(db);
  try {
    localStorage.removeItem(FILES_KEY);
  } catch {}
  channel?.postMessage(Object.keys(db).map((t) => ({ table: t, rows: [] })));
}

export const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

export const nowIso = () => new Date().toISOString();

// Uploaded files are kept as data URLs.
export function saveFile(path: string, dataUrl: string) {
  try {
    const files = JSON.parse(localStorage.getItem(FILES_KEY) || '{}') as Record<string, string>;
    files[path] = dataUrl;
    localStorage.setItem(FILES_KEY, JSON.stringify(files));
  } catch {
    throw new Error('File is too large for the demo storage. Try a smaller image.');
  }
}

// Seeded workers get a placeholder ID card image so the admin can open it.
const SAMPLE_ID = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" rx="16" fill="#fff4ed" stroke="#f45b14" stroke-width="4"/>' +
  '<text x="24" y="56" font-family="sans-serif" font-size="26" font-weight="700" fill="#be2f0b">SAMPLE ID (demo)</text>' +
  '<rect x="24" y="88" width="120" height="150" rx="8" fill="#fdba8c"/><text x="168" y="130" font-family="sans-serif" font-size="18" fill="#1c1917">Not a real document</text>' +
  '<text x="168" y="164" font-family="monospace" font-size="18" fill="#6b6560">XXXX XXXX 0000</text></svg>');

export function readFile(path: string): string | null {
  if (path.startsWith('worker-docs/seed/')) return SAMPLE_ID;
  try {
    return (JSON.parse(localStorage.getItem(FILES_KEY) || '{}') as Record<string, string>)[path] ?? null;
  } catch {
    return null;
  }
}
