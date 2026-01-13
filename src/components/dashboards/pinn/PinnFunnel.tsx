// ============================================================
// PINN FUNNEL - Premium funnel visualization component
// ============================================================

import { cn } from '@/lib/utils';
import { PinnGlassCard, PinnGlassCardHeader, PinnGlassCardContent } from './PinnGlassCard';
import { ChevronDown } from 'lucide-react';

interface FunnelStage {
  stage_name: string;
  stage_rank?: number;
  leads_total: number;
}

interface PinnFunnelProps {
  title?: string;
  subtitle?: string;
  stages: FunnelStage[];
  className?: string;
}

export function PinnFunnel({
  title = "Funil de Conversão",
  subtitle,
  stages,
  className,
}: PinnFunnelProps) {
  // Sort stages by rank if available
  const sortedStages = [...stages].sort((a, b) => 
    (a.stage_rank ?? 0) - (b.stage_rank ?? 0)
  );

  const maxLeads = Math.max(...stages.map(s => s.leads_total), 1);

  return (
    <PinnGlassCard className={className} hover={false}>
      <PinnGlassCardHeader>
        <h3 className="text-base font-semibold text-white tracking-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>
        )}
      </PinnGlassCardHeader>
      <PinnGlassCardContent>
        {sortedStages.length === 0 ? (
          <div className="py-8 text-center text-white/40 text-sm">
            Nenhum dado de funil disponível
          </div>
        ) : (
          <div className="space-y-3">
            {sortedStages.map((stage, index) => {
              const percentage = (stage.leads_total / maxLeads) * 100;
              const conversionRate = index > 0 && sortedStages[index - 1].leads_total > 0
                ? ((stage.leads_total / sortedStages[index - 1].leads_total) * 100).toFixed(1)
                : null;

              return (
                <div key={stage.stage_name} className="space-y-2">
                  {/* Conversion indicator */}
                  {index > 0 && conversionRate && (
                    <div className="flex items-center justify-center py-1">
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        <ChevronDown className="h-3 w-3" />
                        <span className="tabular-nums">{conversionRate}%</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Stage bar */}
                  <div className="relative">
                    {/* Background bar */}
                    <div className="h-14 rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                      {/* Fill bar */}
                      <div 
                        className="h-full rounded-xl bg-gradient-to-r from-orange-500/30 to-orange-600/20 border-r border-orange-500/40 transition-all duration-500"
                        style={{ width: `${Math.max(percentage, 5)}%` }}
                      />
                    </div>
                    
                    {/* Content overlay */}
                    <div className="absolute inset-0 flex items-center justify-between px-4">
                      <span className="text-sm font-medium text-white truncate max-w-[60%]">
                        {stage.stage_name}
                      </span>
                      <span className="text-lg font-bold text-white tabular-nums">
                        {stage.leads_total.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PinnGlassCardContent>
    </PinnGlassCard>
  );
}
