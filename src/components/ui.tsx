'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { ArrowLeft, LoaderCircle, Star, X } from 'lucide-react';
import { initials } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { BookingStatus, JobStatus } from '@/lib/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'outline' | 'soft' | 'ghost' | 'danger' | 'success' | 'dark';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm shadow-brand-500/20',
  outline: 'border border-line bg-white text-ink hover:bg-stone-50',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  ghost: 'text-ink hover:bg-stone-100',
  danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  dark: 'bg-ink text-white hover:bg-stone-800',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  full?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, full, icon, className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-sm',
        size === 'lg' && 'min-h-13 px-5 text-base',
        full && 'w-full',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({ href, variant = 'primary', size = 'md', full, icon, className, children }: {
  href: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; full?: boolean; icon?: ReactNode; className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-sm',
        size === 'lg' && 'min-h-13 px-5 text-base',
        full && 'w-full',
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-2xl border border-line bg-white', className)} {...rest}>{children}</div>;
}

type Tone = 'brand' | 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'purple';
const tones: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  gray: 'bg-stone-100 text-stone-700 ring-stone-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export const statusTone: Record<BookingStatus | JobStatus | string, Tone> = {
  requested: 'amber', accepted: 'blue', rejected: 'red', expired: 'gray', cancelled: 'gray',
  on_the_way: 'purple', in_progress: 'brand', completed: 'green', open: 'amber', booked: 'blue',
  pending: 'amber', approved: 'green', suspended: 'red', success: 'green', failed: 'red', refunded: 'gray',
  created: 'gray', in_review: 'blue', resolved: 'green', dismissed: 'gray', high: 'red', medium: 'amber', low: 'gray',
};

export function StatusPill({ status }: { status: BookingStatus | JobStatus }) {
  const { status: label } = useI18n();
  return <Badge tone={statusTone[status]}>{label(status)}</Badge>;
}

export function Field({ label, hint, error, children, htmlFor }: {
  label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">{label}</label>}
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-stone-400 ' +
  'focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100 disabled:bg-stone-50 min-h-11';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputCls, 'appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%236b6560%27 stroke-width=%272%27 viewBox=%270 0 24 24%27><path d=%27m6 9 6 6 6-6%27/></svg>")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)} {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'min-h-20 resize-none', className)} {...rest} />;
}

export function Avatar({ name, url, size = 44, className }: { name?: string | null; url?: string | null; size?: number; className?: string }) {
  const hue = [...(name || '?')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name || ''} width={size} height={size} className={cx('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  }
  return (
    <div
      aria-hidden
      className={cx('flex shrink-0 items-center justify-center rounded-full font-bold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 55% 52%), hsl(${(hue + 30) % 360} 60% 42%))` }}
    >
      {initials(name)}
    </div>
  );
}

export function Stars({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="fill-amber-400 text-amber-400" style={{ width: size, height: size }} aria-hidden />
      <span className="font-semibold">{Number(value || 0).toFixed(1)}</span>
      {count != null && <span className="text-muted">({count})</span>}
    </span>
  );
}

export function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star`}
          onClick={() => onChange(n)} className="p-1">
          <Star className={cx('size-8 transition-colors', n <= value ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx('size-6 animate-spin text-brand-500', className)} aria-label="Loading" />;
}

export function PageLoader() {
  return <div className="flex min-h-[50vh] items-center justify-center"><Spinner /></div>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 rounded-full bg-brand-50 p-3 text-brand-500">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'amber', icon, title, children, className }: {
  tone?: 'amber' | 'red' | 'green' | 'blue' | 'brand'; icon?: ReactNode; title?: ReactNode; children?: ReactNode; className?: string;
}) {
  const t = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    blue: 'bg-sky-50 border-sky-200 text-sky-900',
    brand: 'bg-brand-50 border-brand-200 text-brand-900',
  }[tone];
  return (
    <div className={cx('flex gap-3 rounded-2xl border p-3.5 text-sm', t, className)} role={tone === 'red' ? 'alert' : undefined}>
      {icon && <div className="shrink-0 pt-0.5">{icon}</div>}
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export function TopBar({ title, back, right, sub }: { title: ReactNode; back?: string | true; right?: ReactNode; sub?: ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-line bg-white/95 px-2 backdrop-blur">
      {back ? (
        <button
          type="button"
          aria-label={t('back')}
          onClick={() => (back === true ? router.back() : router.push(back))}
          className="flex size-11 items-center justify-center rounded-full hover:bg-stone-100"
        >
          <ArrowLeft className="size-5" />
        </button>
      ) : <div className="w-2" />}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold">{title}</h1>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      <div className="flex items-center gap-1 pr-1">{right}</div>
    </header>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-emerald-500' : 'bg-stone-300')}
    >
      <span className={cx('inline-block size-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-7' : 'translate-x-1')} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string;
}) {
  return (
    <div className={cx('flex gap-1 rounded-xl bg-stone-100 p-1', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors',
            value === o.value ? 'bg-brand-500 text-white shadow-sm' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx('inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors',
        active ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white text-ink hover:border-brand-300')}>
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children, dismissable = true }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; dismissable?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); if (dismissable) onClose(); }}
      onClick={(e) => { if (dismissable && e.target === ref.current) onClose(); }}
      className="m-auto w-[min(calc(100vw-32px),400px)] rounded-3xl bg-white p-0 shadow-2xl backdrop:bg-black/50"
    >
      {open && (
        <div className="relative p-5">
          {dismissable && (
            <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full hover:bg-stone-100">
              <X className="size-5" />
            </button>
          )}
          {title && <h2 className="mb-4 pr-10 text-lg font-bold">{title}</h2>}
          {children}
        </div>
      )}
    </dialog>
  );
}

export function OtpBoxes({ length, value, onChange, autoFocus, invalid }: {
  length: number; value: string; onChange: (v: string) => void; autoFocus?: boolean; invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, ch: string) => {
    const digits = value.padEnd(length, ' ').split('');
    digits[i] = ch || ' ';
    onChange(digits.join('').replace(/\s+$/, '').replace(/\s/g, ''));
  };
  return (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          maxLength={length}
          value={value[i] ?? ''}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) {
              onChange(v.slice(0, length));
              refs.current[Math.min(v.length, length) - 1]?.focus();
              return;
            }
            set(i, v);
            if (v && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          className={cx('size-13 rounded-xl border-2 bg-white text-center text-2xl font-bold focus:outline-none focus:ring-3',
            length > 4 && 'size-12 text-xl',
            invalid ? 'border-red-400 focus:ring-red-100' : 'border-line focus:border-brand-500 focus:ring-brand-100')}
        />
      ))}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-1 flex items-center justify-between">
      <h2 className="text-[15px] font-bold">{children}</h2>
      {action}
    </div>
  );
}

export function KeyValue({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 py-1 text-sm', strong && 'text-base font-bold')}>
      <span className={strong ? '' : 'text-muted'}>{k}</span>
      <span className={strong ? '' : 'font-medium'}>{v}</span>
    </div>
  );
}
