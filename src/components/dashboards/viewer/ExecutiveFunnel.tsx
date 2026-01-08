import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Users, 
  ArrowRight, 
  Target, 
  Calendar, 
  Briefcase,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatColumnValue, getColumnLabel, FUNNEL_STAGES, FUNNEL_STAGES_V3, RATE_METRICS, RATE_METRICS_V3 } from './labelMap';

interface FunnelStageData {
  stage: string;
  count: number;
  value?: number;  // Alias for count
  rate?: number;
  label?: string;
}

interface ExecutiveFunnelProps {
  data: Record<string, number>;
  previousData?: Record<string, number>;
  comparisonEnabled?: boolean;
  className?: string;
  funnelStages?: FunnelStageData[];
}

const STAGE_ICONS: Record<string, React.ElementType> = {
  // Legacy
  leads_total: Users,
  entrada_total: ArrowRight,
  reuniao_agendada_total: Calendar,
  reuniao_realizada_total: Briefcase,
  venda_total: Target,
  // V3
  leads_total_7d: Users,
  leads_total_30d: Users,
  msg_in_7d: ArrowRight,
  msg_in_30d: ArrowRight,
  meetings_scheduled_7d: Calendar,
  meetings_scheduled_30d: Calendar,
};

const STAGE_COLORS = [
  { bg: 'bg-primary', fill: 'bg-primary/20' },
  { bg: 'bg-accent', fill: 'bg-accent/20' },
  { bg: 'bg-warning', fill: 'bg-warning/20' },
  { bg: 'bg-chart-4', fill: 'bg-chart-4/20' },
  { bg: 'bg-success', fill: 'bg-success/20' },
];

interface BottleneckInfo {
  fromStage: string;
  toStage: string;
  dropRate: number;
  severity: 'critical' | 'warning' | 'ok';
}

