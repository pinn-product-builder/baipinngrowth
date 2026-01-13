// ============================================================
// PINN KPI CARD - Premium KPI display component
// ============================================================

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PinnGlassCard } from './PinnGlassCard';

export type AccentColor = 'orange' | 'blue' | 'green' | 'purple' | 'amber' | 'red';

interface PinnKPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  accentColor?: AccentColor;
  className?: string;
  glow?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const accentStyles: Record<AccentColor, { bg: string; icon: string; glow: string }> = {
  orange: {
    bg: "from-orange-500/20 to-orange-600/10",
    icon: "text-orange-400",
    glow: "shadow-[0_0_20px_rgba(255,107,0,0.2)]",
  },
  blue: {
    bg: "from-blue-500/20 to-blue-600/10",
    icon: "text-blue-400",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.2)]",
  },
  green: {
    bg: "from-emerald-500/20 to-emerald-600/10",
    icon: "text-emerald-400",
    glow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]",
  },
  purple: {
    bg: "from-purple-500/20 to-purple-600/10",
    icon: "text-purple-400",
    glow: "shadow-[0_0_20px_rgba(139,92,246,0.2)]",
  },
  amber: {
    bg: "from-amber-500/20 to-amber-600/10",
    icon: "text-amber-400",
    glow: "shadow-[0_0_20px_rgba(245,158,11,0.2)]",
  },
  red: {
    bg: "from-red-500/20 to-red-600/10",
    icon: "text-red-400",
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.2)]",
  },
};

const sizeStyles = {
  sm: { padding: 'p-4', value: 'text-2xl', icon: 'h-4 w-4', iconPadding: 'p-2' },
  md: { padding: 'p-5', value: 'text-3xl', icon: 'h-5 w-5', iconPadding: 'p-2.5' },
  lg: { padding: 'p-6', value: 'text-4xl', icon: 'h-6 w-6', iconPadding: 'p-3' },
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
  size = 'md',
}: PinnKPICardProps) {
  const accent = accentStyles[accentColor];
  const sizes = sizeStyles[size];

  return (
    <PinnGlassCard className={className} glow={glow}>
      <div className={sizes.padding}>
        {/* Header with icon */}
        <div className="flex items-start justify-between mb-4">
          {Icon && (
            <div className={cn(
              "rounded-xl bg-gradient-to-br",
              accent.bg,
              accent.glow,
              sizes.iconPadding,
            )}>
              <Icon className={cn(sizes.icon, accent.icon)} />
            </div>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              trend.isPositive 
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" 
                : "bg-red-500/15 text-red-400 border border-red-500/20"
            )}>
              <span className="text-[10px]">{trend.isPositive ? '▲' : '▼'}</span>
              <span className="tabular-nums">{Math.abs(trend.value).toFixed(1)}%</span>
            </div>
          )}
        </div>
        
        {/* Label */}
        <p className="text-sm text-white/50 font-medium mb-1.5 tracking-wide uppercase">
          {label}
        </p>
        
        {/* Value */}
        <p className={cn(
          "font-bold text-white tracking-tight tabular-nums",
          sizes.value
        )}>
          {value}
        </p>
        
        {/* Subtitle */}
        {subtitle && (
          <p className="text-xs text-white/40 mt-2.5 flex items-center gap-1">
            {subtitle}
          </p>
        )}
      </div>
    </PinnGlassCard>
  );
}
