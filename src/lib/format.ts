import type { Lang } from './types';

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');

export const rupees = (n: number | null | undefined) =>
  '₹' + Math.round(n ?? 0).toLocaleString('en-IN');

export function duration(minutes: number, lang: Lang = 'en') {
  const hi = lang === 'hi';
  if (minutes >= 480 && minutes % 480 === 0) {
    const d = minutes / 480;
    return hi ? `${d} दिन` : `${d} day${d > 1 ? 's' : ''}`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hs = h ? (hi ? `${h} घंटे` : `${h} hour${h > 1 ? 's' : ''}`) : '';
  const ms = m ? (hi ? `${m} मिनट` : `${m} min`) : '';
  return [hs, ms].filter(Boolean).join(' ');
}

export function elapsed(fromIso: string, to: number = Date.now()) {
  const s = Math.max(0, Math.floor((to - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

export const dateTime = (iso: string, lang: Lang = 'en') =>
  new Date(iso).toLocaleString(locale(lang), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const dateOnly = (iso: string, lang: Lang = 'en') =>
  new Date(iso).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' });

export const timeOnly = (iso: string, lang: Lang = 'en') =>
  new Date(iso).toLocaleTimeString(locale(lang), { hour: 'numeric', minute: '2-digit' });

export function timeAgo(iso: string, lang: Lang = 'en') {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  if (Math.abs(s) < 60) return rtf.format(-s, 'second');
  if (Math.abs(s) < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  return rtf.format(-Math.floor(s / 86400), 'day');
}

export const formatPhone = (p: string | null | undefined) => {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  const local = d.length > 10 ? d.slice(-10) : d;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
};

export const initials = (name: string | null | undefined) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export const km = (d: number | null | undefined) => (d == null ? '' : `${d.toFixed(1)} km`);

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function downloadFile(name: string, content: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Opens tel:/sms:/external links without treating them as app navigation. */
export function openExternal(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.click();
}
