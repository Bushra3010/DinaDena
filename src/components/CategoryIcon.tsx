import { BrickWall, Hammer, HandHelping, PaintRoller, Sofa, Sparkles, Truck, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { cx } from './ui';

const icons: Record<string, LucideIcon> = {
  truck: Truck, sofa: Sofa, sparkles: Sparkles, hand: HandHelping, brick: BrickWall,
  paint: PaintRoller, wrench: Wrench, zap: Zap, hammer: Hammer,
};
export const ICON_NAMES = Object.keys(icons);

export function CategoryIcon({ icon, className, boxed }: { icon?: string; className?: string; boxed?: boolean }) {
  const Icon = icons[icon ?? ''] ?? Hammer;
  if (!boxed) return <Icon className={className} aria-hidden />;
  return (
    <div className={cx('flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600', className)}>
      <Icon className="size-6" aria-hidden />
    </div>
  );
}
