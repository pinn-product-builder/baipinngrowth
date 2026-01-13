// ============================================================
// PINN CHART - Gráfico com estilo premium Pinn
// ============================================================

import { ReactNode } from 'react';
import { PinnGlassCard, PinnGlassCardHeader, PinnGlassCardContent } from './PinnGlassCard';
import { cn } from '@/lib/utils';
import { Download } from 'lucide-react';

interface PinnChartProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  height?: string;
  showExport?: boolean;
  onExport?: () => void;
  className?: string;
}

export function PinnChart({
  title,
  subtitle,
  children,
  height = 'h-[320px]',
  showExport = false,
  onExport,
  className,
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
          {showExport && (
            <button 
              onClick={onExport}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <Download className="h-4 w-4 text-white/50" />
            </button>
          )}
        </div>
      </PinnGlassCardHeader>
      <PinnGlassCardContent>
        <div className={cn(height)}>
          {children}
        </div>
      </PinnGlassCardContent>
    </PinnGlassCard>
  );
}
