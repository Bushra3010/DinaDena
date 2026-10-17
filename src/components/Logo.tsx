import { cx } from './ui';

/** Hard-hat over a doorway: the DiNaDeNa mark. Original artwork, no third-party assets. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cx('size-8', className)} aria-hidden>
      <path d="M8 19a12 12 0 0 1 24 0z" fill="var(--color-brand-500)" />
      <rect x="18" y="5" width="4" height="9" rx="2" fill="var(--color-brand-500)" />
      <rect x="5" y="18.5" width="30" height="3.5" rx="1.75" fill="var(--color-brand-700)" />
      <path d="M9 24h22v13H9z" fill="var(--color-ink)" />
      <path d="M16 37v-7a4 4 0 0 1 8 0v7z" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, sub }: { className?: string; sub?: string }) {
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="leading-none">
        <div className="text-[27px] font-bold tracking-tight text-ink">
          DiNaDeNa
        </div>
        {sub && <div className="mt-0.5 text-[11px] font-medium text-muted">{sub}</div>}
      </div>
    </div>
  );
}
