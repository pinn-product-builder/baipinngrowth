// ============================================================
// AFONSINA FUNNEL CHART - Funil atual usando dados v3
// ============================================================

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FunnelStageRow } from '@/hooks/useAfonsinaDashboardData';

interface AfonsinaFunnelChartProps {
  funnelData: FunnelStageRow[];
  className?: string;
}

const STAGE_COLORS = [
  'hsl(var(--primary))',
  'hsl(200, 70%, 50%)',
  'hsl(180, 60%, 45%)',
  'hsl(150, 55%, 45%)',
  'hsl(120, 50%, 45%)',
  'hsl(80, 50%, 45%)',
];

export default function AfonsinaFunnelChart({
  funnelData,
  className,
}: AfonsinaFunnelChartProps) {
  // Sort by stage_rank and calculate percentages
  const stages = useMemo(() => {
    if (!funnelData || funnelData.length === 0) return [];
    
    const sorted = [...funnelData].sort((a, b) => a.stage_rank - b.stage_rank);
    const total = sorted[0]?.leads_total || 1;
    
    return sorted.map((stage, index) => ({
      ...stage,
      percentage: (stage.leads_total / total) * 100,
      color: STAGE_COLORS[index % STAGE_COLORS.length],
    }));
  }, [funnelData]);
  
  if (stages.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base">Funil Atual</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">
          Sem dados de funil disponíveis
        </CardContent>
      </Card>
    );
  }
  
  const maxCount = Math.max(...stages.map(s => s.leads_total));
  
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Funil Atual</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stages.map((stage, index) => (
            <div key={stage.stage_name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{stage.stage_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {stage.leads_total.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({stage.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div className="h-8 bg-muted rounded-md overflow-hidden relative">
                <div
                  className="h-full rounded-md transition-all duration-500"
                  style={{
                    width: `${(stage.leads_total / maxCount) * 100}%`,
                    backgroundColor: stage.color,
                  }}
                />
                {/* Conversion rate from previous stage */}
                {index > 0 && stages[index - 1].leads_total > 0 && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-foreground/80">
                    {((stage.leads_total / stages[index - 1].leads_total) * 100).toFixed(1)}% do anterior
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* Overall conversion */}
        {stages.length >= 2 && (
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Conversão Total</span>
              <span className="font-semibold text-primary">
                {((stages[stages.length - 1].leads_total / stages[0].leads_total) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
