import { cx } from './ui';

/** Hard-hat over a doorway: the DiNaDeNa mark. Original artwork, no third-party assets. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cx('size-8', className)} aria-hidden>
      <path d="M8 19a12 12 0 0 1 24 0z" fill="#f45b14" />
      <rect x="18" y="5" width="4" height="9" rx="2" fill="#f45b14" />
      <rect x="5" y="18.5" width="30" height="3.5" rx="1.75" fill="#be2f0b" />
      <path d="M9 24h22v13H9z" fill="#1c1917" />
      <path d="M16 37v-7a4 4 0 0 1 8 0v7z" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, sub }: { className?: string; sub?: string }) {
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <LogoMark />
      <div className="leading-none">
        <div className="font-serif text-[22px] font-black tracking-tight text-ink">
          Di<span className="text-brand-500">Na</span>De<span className="text-brand-500">Na</span>
        </div>
        {sub && <div className="mt-0.5 text-[11px] font-medium text-muted">{sub}</div>}
      </div>
    </div>
  );
}
