// ============================================================
// PINN SECTION HEADER - Cabeçalho de seção estilo Pinn
// ============================================================

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface PinnSectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: string;
  className?: string;
}

export function PinnSectionHeader({
  title,
  subtitle,
  icon: Icon,
  badge,
  className,
}: PinnSectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-4 mb-6", className)}>
      {Icon && (
        <div className="p-3 rounded-xl bg-gradient-to-br from-pinn-orange/20 to-pinn-orange/5 border border-pinn-orange/20">
          <Icon className="h-6 w-6 text-pinn-orange" />
        </div>
      )}
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white tracking-tight">
            {title}
          </h2>
          {badge && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-pinn-orange/20 text-pinn-orange border border-pinn-orange/30">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
