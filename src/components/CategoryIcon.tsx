import { BrickWall, Hammer, HandHelping, PaintRoller, Sofa, Sparkles, Truck, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { cx } from './ui';

const icons: Record<string, LucideIcon> = {
  truck: Truck, sofa: Sofa, sparkles: Sparkles, hand: HandHelping, brick: BrickWall,
  paint: PaintRoller, wrench: Wrench, zap: Zap, hammer: Hammer,
};
export const ICON_NAMES = Object.keys(icons);

export function CategoryIcon({ icon, className, boxed }: { icon?: string; className?: string; boxed?: boolean }) {
  const category = icon && icons[icon] ? icon : 'hammer';
  const Icon = icons[category];
  if (!boxed) return <Icon className={className} aria-hidden />;
  return (
    <div data-category-icon={category} className={cx('category-icon flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-ink', className)}>
      <Icon className="size-6" aria-hidden />
    </div>
  );
}
