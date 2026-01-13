// ============================================================
// PINN SECTION HEADER - Premium section header component
// ============================================================

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PinnSectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: string;
  badgeVariant?: 'default' | 'success' | 'warning' | 'priority';
  className?: string;
  actions?: React.ReactNode;
}

const badgeVariants = {
  default: "bg-white/10 text-white/60 border-white/10",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  priority: "bg-orange-500/15 text-orange-400 border-orange-500/20",
};

export function PinnSectionHeader({
  title,
  subtitle,
  icon: Icon,
  badge,
  badgeVariant = 'default',
  className,
  actions,
}: PinnSectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 shadow-[0_0_20px_rgba(255,107,0,0.15)]">
            <Icon className="h-5 w-5 text-orange-400" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {title}
            </h2>
            {badge && (
              <span className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full border",
                badgeVariants[badgeVariant]
              )}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
