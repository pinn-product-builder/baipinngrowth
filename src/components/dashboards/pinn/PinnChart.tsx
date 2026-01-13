// ============================================================
// PINN CHART - Premium chart container component
// ============================================================

import { Download, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PinnGlassCard, PinnGlassCardHeader, PinnGlassCardContent } from './PinnGlassCard';

interface PinnChartProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: string;
  showExport?: boolean;
  onExport?: () => void;
  className?: string;
  actions?: React.ReactNode;
}

export function PinnChart({
  title,
  subtitle,
  children,
  height = 'h-[320px]',
  showExport = false,
  onExport,
  className,
  actions,
}: PinnChartProps) {
  return (
    <PinnGlassCard className={className} hover={false}>
      <PinnGlassCardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            {showExport && (
              <button 
                onClick={onExport}
                className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-all"
                title="Exportar"
              >
                <Download className="h-4 w-4 text-white/50" />
              </button>
            )}
          </div>
        </div>
      </PinnGlassCardHeader>
      <PinnGlassCardContent className="pt-2">
        <div className={cn(height)}>
          {children}
        </div>
      </PinnGlassCardContent>
    </PinnGlassCard>
  );
}

// Empty state for charts
export function PinnChartEmpty({ 
  message = "Sem dados disponíveis",
  icon: Icon,
}: { 
  message?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="h-full flex items-center justify-center text-white/40">
      <div className="text-center">
        {Icon && <Icon className="h-10 w-10 mx-auto mb-3 opacity-30" />}
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}