export default function ExecutiveFunnel({
  data,
  previousData,
  comparisonEnabled = false,
  className,
  funnelStages: precomputedStages,
}: ExecutiveFunnelProps) {
  // Get funnel stages - prefer precomputed from v2, otherwise derive from data
  const stages = useMemo(() => {
    // If precomputed stages from dashboard-data-v2, use them
    if (precomputedStages && precomputedStages.length > 0) {
      return precomputedStages.map(s => s.stage);
    }
    
    // Check if we have v3 data
    const hasV3Data = FUNNEL_STAGES_V3.some(stage => 
      data[stage] !== undefined && isFinite(data[stage])
    );
    
    const stageList = hasV3Data ? [...FUNNEL_STAGES_V3] : [...FUNNEL_STAGES];
    
    return stageList.filter(stage => 
      data[stage] !== undefined && isFinite(data[stage])
    );
  }, [data, precomputedStages]);
  
  // Use precomputed data values if available (prefer 'count', fallback to 'value')
  const stageData = useMemo(() => {
    if (precomputedStages && precomputedStages.length > 0) {
      const dataMap: Record<string, number> = {};
      precomputedStages.forEach(s => {
        // Use 'count' if available, otherwise 'value'
        dataMap[s.stage] = s.count ?? (s as any).value ?? 0;
      });
      return dataMap;
    }
    return data;
  }, [data, precomputedStages]);
  
  const maxValue = useMemo(() => {
    return Math.max(...stages.map(s => stageData[s] || 0), 1);
  }, [stages, stageData]);
  
  // Calculate rates between stages - use precomputed rates if available
  const stageRates = useMemo(() => {
    // If we have precomputed rates from v2
    if (precomputedStages && precomputedStages.length > 0) {
      const rates: Record<string, number> = {};
      for (let i = 1; i < precomputedStages.length; i++) {
        const prev = precomputedStages[i - 1];
        const curr = precomputedStages[i];
        if (curr.rate !== undefined) {
          rates[`${prev.stage}_to_${curr.stage}`] = curr.rate;
        } else if (prev.count > 0) {
          rates[`${prev.stage}_to_${curr.stage}`] = curr.count / prev.count;
        }
      }
      return rates;
    }
    
    const rates: Record<string, number> = {};
    
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1];
      const curr = stages[i];
      const prevVal = stageData[prev] || 0;
      const currVal = stageData[curr] || 0;
      
      if (prevVal > 0) {
        rates[`${prev}_to_${curr}`] = currVal / prevVal;
      }
    }
    
    return rates;
  }, [stages, stageData, precomputedStages]);
  
  // Detect bottleneck (stage with highest drop rate)
  const bottleneck = useMemo((): BottleneckInfo | null => {
    let worstDrop = 0;
    let bottleneckInfo: BottleneckInfo | null = null;
    
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1];
      const curr = stages[i];
      const rate = stageRates[`${prev}_to_${curr}`] || 1;
      const dropRate = 1 - rate;
      
      if (dropRate > worstDrop) {
        worstDrop = dropRate;
        bottleneckInfo = {
          fromStage: prev,
          toStage: curr,
          dropRate,
          severity: dropRate > 0.5 ? 'critical' : dropRate > 0.3 ? 'warning' : 'ok',
        };
      }
    }
    
    return bottleneckInfo;
  }, [stages, stageRates]);
  
  // Calculate variation for a stage
  const getVariation = (stage: string) => {
    if (!comparisonEnabled || !previousData?.[stage]) return null;
    const current = stageData[stage] || 0;
    const previous = previousData[stage] || 0;
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };
  
  // Get existing rate metrics - check v3 first
  const rateMetrics = useMemo(() => {
    const result: Array<{ key: string; value: number }> = [];
    
    // Check if we have v3 rates
    const hasV3Rates = RATE_METRICS_V3.some(key => 
      stageData[key] !== undefined && isFinite(stageData[key])
    );
    
    const metricList = hasV3Rates ? [...RATE_METRICS_V3] : [...RATE_METRICS];
    
    metricList.forEach(key => {
      if (stageData[key] !== undefined && isFinite(stageData[key])) {
        result.push({ key, value: stageData[key] });
      }
    });
    
    return result;
  }, [stageData]);
  
  if (stages.length < 2) return null;
  
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Funil do Período</CardTitle>
          {bottleneck && bottleneck.severity !== 'ok' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "gap-1.5",
                      bottleneck.severity === 'critical' 
                        ? "border-destructive/30 text-destructive bg-destructive/5" 
                        : "border-warning/30 text-warning bg-warning/5"
                    )}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Gargalo detectado
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="font-medium mb-1">Maior perda no funil</p>
                  <p className="text-sm text-muted-foreground">
                    Entre {getColumnLabel(bottleneck.fromStage)} e {getColumnLabel(bottleneck.toStage)}: 
                    queda de {(bottleneck.dropRate * 100).toFixed(1)}%
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Funnel visualization */}
          <div className="lg:col-span-2 space-y-3">
            {stages.map((stage, index) => {
              const value = stageData[stage] || 0;
              const widthPercent = (value / maxValue) * 100;
              const Icon = STAGE_ICONS[stage] || Users;
              const colors = STAGE_COLORS[index % STAGE_COLORS.length];
              const variation = getVariation(stage);
              
              // Rate from previous stage
              let conversionRate: number | null = null;
              if (index > 0) {
                const prevStage = stages[index - 1];
                conversionRate = stageRates[`${prevStage}_to_${stage}`] || null;
              }
              
              // Check if this is the bottleneck stage
              const isBottleneck = bottleneck?.toStage === stage && bottleneck.severity !== 'ok';
              
              return (
                <div key={stage} className="relative">
                  {/* Arrow between stages */}
                  {index > 0 && (
                    <div className="flex items-center justify-center -my-1 h-4">
                      <ArrowDown className={cn(
                        "h-4 w-4",
                        isBottleneck ? "text-destructive" : "text-muted-foreground/40"
                      )} />
                      {conversionRate !== null && (
                        <span className={cn(
                          "absolute left-14 text-xs font-medium",
                          isBottleneck ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {(conversionRate * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}
                  
                  <div className={cn(
                    "flex items-center gap-4 p-3 rounded-xl border transition-colors",
                    isBottleneck && "border-destructive/30 bg-destructive/5"
                  )}>
                    {/* Icon */}
                    <div className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
                      colors.fill
                    )}>
                      <Icon className={cn("h-5 w-5", colors.bg.replace('bg-', 'text-'))} />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">{getColumnLabel(stage)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold tabular-nums">
                            {formatColumnValue(value, stage)}
                          </span>
                          {variation !== null && (
                            <span className={cn(
                              "flex items-center text-xs gap-0.5 font-medium",
                              variation > 0 ? "text-success" : variation < 0 ? "text-destructive" : "text-muted-foreground"
                            )}>
                              {variation > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {Math.abs(variation).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Bar */}
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            colors.bg
                          )}
                          style={{ width: `${Math.max(widthPercent, 2)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Rates sidebar */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Taxas de Conversão
            </h4>
            
            <div className="space-y-2">
              {rateMetrics.map(({ key, value }) => (
                <div 
                  key={key} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <span className="text-sm text-muted-foreground">
                    {getColumnLabel(key, true)}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-primary">
                    {formatColumnValue(value, key)}
                  </span>
                </div>
              ))}
            </div>
            
            {/* Bottleneck alert */}
            {bottleneck && bottleneck.severity !== 'ok' && (
              <div className={cn(
                "mt-4 p-3 rounded-lg border",
                bottleneck.severity === 'critical' 
                  ? "border-destructive/30 bg-destructive/5" 
                  : "border-warning/30 bg-warning/5"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={cn(
                    "h-4 w-4",
                    bottleneck.severity === 'critical' ? "text-destructive" : "text-warning"
                  )} />
                  <span className={cn(
                    "text-sm font-semibold",
                    bottleneck.severity === 'critical' ? "text-destructive" : "text-warning"
                  )}>
                    Maior Gargalo
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Queda de <strong>{(bottleneck.dropRate * 100).toFixed(1)}%</strong> entre{' '}
                  <span className="font-medium">{getColumnLabel(bottleneck.fromStage)}</span> e{' '}
                  <span className="font-medium">{getColumnLabel(bottleneck.toStage)}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
