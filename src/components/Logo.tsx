import { cx } from './ui';

/** The DiNaDeNa mark: a worker in a hard hat inside the "D", with a location pin. */
export function LogoMark({ className }: { className?: string }) {
  return <img src="/brand/mark-512.png" alt="" aria-hidden className={cx('size-8 object-contain', className)} />;
}

export function Logo({ className, sub }: { className?: string; sub?: string }) {
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <LogoMark className="size-11" />
      <div className="leading-none">
        <div className="text-[27px] font-extrabold tracking-tight">
          <span className="text-[#1f242c]">DiNa</span>
          <span className="text-brand-400">DeNa</span>
        </div>
        {sub && <div className="mt-0.5 text-[11px] font-medium text-muted">{sub}</div>}
      </div>
    </div>
  );
}
