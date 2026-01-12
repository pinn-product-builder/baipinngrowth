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
import { formatColumnValue, getColumnLabel } from './labelMap';

interface ExecutiveTrendChartsProps {
  data: Record<string, any>[];
  previousData?: Record<string, any>[];
  goals?: Record<string, number>;
  comparisonEnabled?: boolean;
  className?: string;
  /** Date column key from template config */
  dateColumn?: string;
}

type Aggregation = 'day' | 'week' | 'month';

const parseDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue === 'string') {
    try {
      return parseISO(dateValue);
    } catch {
      return null;
    }
  }
  return null;
};

const formatDate = (dateValue: any) => {
  const date = parseDate(dateValue);
  if (!date) return String(dateValue ?? '');
  try {
    return format(date, 'dd/MM', { locale: ptBR });
  } catch {
    return String(dateValue);
  }
};

const formatDateFull = (dateValue: any) => {
  const date = parseDate(dateValue);
  if (!date) return String(dateValue ?? '');
  try {
    return format(date, "dd 'de' MMMM", { locale: ptBR });
  } catch {
    return String(dateValue);
  }
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
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
                ? entry.name.includes('CPL') || entry.name.includes('CAC') || entry.name.includes('Custo')
                  ? formatColumnValue(entry.value, 'cpl')
                  : entry.name.includes('Taxa') || entry.name.includes('%')
                  ? formatColumnValue(entry.value, 'taxa_entrada')
                  : formatColumnValue(entry.value, 'leads_total')
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Detect date column from data
const DATE_COLUMN_PATTERNS = ['dia', 'date', 'data', 'created_at', 'Data de Criação', 'Data de entrada', 'Data Criação'];
const LEAD_COLUMN_PATTERNS = ['leads_total', 'entrada_total', 'ENTRADA', 'Leads', 'leads', 'entrada'];
const SALE_COLUMN_PATTERNS = ['venda_total', 'VENDA', 'Vendas', 'vendas', 'venda'];

function detectColumn(row: Record<string, any>, patterns: string[]): string | null {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const pattern of patterns) {
    const found = keys.find(k => k.toLowerCase() === pattern.toLowerCase() || k === pattern);
    if (found) return found;
  }
  return null;
}

