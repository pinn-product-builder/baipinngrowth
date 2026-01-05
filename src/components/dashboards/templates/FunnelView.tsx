import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, Users, ArrowRightLeft, Calendar, Briefcase, Target, XCircle, AlertTriangle } from 'lucide-react';

interface FunnelViewProps {
  data: any[];
  spec: Record<string, any>;
}

const STAGE_ICONS: Record<string, any> = {
  leads_total: Users,
  entrada_total: ArrowRightLeft,
  reuniao_agendada_total: Calendar,
  reuniao_realizada_total: Briefcase,
  venda_total: Target,
};

const STAGE_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-green-500',
];

const formatInteger = (value: number) => {
  return (value || 0).toLocaleString('pt-BR');
};

const formatPercent = (value: number) => {
  return `${((value || 0) * 100).toFixed(1)}%`;
};

export default function FunnelView({ data, spec }: FunnelViewProps) {
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
          <CardTitle>Funil de Conversão</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stageKeys.map((key, index) => {
              const value = aggregates[key] || 0;
              const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const Icon = STAGE_ICONS[key] || Users;
              const label = funnelStages[key];
              
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
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${STAGE_COLORS[index % STAGE_COLORS.length]} text-white`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    
                    {/* Bar */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{formatInteger(value)}</span>
                          {conversionFromPrev !== null && (
                            <span className="text-xs text-muted-foreground">
                              ({conversionFromPrev.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-8 overflow-hidden">
                        <div 
                          className={`h-full ${STAGE_COLORS[index % STAGE_COLORS.length]} transition-all duration-500 rounded-full`}
                          style={{ width: `${Math.max(widthPercent, 2)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Arrow between stages */}
                  {index < stageKeys.length - 1 && (
                    <div className="flex justify-center my-1">
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Losses */}
      {losses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Perdas no Funil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {losses.map((col: string) => (
                <div key={col} className="flex items-center gap-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <XCircle className="h-8 w-8 text-destructive" />
                  <div>
                    <p className="text-sm text-muted-foreground">{LOSS_LABELS[col] || col}</p>
                    <p className="text-2xl font-bold">{formatInteger(aggregates[col])}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversion Rates */}
      <Card>
        <CardHeader>
          <CardTitle>Taxas de Conversão</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Object.entries(calculatedTaxas).map(([key, value]) => (
              <div key={key} className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">{TAXA_LABELS[key] || key}</p>
                <p className="text-2xl font-bold text-primary">{formatPercent(value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
