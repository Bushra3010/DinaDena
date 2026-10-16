// A small stand-in for the parts of supabase-js this app uses: from().select/insert/update/
// upsert/delete with filters, rpc(), auth (phone OTP), storage and realtime channels.

import { DEMO_OTP } from '../demo';
import { runRpc } from './rpc';
import { commit, nowIso, onChange, readFile, saveFile, table, uuid, type Row } from './store';

type Result = { data: any; error: { message: string } | null; count?: number | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Filter = (r: Row) => boolean;

const PK: Record<string, string> = {
  profiles: 'id', worker_profiles: 'user_id', worker_private: 'user_id', app_settings: 'id', booking_otps: 'booking_id',
};

const DEFAULTS: Record<string, () => Row> = {
  complaints: () => ({
    code: 'CMP' + String(Math.floor(Math.random() * 100000)).padStart(5, '0'), status: 'open', priority: 'medium',
    admin_note: null, resolved_at: null, job_id: null, booking_id: null,
  }),
  worker_locations: () => ({ recorded_at: nowIso() }),
  categories: () => ({ active: true, sort: 0, icon: 'hammer' }),
  notifications: () => ({ read: false, body: null, link: null, device_token: null }),
  worker_profiles: () => ({
    status: 'pending', available: false, daily_rate: null, rating_avg: 0, rating_count: 0, jobs_completed: 0,
    category_ids: [], experience_years: 0, bio: null, home_area: null, rejection_reason: null,
  }),
  worker_private: () => ({
    home_lat: null, home_lng: null, id_doc_type: null, id_doc_path: null, bank_name: null, bank_account_last4: null, upi_id: null,
  }),
};

// Mirrors the database's generated column and the "unverified workers cannot go online" rule.
function normalize(name: string, r: Row) {
  if (name === 'worker_profiles') {
    r.verified = r.status === 'approved';
    if (!r.verified) r.available = false;
  }
  return r;
}

function rowsOf(name: string): Row[] {
  if (name === 'public_profiles') {
    return table('profiles').map((p) => ({ id: p.id, role: p.role, full_name: p.full_name, avatar_url: p.avatar_url }));
  }
  // Same as the categories RLS policy: only admins see inactive trades.
  if (name === 'categories') {
    const uid = mockUid();
    const admin = !!uid && table('profiles').find((p) => p.id === uid)?.role === 'admin';
    return admin ? table(name) : table(name).filter((c) => c.active);
  }
  return table(name);
}

const cmp = (a: unknown, b: unknown) => (a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);
const likeToRegex = (pattern: string, flags = '') =>
  new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', flags);

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private rng: [number, number] | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private returning = false;
  private countOpt = false;
  private head = false;
  private onConflict: string | null = null;

  constructor(private name: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') {
      this.countOpt = !!opts?.count;
      this.head = !!opts?.head;
    } else this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this; }
  update(patch: Row) { this.op = 'update'; this.payload = patch; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) { this.op = 'upsert'; this.payload = rows; this.onConflict = opts?.onConflict ?? null; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: null) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === 'is' && v === null) this.filters.push((r) => r[c] != null);
    else this.filters.push((r) => r[c] !== v);
    return this;
  }
  gt(c: string, v: unknown) { this.filters.push((r) => r[c] != null && cmp(r[c], v) > 0); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => r[c] != null && cmp(r[c], v) >= 0); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => r[c] != null && cmp(r[c], v) < 0); return this; }
  lte(c: string, v: unknown) { this.filters.push((r) => r[c] != null && cmp(r[c], v) <= 0); return this; }
  like(c: string, p: string) { const re = likeToRegex(p); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this; }
  ilike(c: string, p: string) { const re = likeToRegex(p, 'i'); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this; }
  or(expr: string) {
    const parts = expr.split(',').map((p) => {
      const [col, op, ...rest] = p.split('.');
      const val = rest.join('.');
      if (op === 'ilike') { const re = likeToRegex(val, 'i'); return (r: Row) => re.test(String(r[col!] ?? '')); }
      if (op === 'eq') return (r: Row) => String(r[col!]) === val;
      return () => false;
    });
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending ?? true }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }

  private match(r: Row) {
    return this.filters.every((f) => f(r));
  }

  private shape(rows: Row[], count?: number): Result {
    const copy = rows.map((r) => structuredClone(r));
    if (this.mode === 'many') return { data: this.head ? null : copy, error: null, count: count ?? null };
    if (copy.length > 1 || (this.mode === 'single' && copy.length === 0)) {
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    return { data: copy[0] ?? null, error: null };
  }

  private run(): Result {
    // Reads go through view/visibility rules; writes always hit the real table.
    const rows = this.op === 'select' ? rowsOf(this.name) : table(this.name);
    if (this.op === 'select') {
      let out = rows.filter((r) => this.match(r));
      const count = out.length;
      if (this.orders.length) {
        out = [...out].sort((a, b) => {
          for (const o of this.orders) {
            const c = cmp(a[o.col], b[o.col]);
            if (c) return o.asc ? c : -c;
          }
          return 0;
        });
      }
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) out = out.slice(0, this.lim);
      return this.shape(out, this.countOpt ? count : undefined);
    }

    const name = this.name;
    const changed: Row[] = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const key = this.onConflict ?? PK[name] ?? 'id';
      for (const input of list) {
        const existing = this.op === 'upsert' ? rows.find((r) => input[key] != null && r[key] === input[key]) : undefined;
        if (existing) {
          Object.assign(existing, input, { updated_at: nowIso() });
          changed.push(normalize(name, existing));
        } else {
          const at = nowIso();
          const row = normalize(name, { ...(DEFAULTS[name]?.() ?? {}), id: uuid(), created_at: at, updated_at: at, ...input });
          if (PK[name] && PK[name] !== 'id') delete row.id;
          rows.push(row);
          changed.push(row);
        }
      }
    } else if (this.op === 'update') {
      for (const r of rows.filter((x) => this.match(x))) {
        Object.assign(r, this.payload, { updated_at: nowIso() });
        changed.push(normalize(name, r));
      }
    } else if (this.op === 'delete') {
      const keep = rows.filter((r) => !this.match(r));
      changed.push(...rows.filter((r) => this.match(r)));
      rows.splice(0, rows.length, ...keep);
    }
    commit([{ table: name, rows: changed }]);
    return this.returning ? this.shape(changed) : { data: null, error: null };
  }
}

