// ============================================================
// AFONSINA TREND CHARTS - Gráficos usando dados v3
// ============================================================

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Bar,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { DailySeriesRow } from '@/hooks/useAfonsinaDashboardData';

interface AfonsinaTrendChartsProps {
  dailySeries: DailySeriesRow[];
  previousDailySeries?: DailySeriesRow[];
  comparisonEnabled?: boolean;
  className?: string;
}

const formatDate = (dateValue: string) => {
  try {
    return format(parseISO(dateValue), 'dd/MM', { locale: ptBR });
  } catch {
    return dateValue;
  }
};

const formatDateFull = (dateValue: string) => {
  try {
    return format(parseISO(dateValue), "dd 'de' MMMM", { locale: ptBR });
  } catch {
    return dateValue;
  }
};

const formatCurrency = (value: number) => {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatCurrencyShort = (value: number) => {
  if (value >= 1000) {
    return `R$${(value / 1000).toFixed(1)}k`;
  }
  return `R$${value.toFixed(0)}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
      <p className="text-sm font-medium mb-2">{formatDateFull(label)}</p>
      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-medium tabular-nums">
              {typeof entry.value === 'number' 
                ? entry.name.includes('CPL') || entry.name.includes('CAC') || entry.name.includes('Custo') || entry.name.includes('Investimento')
                  ? formatCurrency(entry.value)
                  : entry.name.includes('Taxa') || entry.name.includes('%')
                  ? `${entry.value.toFixed(1)}%`
                  : entry.value.toLocaleString('pt-BR')
                : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function AfonsinaTrendCharts({
  dailySeries,
  previousDailySeries,
  comparisonEnabled = false,
  className,
}: AfonsinaTrendChartsProps) {
  const [aggregation, setAggregation] = useState<'day' | 'week' | 'month'>('day');
  
  // Merge with previous data for comparison
  const chartData = useMemo(() => {
    if (dailySeries.length === 0) return [];
    return dailySeries;
  }, [dailySeries]);
  
  // Calculate averages for reference lines
  const averages = useMemo(() => {
    if (chartData.length === 0) return {};
    
    const result: Record<string, number> = {};
    const keys = ['cpl', 'leads', 'investimento'] as const;
    
    keys.forEach(key => {
      const values = chartData
        .map(r => r[key])
        .filter((v): v is number => typeof v === 'number' && isFinite(v));
      if (values.length > 0) {
        result[key] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    });
    
    return result;
  }, [chartData]);
  
  if (chartData.length === 0) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Sem dados para exibir no período selecionado
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className={cn("space-y-6", className)}>
      {/* Aggregation toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tendências</h3>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          {(['day', 'week', 'month'] as const).map((agg) => (
            <Button
              key={agg}
              variant={aggregation === agg ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setAggregation(agg)}
            >
              {agg === 'day' ? 'Dia' : agg === 'week' ? 'Semana' : 'Mês'}
            </Button>
          ))}
        </div>
      </div>
      
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Chart 1: Investimento x Leads (dual axis) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Investimento × Leads</span>
              {comparisonEnabled && (
                <Badge variant="outline" className="text-xs font-normal">
                  vs período anterior
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate} 
                    tick={{ fontSize: 11 }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    yAxisId="left"
                    tick={{ fontSize: 11 }} 
                    tickFormatter={formatCurrencyShort}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingTop: 16 }}
                  />
                  
                  <Bar 
                    yAxisId="left"
                    dataKey="investimento" 
                    name="Investimento" 
                    fill="hsl(var(--primary) / 0.3)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="leads" 
                    name="Leads" 
                    stroke="hsl(var(--accent))"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: 'hsl(var(--accent))' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        {/* Chart 2: CPL over time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>CPL ao Longo do Tempo</span>
              {averages.cpl && (
                <Badge variant="outline" className="text-xs font-normal">
                  Média CPL: {formatCurrency(averages.cpl)}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate} 
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => `R$${v.toFixed(0)}`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingTop: 16 }}
                  />
                  
                  {averages.cpl && (
                    <ReferenceLine 
                      y={averages.cpl} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="3 3"
                      strokeWidth={1}
                      label={{ 
                        value: 'Média CPL', 
                        position: 'right',
                        fontSize: 10, 
                        fill: 'hsl(var(--muted-foreground))' 
                      }}
                    />
                  )}
                  
                  <Line 
                    type="monotone" 
                    dataKey="cpl" 
                    name="CPL" 
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        {/* Chart 3: Conversion rates over time */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Taxas de Conversão ao Longo do Tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate} 
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    domain={[0, 'auto']}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingTop: 16 }}
                  />
                  
                  <Area 
                    type="monotone" 
                    dataKey="taxa_entrada" 
                    name="Taxa Entrada" 
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.1)"
                    strokeWidth={2}
                    connectNulls
                  />
                  <Area 
                    type="monotone" 
                    dataKey="taxa_reuniao_agendada" 
                    name="Taxa Reunião Agendada" 
                    stroke="hsl(38, 92%, 50%)"
                    fill="hsl(38, 92%, 50% / 0.1)"
                    strokeWidth={2}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