export default function ExecutiveTrendCharts({
  data,
  previousData = [],
  goals = {},
  comparisonEnabled = false,
  className,
  dateColumn: dateColumnProp,
}: ExecutiveTrendChartsProps) {
  const [aggregation, setAggregation] = useState<Aggregation>('day');
  
  // Get custo_mensal from goals to calculate daily metrics
  const custoMensal = goals.custo_mensal ?? goals.investimento_mensal ?? 0;
  
  // Detect column names from actual data
  const firstRow = data[0] || {};
  const dateColumn = dateColumnProp || detectColumn(firstRow, DATE_COLUMN_PATTERNS) || 'dia';
  const leadColumn = detectColumn(firstRow, LEAD_COLUMN_PATTERNS);
  const saleColumn = detectColumn(firstRow, SALE_COLUMN_PATTERNS);
  
  // Helper to check if a value is truthy (handles "TRUE", true, 1, non-empty values)
  const isTruthy = (val: any): boolean => {
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val !== 0;
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      return lower === 'true' || lower === '1' || lower === 'sim' || lower === 'yes';
    }
    return true;
  };

  // Aggregate raw lead-level data by date
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    
    // Check if data is already aggregated (has numeric totals) or needs aggregation
    const firstRow = data[0];
    const isAlreadyAggregated = typeof firstRow.leads_total === 'number' || 
                                 typeof firstRow.entrada_total === 'number' ||
                                 typeof firstRow.custo_total === 'number';
    
    // If already aggregated, just normalize dates
    if (isAlreadyAggregated) {
      return data.map(row => {
        const dateValue = row[dateColumn] ?? row.dia;
        return {
          ...row,
          dia: dateValue instanceof Date ? dateValue.toISOString() : dateValue,
        };
      });
    }
    
    // Aggregate lead-level data by date
    const byDate = new Map<string, { 
      leads: number; 
      entradas: number; 
      vendas: number; 
      count: number 
    }>();
    
    data.forEach(row => {
      const rawDate = row[dateColumn] ?? row.dia;
      if (!rawDate) return;
      
      // Normalize date to YYYY-MM-DD format
      let dateKey: string;
      if (rawDate instanceof Date) {
        dateKey = rawDate.toISOString().split('T')[0];
      } else if (typeof rawDate === 'string') {
        // Handle "2025-12-09 11:15:54" format
        dateKey = rawDate.split(' ')[0].split('T')[0];
      } else {
        return;
      }
      
      const existing = byDate.get(dateKey) || { leads: 0, entradas: 0, vendas: 0, count: 0 };
      
      // Count entries where the column is truthy
      const isEntrada = leadColumn ? isTruthy(row[leadColumn]) : false;
      const isVenda = saleColumn ? isTruthy(row[saleColumn]) : false;
      
      existing.count += 1;
      existing.leads += 1; // Each row is a lead
      existing.entradas += isEntrada ? 1 : 0;
      existing.vendas += isVenda ? 1 : 0;
      
      byDate.set(dateKey, existing);
    });
    
    // Calculate totals for cost distribution
    const totalLeads = Array.from(byDate.values()).reduce((sum, d) => sum + d.leads, 0);
    const totalVendas = Array.from(byDate.values()).reduce((sum, d) => sum + d.vendas, 0);
    
    // Convert to array and calculate metrics
    const aggregated = Array.from(byDate.entries())
      .map(([date, values]) => {
        const dailyCost = totalLeads > 0 && custoMensal > 0
          ? (values.leads / totalLeads) * custoMensal
          : 0;
        
        const cpl = values.leads > 0 && dailyCost > 0 ? dailyCost / values.leads : null;
        const cac = values.vendas > 0 && dailyCost > 0 ? dailyCost / values.vendas : null;
        
        return {
          dia: date,
          leads_total: values.leads,
          entrada_total: values.entradas,
          venda_total: values.vendas,
          custo_total: dailyCost,
          cpl,
          cac,
        };
      })
      .sort((a, b) => a.dia.localeCompare(b.dia));
    
    return aggregated;
  }, [data, aggregation, custoMensal, dateColumn, leadColumn, saleColumn]);
  
  // Calculate averages for reference lines
  const averages = useMemo(() => {
    if (chartData.length === 0) return {};
    
    const result: Record<string, number> = {};
    const keys = ['cpl', 'cac', 'leads_total', 'custo_total'];
    
    keys.forEach(key => {
      const values = chartData.map(r => r[key]).filter(v => typeof v === 'number' && isFinite(v));
      if (values.length > 0) {
        result[key] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    });
    
    return result;
  }, [chartData]);
  
  if (data.length === 0) return null;
  
  return (
    <div className={cn("space-y-6", className)}>
      {/* Aggregation toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tendências</h3>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          {(['day', 'week', 'month'] as Aggregation[]).map((agg) => (
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
        {/* Chart 1: Custo x Leads (dual axis) */}
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
                    dataKey="dia" 
                    tickFormatter={formatDate} 
                    tick={{ fontSize: 11 }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    yAxisId="left"
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`}
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
                    dataKey="custo_total" 
                    name="Investimento" 
                    fill="hsl(var(--primary) / 0.3)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="leads_total" 
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
        
        {/* Chart 2: CPL x CAC */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>CPL × CAC</span>
              <div className="flex gap-2">
                {goals.cpl && (
                  <Badge variant="outline" className="text-xs font-normal text-success">
                    Meta CPL: {formatColumnValue(goals.cpl, 'cpl')}
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis 
                    dataKey="dia" 
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
                  
                  {/* Goal reference lines */}
                  {goals.cpl && (
                    <ReferenceLine 
                      y={goals.cpl} 
                      stroke="hsl(var(--success))" 
                      strokeDasharray="5 5"
                      strokeWidth={1.5}
                    />
                  )}
                  {averages.cpl && (
                    <ReferenceLine 
                      y={averages.cpl} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="3 3"
                      strokeWidth={1}
                      label={{ 
                        value: 'Média', 
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
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cac" 
                    name="CAC" 
                    stroke="hsl(0, 72%, 50%)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: 'hsl(0, 72%, 50%)' }}
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
                    dataKey="dia" 
                    tickFormatter={formatDate} 
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
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
                    name="Tx Entrada" 
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.1)"
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="taxa_comparecimento" 
                    name="Tx Comparecimento" 
                    stroke="hsl(38, 92%, 50%)"
                    fill="hsl(38, 92%, 50% / 0.1)"
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="taxa_venda_total" 
                    name="Tx Conversão" 
                    stroke="hsl(145, 65%, 40%)"
                    fill="hsl(145, 65%, 40% / 0.1)"
                    strokeWidth={2}
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
