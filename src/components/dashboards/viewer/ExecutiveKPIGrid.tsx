import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, Info, DollarSign, Users, Target, ArrowRightLeft, Briefcase, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { getColumnLabel, getColumnFormat, formatMetricValue, getGoalDirection, calculateDelta } from './labelMaps';

interface KPIConfig {
  key: string;
  label: string;
  format: 'currency' | 'percent' | 'integer';
  goal?: number;
  goalDirection: 'higher_better' | 'lower_better';
  icon: React.ElementType;
  description: string;
}

const KPI_CONFIGS: KPIConfig[] = [
  {
    key: 'custo_total',
    label: 'Investimento',
    format: 'currency',
    goalDirection: 'lower_better',
    icon: DollarSign,
    description: 'Total investido em mídia no período',
  },
  {
    key: 'leads_total',
    label: 'Leads',
    format: 'integer',
    goalDirection: 'higher_better',
    icon: Users,
    description: 'Total de leads gerados no período',
  },
  {
    key: 'cpl',
    label: 'CPL',
    format: 'currency',
    goalDirection: 'lower_better',
    icon: TrendingUp,
    description: 'Custo por Lead = Investimento ÷ Leads',
  },
  {
    key: 'venda_total',
    label: 'Vendas',
    format: 'integer',
    goalDirection: 'higher_better',
    icon: ShoppingCart,
    description: 'Total de vendas fechadas no período',
  },
  {
    key: 'cac',
    label: 'CAC',
    format: 'currency',
    goalDirection: 'lower_better',
    icon: Target,
    description: 'Custo de Aquisição de Cliente = Investimento ÷ Vendas',
  },
  {
    key: 'taxa_venda_total',
    label: 'Conversão Final',
    format: 'percent',
    goalDirection: 'higher_better',
    icon: ArrowRightLeft,
    description: 'Taxa de conversão total = Vendas ÷ Leads',
  },
];

interface ExecutiveKPIGridProps {
  aggregatedData: Record<string, number>;
  previousData?: Record<string, number>;
  seriesData?: any[];
  comparisonEnabled?: boolean;
  className?: string;
}

export default function ExecutiveKPIGrid({
  aggregatedData,
  previousData,
  seriesData = [],
  comparisonEnabled = false,
  className,
}: ExecutiveKPIGridProps) {
  // Filter KPIs that have data
  const activeKPIs = useMemo(() => {
    return KPI_CONFIGS.filter(kpi => 
      aggregatedData[kpi.key] !== undefined && 
      aggregatedData[kpi.key] !== null &&
      isFinite(aggregatedData[kpi.key])
    );
  }, [aggregatedData]);

  return (
    <div className={cn("grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6", className)}>
      {activeKPIs.map((kpi) => {
        const value = aggregatedData[kpi.key];
        const prevValue = previousData?.[kpi.key];
        const delta = comparisonEnabled && prevValue ? calculateDelta(value, prevValue) : null;
        
        // Get sparkline data for this KPI
        const sparklineData = seriesData
          .map(row => row[kpi.key])
          .filter(v => v !== null && v !== undefined && isFinite(v));
        
        // Determine if delta is positive (considering goal direction)
        const isDeltaPositive = delta ? (
          kpi.goalDirection === 'lower_better' ? delta.percent < 0 : delta.percent > 0
        ) : null;
        
        const Icon = kpi.icon;
        const sparklineColor = isDeltaPositive === true ? 'hsl(145, 65%, 40%)' : 
                               isDeltaPositive === false ? 'hsl(0, 72%, 50%)' : 
                               'hsl(var(--primary))';

        return (
          <Card key={kpi.key} className="overflow-hidden hover:shadow-lg transition-all duration-200 border-l-4 border-l-transparent hover:border-l-primary">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Header with icon and label */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 cursor-help">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              {kpi.label}
                            </span>
                            <Info className="h-3 w-3 text-muted-foreground/50" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">{kpi.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  
                  {/* Main value */}
                  <p className="text-2xl font-bold tracking-tight tabular-nums">
                    {formatMetricValue(value, kpi.format)}
                  </p>
                  
                  {/* Delta indicator */}
                  {delta && (
                    <div className={cn(
                      "flex items-center gap-1.5 mt-1.5 text-sm font-medium",
                      isDeltaPositive ? "text-green-600 dark:text-green-400" :
                      isDeltaPositive === false ? "text-red-600 dark:text-red-400" :
                      "text-muted-foreground"
                    )}>
                      {delta.percent > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : delta.percent < 0 ? (
                        <TrendingDown className="h-3.5 w-3.5" />
                      ) : (
                        <Minus className="h-3.5 w-3.5" />
                      )}
                      <span className="tabular-nums">{delta.formatted}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        vs anterior
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Sparkline */}
                {sparklineData.length > 2 && (
                  <div className="w-16 h-10 shrink-0 opacity-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sparklineData.map((v, i) => ({ v, i }))}>
                        <Line 
                          type="monotone" 
                          dataKey="v" 
                          stroke={sparklineColor}
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
