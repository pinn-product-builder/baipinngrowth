import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowDown, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { getColumnLabel, formatMetricValue } from './labelMaps';

interface FunnelStage {
  key: string;
  label: string;
  value: number;
  previousValue?: number;
  rate?: number;
  previousRate?: number;
}

interface FunnelChartProps {
  data: Record<string, number>;
  previousData?: Record<string, number>;
  comparisonEnabled?: boolean;
  className?: string;
}

const FUNNEL_STAGES = [
  { key: 'leads_total', label: 'Leads' },
  { key: 'entrada_total', label: 'Entradas' },
  { key: 'reuniao_agendada_total', label: 'Agendamentos' },
  { key: 'reuniao_realizada_total', label: 'Reuniões' },
  { key: 'venda_total', label: 'Vendas' },
];

const STAGE_COLORS = [
  'from-blue-500/20 to-blue-500/5 border-blue-500/30',
  'from-indigo-500/20 to-indigo-500/5 border-indigo-500/30',
  'from-violet-500/20 to-violet-500/5 border-violet-500/30',
  'from-purple-500/20 to-purple-500/5 border-purple-500/30',
  'from-green-500/20 to-green-500/5 border-green-500/30',
];

export default function FunnelChart({
  data,
  previousData,
  comparisonEnabled = false,
  className,
}: FunnelChartProps) {
  const stages = useMemo(() => {
    const result: FunnelStage[] = [];
    let previousStage: FunnelStage | null = null;
    
    FUNNEL_STAGES.forEach((stage, index) => {
      const value = data[stage.key];
      if (value === undefined || value === null) return;
      
      const prevValue = previousData?.[stage.key];
      
      // Calculate conversion rate from previous stage
      let rate: number | undefined;
      let previousRate: number | undefined;
      
      if (previousStage && previousStage.value > 0) {
        rate = (value / previousStage.value) * 100;
      }
      
      if (prevValue !== undefined && previousStage?.previousValue && previousStage.previousValue > 0) {
        previousRate = (prevValue / previousStage.previousValue) * 100;
      }
      
      result.push({
        key: stage.key,
        label: stage.label,
        value,
        previousValue: prevValue,
        rate,
        previousRate,
      });
      
      previousStage = result[result.length - 1];
    });
    
    return result;
  }, [data, previousData]);

  // Find bottleneck (biggest drop in conversion)
  const bottleneck = useMemo(() => {
    if (stages.length < 2) return null;
    
    let worstDrop = 0;
    let worstIndex = -1;
    
    stages.forEach((stage, index) => {
      if (index === 0 || !stage.rate) return;
      const dropFromPrevious = 100 - stage.rate;
      if (dropFromPrevious > worstDrop) {
        worstDrop = dropFromPrevious;
        worstIndex = index;
      }
    });
    
    if (worstIndex > 0 && worstDrop > 30) {
      return {
        from: stages[worstIndex - 1].label,
        to: stages[worstIndex].label,
        drop: worstDrop,
      };
    }
    
    return null;
  }, [stages]);

  if (stages.length === 0) {
    return null;
  }

  const maxValue = Math.max(...stages.map(s => s.value));

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Funil do Período</CardTitle>
          {bottleneck && (
            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/20">
              <AlertTriangle className="h-3 w-3" />
              Gargalo: {bottleneck.from} → {bottleneck.to}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-6">
        <div className="space-y-2">
          {stages.map((stage, index) => {
            const widthPercent = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
            const colorClass = STAGE_COLORS[index % STAGE_COLORS.length];
            
            // Calculate delta
            const delta = stage.previousValue && stage.previousValue > 0
              ? ((stage.value - stage.previousValue) / stage.previousValue) * 100
              : null;
            
            // Rate delta
            const rateDelta = stage.rate && stage.previousRate
              ? stage.rate - stage.previousRate
              : null;
            
            return (
              <div key={stage.key} className="relative">
                {/* Conversion rate arrow between stages */}
                {index > 0 && stage.rate !== undefined && (
                  <div className="flex items-center justify-center py-1 text-xs text-muted-foreground">
                    <ArrowDown className="h-3 w-3 mr-1" />
                    <span className="font-medium">{stage.rate.toFixed(1)}%</span>
                    {rateDelta !== null && comparisonEnabled && (
                      <span className={cn(
                        "ml-1.5 flex items-center gap-0.5",
                        rateDelta > 0 ? "text-green-600" : rateDelta < 0 ? "text-red-600" : ""
                      )}>
                        {rateDelta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : 
                         rateDelta < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : null}
                        {rateDelta > 0 ? '+' : ''}{rateDelta.toFixed(1)}pp
                      </span>
                    )}
                  </div>
                )}
                
                {/* Stage bar */}
                <div 
                  className={cn(
                    "relative rounded-lg border bg-gradient-to-r transition-all duration-300",
                    colorClass,
                    bottleneck && stages[index]?.label === bottleneck.to && "ring-2 ring-amber-400/50"
                  )}
                  style={{ width: `${Math.max(widthPercent, 20)}%` }}
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="font-medium text-sm">{stage.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold tabular-nums">
                        {formatMetricValue(stage.value, 'integer')}
                      </span>
                      {delta !== null && comparisonEnabled && (
                        <span className={cn(
                          "text-xs flex items-center gap-0.5 font-medium",
                          delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-muted-foreground"
                        )}>
                          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : 
                           delta < 0 ? <TrendingDown className="h-3 w-3" /> : 
                           <Minus className="h-3 w-3" />}
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Summary stats */}
        <div className="mt-6 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
          {stages.length > 1 && (
            <>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Taxa Geral</p>
                <p className="text-lg font-bold">
                  {stages[stages.length - 1] && stages[0]?.value > 0
                    ? `${((stages[stages.length - 1].value / stages[0].value) * 100).toFixed(1)}%`
                    : '—'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Etapas</p>
                <p className="text-lg font-bold">{stages.length}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Entrada → Venda</p>
                <p className="text-lg font-bold">
                  {data.entrada_total && data.venda_total && data.entrada_total > 0
                    ? `${((data.venda_total / data.entrada_total) * 100).toFixed(1)}%`
                    : '—'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Agendada → Realizada</p>
                <p className="text-lg font-bold">
                  {data.reuniao_agendada_total && data.reuniao_realizada_total && data.reuniao_agendada_total > 0
                    ? `${((data.reuniao_realizada_total / data.reuniao_agendada_total) * 100).toFixed(1)}%`
                    : '—'}
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
