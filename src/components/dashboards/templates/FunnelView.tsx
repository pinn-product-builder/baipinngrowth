import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ArrowDown, 
  Users, 
  ArrowRightLeft, 
  Calendar, 
  Briefcase, 
  Target, 
  XCircle, 
  AlertTriangle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FunnelViewProps {
  data: any[];
  spec: Record<string, any>;
  previousData?: any[];
  comparisonEnabled?: boolean;
}

const STAGE_ICONS: Record<string, any> = {
  leads_total: Users,
  entrada_total: ArrowRightLeft,
  reuniao_agendada_total: Calendar,
  reuniao_realizada_total: Briefcase,
  venda_total: Target,
};

const STAGE_COLORS = [
  { bg: 'bg-primary', text: 'text-primary-foreground' },
  { bg: 'bg-accent', text: 'text-accent-foreground' },
  { bg: 'bg-warning', text: 'text-warning-foreground' },
  { bg: 'bg-success', text: 'text-success-foreground' },
  { bg: 'bg-chart-5', text: 'text-foreground' },
];

const formatInteger = (value: number) => {
  return (value || 0).toLocaleString('pt-BR');
};

const formatPercent = (value: number) => {
  return `${((value || 0) * 100).toFixed(1)}%`;
};

export default function FunnelView({ 
  data, 
  spec, 
  previousData = [],
  comparisonEnabled = false 
}: FunnelViewProps) {
  // Aggregate totals for the period
  const aggregates = useMemo(() => {
    if (data.length === 0) return {};
    
    const sums: Record<string, number> = {};
    
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (typeof row[key] === 'number') {
          sums[key] = (sums[key] || 0) + row[key];
        }
      });
    });
    
    return sums;
  }, [data]);

  // Previous period aggregates
  const previousAggregates = useMemo(() => {
    if (!previousData || previousData.length === 0) return {};
    
    const sums: Record<string, number> = {};
    
    previousData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (typeof row[key] === 'number') {
          sums[key] = (sums[key] || 0) + row[key];
        }
      });
    });
    
    return sums;
  }, [previousData]);

  // Calculate variation
  const getVariation = (key: string) => {
    if (!comparisonEnabled || !previousAggregates[key]) return null;
    const current = aggregates[key] || 0;
    const previous = previousAggregates[key] || 0;
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  // Funnel stages configuration
  const funnelStages = spec?.funnelStages || {
    leads_total: 'Leads',
    entrada_total: 'Entradas',
    reuniao_agendada_total: 'Reuniões Agendadas',
    reuniao_realizada_total: 'Reuniões Realizadas',
    venda_total: 'Vendas'
  };

  const stageKeys = Object.keys(funnelStages);
  const maxValue = Math.max(...stageKeys.map(k => aggregates[k] || 0));

  // Loss columns
  const lossColumns = spec?.lossColumns || ['falta_total', 'desmarque_total'];
  const losses = lossColumns.filter((col: string) => aggregates[col] !== undefined);

  // Taxa columns
  const taxaColumns = spec?.taxaColumns || [
    'taxa_entrada',
    'taxa_reuniao_agendada', 
    'taxa_comparecimento',
    'taxa_venda_pos_reuniao',
    'taxa_venda_total'
  ];

  // Calculate taxas if not present in data
  const calculatedTaxas = useMemo(() => {
    const result: Record<string, number> = {};
    
    // Check if we need to calculate or use existing
    taxaColumns.forEach((col: string) => {
      if (aggregates[col] !== undefined) {
        result[col] = aggregates[col];
      }
    });
    
    // Calculate missing taxas
    if (result.taxa_entrada === undefined && aggregates.leads_total && aggregates.entrada_total) {
      result.taxa_entrada = aggregates.entrada_total / aggregates.leads_total;
    }
    if (result.taxa_reuniao_agendada === undefined && aggregates.entrada_total && aggregates.reuniao_agendada_total) {
      result.taxa_reuniao_agendada = aggregates.reuniao_agendada_total / aggregates.entrada_total;
    }
    if (result.taxa_comparecimento === undefined && aggregates.reuniao_agendada_total && aggregates.reuniao_realizada_total) {
      result.taxa_comparecimento = aggregates.reuniao_realizada_total / aggregates.reuniao_agendada_total;
    }
    if (result.taxa_venda_total === undefined && aggregates.leads_total && aggregates.venda_total) {
      result.taxa_venda_total = aggregates.venda_total / aggregates.leads_total;
    }
    if (result.taxa_venda_pos_reuniao === undefined && aggregates.reuniao_realizada_total && aggregates.venda_total) {
      result.taxa_venda_pos_reuniao = aggregates.venda_total / aggregates.reuniao_realizada_total;
    }
    
    return result;
  }, [aggregates, taxaColumns]);

  const TAXA_LABELS: Record<string, string> = {
    taxa_entrada: 'Taxa de Entrada',
    taxa_reuniao_agendada: 'Taxa de Agendamento',
    taxa_comparecimento: 'Taxa de Comparecimento',
    taxa_venda_pos_reuniao: 'Taxa de Venda (pós-reunião)',
    taxa_venda_total: 'Taxa de Conversão Total'
  };

  const LOSS_LABELS: Record<string, string> = {
    falta_total: 'Faltas',
    desmarque_total: 'Desmarques'
  };

  return (
    <div className="space-y-6">
      {/* Funnel Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funil de Conversão</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stageKeys.map((key, index) => {
              const value = aggregates[key] || 0;
              const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const Icon = STAGE_ICONS[key] || Users;
              const label = funnelStages[key];
              const colors = STAGE_COLORS[index % STAGE_COLORS.length];
              const variation = getVariation(key);
              
              // Calculate conversion from previous stage
              let conversionFromPrev = null;
              if (index > 0) {
                const prevKey = stageKeys[index - 1];
                const prevValue = aggregates[prevKey] || 0;
                if (prevValue > 0) {
                  conversionFromPrev = (value / prevValue) * 100;
                }
              }
              
              return (
                <div key={key} className="relative">
                  <div className="flex items-center gap-4">
                    {/* Stage indicator */}
                    <div className={cn(
                      "flex items-center justify-center w-11 h-11 rounded-xl shrink-0 shadow-sm",
                      colors.bg, colors.text
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    
                    {/* Bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <span className="text-sm font-medium truncate">{label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xl font-bold tabular-nums">{formatInteger(value)}</span>
                          {conversionFromPrev !== null && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {conversionFromPrev.toFixed(1)}%
                            </span>
                          )}
                          {variation !== null && (
                            <span className={cn(
                              "flex items-center text-xs gap-0.5",
                              variation > 0 ? "text-success" : "text-destructive"
                            )}>
                              {variation > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {Math.abs(variation).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-lg h-6 overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-700 rounded-lg",
                            colors.bg
                          )}
                          style={{ width: `${Math.max(widthPercent, 3)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Arrow between stages */}
                  {index < stageKeys.length - 1 && (
                    <div className="flex justify-start ml-[30px] my-0.5">
                      <ArrowDown className="h-3 w-3 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Losses */}
        {losses.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Perdas no Funil
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {losses.map((col: string) => {
                  const variation = getVariation(col);
                  return (
                    <div key={col} className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/10">
                      <XCircle className="h-8 w-8 text-destructive shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{LOSS_LABELS[col] || col}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold tabular-nums">{formatInteger(aggregates[col])}</p>
                          {variation !== null && (
                            <span className={cn(
                              "text-xs",
                              // For losses, increase is bad, decrease is good
                              variation > 0 ? "text-destructive" : "text-success"
                            )}>
                              {variation > 0 ? '+' : ''}{variation.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Conversion Rates */}
        <Card className={losses.length === 0 ? "lg:col-span-2" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Taxas de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "grid gap-3",
              losses.length === 0 ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2"
            )}>
              {Object.entries(calculatedTaxas).map(([key, value]) => (
                <div key={key} className="p-4 rounded-xl bg-muted/50 border border-border/50">
                  <p className="text-xs text-muted-foreground mb-1">{TAXA_LABELS[key] || key}</p>
                  <p className="text-2xl font-bold text-primary tabular-nums">{formatPercent(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
