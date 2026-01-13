// ============================================================
// FUNNEL TAB - Funil de Vendas
// ============================================================

import { useMemo } from 'react';
import {
  Filter,
  Users,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';

import { PinnSectionHeader } from '../PinnSectionHeader';
import { PinnGlassCard, PinnGlassCardHeader, PinnGlassCardContent } from '../PinnGlassCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { FunnelStage } from '@/hooks/useDashboardViews';

interface FunnelTabProps {
  stages: FunnelStage[];
  isLoading: boolean;
}

export function FunnelTab({ stages, isLoading }: FunnelTabProps) {
  // Calculate max leads for percentage
  const maxLeads = useMemo(() => {
    return Math.max(...stages.map(s => s.leads), 1);
  }, [stages]);
  
  // Calculate conversion rates between stages
  const stagesWithConversion = useMemo(() => {
    return stages.map((stage, idx) => {
      const prevLeads = idx > 0 ? stages[idx - 1].leads : stage.leads;
      const conversionRate = prevLeads > 0 ? (stage.leads / prevLeads) * 100 : 100;
      const percentOfTotal = (stage.leads / maxLeads) * 100;
      
      return {
        ...stage,
        conversionRate,
        percentOfTotal,
      };
    });
  }, [stages, maxLeads]);
  
  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-8">
        <PinnSectionHeader
          title="Funil de Vendas"
          subtitle="Pipeline atual"
          icon={Filter}
        />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }
  
  // Empty state
  if (stages.length === 0) {
    return (
      <div className="space-y-8">
        <PinnSectionHeader
          title="Funil de Vendas"
          subtitle="Pipeline atual"
          icon={Filter}
        />
        <PinnGlassCard>
          <PinnGlassCardContent className="py-12">
            <div className="text-center text-white/40">
              <Filter className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Sem dados de funil</p>
              <p className="text-sm mt-1">Os dados aparecerão quando houver eventos no período</p>
            </div>
          </PinnGlassCardContent>
        </PinnGlassCard>
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      <PinnSectionHeader
        title="Funil de Vendas"
        subtitle="Pipeline atual (30 dias)"
        icon={Filter}
      />
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PinnGlassCard variant="elevated">
          <PinnGlassCardContent className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-pinn-orange/20 flex items-center justify-center">
              <Users className="h-6 w-6 text-pinn-orange" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {stages[0]?.leads.toLocaleString('pt-BR') || 0}
              </p>
              <p className="text-sm text-white/40">Leads no topo</p>
            </div>
          </PinnGlassCardContent>
        </PinnGlassCard>
        
        <PinnGlassCard variant="elevated">
          <PinnGlassCardContent className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {stages[stages.length - 1]?.leads.toLocaleString('pt-BR') || 0}
              </p>
              <p className="text-sm text-white/40">Leads no fim</p>
            </div>
          </PinnGlassCardContent>
        </PinnGlassCard>
        
        <PinnGlassCard variant="elevated">
          <PinnGlassCardContent className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Filter className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {stages.length}
              </p>
              <p className="text-sm text-white/40">Etapas ativas</p>
            </div>
          </PinnGlassCardContent>
        </PinnGlassCard>
      </div>
      
      {/* Funnel Visualization */}
      <PinnGlassCard>
        <PinnGlassCardHeader>
          <h3 className="text-base font-semibold text-white">Funil Atual</h3>
          <p className="text-sm text-white/40 mt-0.5">Distribuição por etapa</p>
        </PinnGlassCardHeader>
        <PinnGlassCardContent className="space-y-3">
          {stagesWithConversion.map((stage, idx) => (
            <div key={stage.stage_key} className="relative">
              {/* Stage row */}
              <div className="flex items-center gap-4">
                {/* Stage number */}
                <div className="w-8 h-8 rounded-lg bg-pinn-orange/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-pinn-orange">{idx + 1}</span>
                </div>
                
                {/* Stage bar */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">{stage.stage_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white tabular-nums">
                        {stage.leads.toLocaleString('pt-BR')}
                      </span>
                      {idx > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          stage.conversionRate >= 50 
                            ? 'bg-green-500/20 text-green-400'
                            : stage.conversionRate >= 25
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {stage.conversionRate.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stage.percentOfTotal}%`,
                        background: `linear-gradient(90deg, #FF6B00 0%, #FF8A3D ${stage.percentOfTotal}%)`,
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {/* Arrow between stages */}
              {idx < stagesWithConversion.length - 1 && (
                <div className="flex justify-center my-2">
                  <ArrowRight className="h-4 w-4 text-white/20 rotate-90" />
                </div>
              )}
            </div>
          ))}
        </PinnGlassCardContent>
      </PinnGlassCard>
    </div>
  );
}
