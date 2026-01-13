// ============================================================
// PINN KPI CARD - Card de KPI estilo premium Pinn
// ============================================================

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { PinnGlassCard } from './PinnGlassCard';

interface PinnKPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  accentColor?: 'orange' | 'green' | 'blue' | 'purple';
  className?: string;
  glow?: boolean;
}

const accentColors = {
  orange: 'from-pinn-orange/20 to-pinn-orange/5',
  green: 'from-emerald-500/20 to-emerald-500/5',
  blue: 'from-blue-500/20 to-blue-500/5',
  purple: 'from-purple-500/20 to-purple-500/5',
};

const iconColors = {
  orange: 'text-pinn-orange',
  green: 'text-emerald-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
};

export function PinnKPICard({
  label,
  value,
  subtitle,
  icon: Icon,
  trend,
  accentColor = 'orange',
  className,
  glow = false,
}: PinnKPICardProps) {
  return (
    <PinnGlassCard className={className} glow={glow}>
      <div className="p-5">
        {/* Header with icon */}
        <div className="flex items-start justify-between mb-4">
          {Icon && (
            <div className={cn(
              "p-2.5 rounded-xl bg-gradient-to-br",
              accentColors[accentColor]
            )}>
              <Icon className={cn("h-5 w-5", iconColors[accentColor])} />
            </div>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
              trend.isPositive 
                ? "bg-emerald-500/20 text-emerald-400" 
                : "bg-red-500/20 text-red-400"
            )}>
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
            </div>
          )}
        </div>
        
        {/* Label */}
        <p className="text-sm text-white/50 font-medium mb-1 tracking-wide">
          {label}
        </p>
        
        {/* Value */}
        <p className="text-3xl font-bold text-white tracking-tight tabular-nums">
          {value}
        </p>
        
        {/* Subtitle */}
        {subtitle && (
          <p className="text-xs text-white/40 mt-2">
            {subtitle}
          </p>
        )}
      </div>
    </PinnGlassCard>
  );
}