// ---------------------------------------------------------------------------
// Auth: phone + fixed OTP. The session is per tab so two tabs can be two people.
// ---------------------------------------------------------------------------
type Session = { access_token: string; user: { id: string; phone: string } };
const SESSION_KEY = 'dinadena.mock.session';
const authListeners = new Set<(event: string, s: Session | null) => void>();

function readSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as Session | null;
  } catch {
    return null;
  }
}
function writeSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
  authListeners.forEach((l) => l(s ? 'SIGNED_IN' : 'SIGNED_OUT', s));
}
export const mockUid = () => readSession()?.user.id ?? null;

const auth = {
  async getSession() {
    return { data: { session: readSession() }, error: null };
  },
  onAuthStateChange(cb: (event: string, s: Session | null) => void) {
    authListeners.add(cb);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
  },
  async signInWithOtp({ phone }: { phone: string }) {
    if (!/^\+?\d{10,13}$/.test(phone)) return { data: null, error: { message: 'Invalid phone number' } };
    return { data: {}, error: null };
  },
  async verifyOtp({ phone, token }: { phone: string; token: string }) {
    if (token !== DEMO_OTP) return { data: null, error: { message: 'Token has expired or is invalid' } };
    const digits = phone.replace(/\D/g, '');
    const users = table('users');
    let user = users.find((u) => u.phone === digits);
    if (!user) {
      // New user: same as the database trigger, a customer profile that still needs onboarding.
      user = { id: uuid(), phone: digits };
      users.push(user);
      const at = nowIso();
      table('profiles').push({
        id: user.id, role: 'customer', full_name: null, phone: digits, language: 'en', avatar_url: null, city: 'Jaipur',
        onboarded: false, created_at: at, updated_at: at,
      });
      commit([{ table: 'profiles', rows: [] }]);
    }
    const session: Session = { access_token: 'mock-' + uuid(), user: { id: user.id, phone: digits } };
    writeSession(session);
    return { data: { session, user: session.user }, error: null };
  },
  async signOut() {
    writeSession(null);
    return { error: null };
  },
};

// ---------------------------------------------------------------------------
// Storage: files become data URLs (images are shrunk so localStorage can hold them).
// ---------------------------------------------------------------------------
async function toDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  if (!file.type.startsWith('image/')) return raw;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = raw; });
  const scale = Math.min(1, 640 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, file: File) {
        try {
          saveFile(`${bucket}/${path}`, await toDataUrl(file));
          return { data: { path }, error: null };
        } catch (e) {
          return { data: null, error: { message: (e as Error).message } };
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: readFile(`${bucket}/${path}`) ?? '' } };
      },
      async createSignedUrl(path: string) {
        const url = readFile(`${bucket}/${path}`);
        return url ? { data: { signedUrl: url }, error: null } : { data: null, error: { message: 'File not found' } };
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Realtime: postgres_changes subscriptions, matched on simple "col=eq.x" / "col=in.(a,b)" filters.
// ---------------------------------------------------------------------------
function filterFn(filter?: string): Filter {
  if (!filter) return () => true;
  const m = /^(\w+)=(eq|in)\.(.*)$/.exec(filter);
  if (!m) return () => true;
  const [, col, op, val] = m;
  if (op === 'eq') return (r) => String(r[col!]) === val;
  const set = val!.replace(/^\(|\)$/g, '').split(',');
  return (r) => set.includes(String(r[col!]));
}

type Channel = { handlers: { table: string; match: Filter; cb: () => void }[]; off?: () => void };
const realtime = {
  channel() {
    const ch: Channel = { handlers: [] };
    const api = {
      on(_type: string, opts: { table: string; filter?: string }, cb: () => void) {
        ch.handlers.push({ table: opts.table, match: filterFn(opts.filter), cb });
        return api;
      },
      subscribe() {
        ch.off = onChange(({ table: t, rows }) => {
          for (const h of ch.handlers) {
            if (h.table === t && (rows.length === 0 || rows.some(h.match))) h.cb();
          }
        });
        return api;
      },
      _ch: ch,
    };
    return api;
  },
  removeChannel(api: { _ch: Channel }) {
    api._ch.off?.();
    return Promise.resolve('ok');
  },
};

export const mockClient = {
  from: (name: string) => new Query(name),
  rpc: (fn: string, args?: Record<string, unknown>) => ({
    then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve().then((): Result => {
        try {
          return { data: runRpc(fn, args ?? {}, mockUid()), error: null };
        } catch (e) {
          return { data: null, error: { message: (e as Error).message } };
        }
      }).then(ok, bad);
    },
  }),
  auth,
  storage,
  channel: realtime.channel,
  removeChannel: realtime.removeChannel,
};
