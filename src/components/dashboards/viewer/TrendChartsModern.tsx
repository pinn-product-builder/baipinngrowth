import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ComposedChart,
  LineChart, 
  Line, 
  AreaChart,
  Area,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format, parseISO, startOfWeek, startOfMonth, getWeek, getMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getColumnLabel, formatMetricValue } from './labelMaps';

interface TrendChartsModernProps {
  data: any[];
  previousData?: any[];
  comparisonEnabled?: boolean;
  className?: string;
}

type Aggregation = 'day' | 'week' | 'month';

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0);

const formatInteger = (value: number) => 
  (value || 0).toLocaleString('pt-BR');

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM', { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const formatDateFull = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), "dd 'de' MMMM", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[180px]">
      <p className="font-medium text-sm mb-2 pb-2 border-b">{formatDateFull(label)}</p>
      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-muted-foreground">{entry.name}</span>
            </div>
            <span className="text-sm font-medium tabular-nums">
              {entry.dataKey.includes('custo') || entry.dataKey.includes('cpl') || entry.dataKey.includes('cac')
                ? formatCurrency(entry.value)
                : formatInteger(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function TrendChartsModern({
  data,
  previousData = [],
  comparisonEnabled = false,
  className,
}: TrendChartsModernProps) {
  const [aggregation, setAggregation] = useState<Aggregation>('day');
  
  // Aggregate data based on selection
  const aggregatedData = useMemo(() => {
    if (aggregation === 'day') return data;
    
    const groups = new Map<string, any>();
    
    data.forEach(row => {
      const date = parseISO(row.dia);
      let key: string;
      
      if (aggregation === 'week') {
        key = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      } else {
        key = format(startOfMonth(date), 'yyyy-MM');
      }
      
      if (!groups.has(key)) {
        groups.set(key, { dia: key, count: 0 });
      }
      
      const group = groups.get(key)!;
      group.count++;
      
      // Sum numeric values
      Object.entries(row).forEach(([k, v]) => {
        if (typeof v === 'number' && k !== 'count') {
          group[k] = (group[k] || 0) + v;
        }
      });
    });
    
    // Calculate averages for rates
    const result = Array.from(groups.values()).map(group => {
      if (group.leads_total > 0 && group.custo_total) {
        group.cpl = group.custo_total / group.leads_total;
      }
      if (group.venda_total > 0 && group.custo_total) {
        group.cac = group.custo_total / group.venda_total;
      }
      return group;
    });
    
    return result.sort((a, b) => a.dia.localeCompare(b.dia));
  }, [data, aggregation]);

  // Merge with previous period data
  const comparisonData = useMemo(() => {
    if (!comparisonEnabled || previousData.length === 0) return aggregatedData;
    
    return aggregatedData.map((row, index) => ({
      ...row,
      custo_total_prev: previousData[index]?.custo_total,
      leads_total_prev: previousData[index]?.leads_total,
      cpl_prev: previousData[index]?.cpl,
      cac_prev: previousData[index]?.cac,
    }));
  }, [aggregatedData, previousData, comparisonEnabled]);

  // Calculate averages for reference lines
  const averages = useMemo(() => {
    if (data.length === 0) return { cpl: 0, cac: 0 };
    
    const cplValues = data.map(r => r.cpl).filter(v => v && isFinite(v));
    const cacValues = data.map(r => r.cac).filter(v => v && isFinite(v));
    
    return {
      cpl: cplValues.length > 0 ? cplValues.reduce((a, b) => a + b, 0) / cplValues.length : 0,
      cac: cacValues.length > 0 ? cacValues.reduce((a, b) => a + b, 0) / cacValues.length : 0,
    };
  }, [data]);

  const formatXAxis = (value: string) => {
    if (aggregation === 'day') return formatDate(value);
    if (aggregation === 'week') return `S${getWeek(parseISO(value))}`;
    return format(parseISO(value + '-01'), 'MMM', { locale: ptBR });
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Aggregation Controls */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">Agrupar por:</span>
        <div className="flex rounded-lg border p-0.5 bg-muted/50">
          {(['day', 'week', 'month'] as const).map((agg) => (
            <Button
              key={agg}
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-3 text-xs font-medium rounded-md",
                aggregation === agg && "bg-background shadow-sm"
              )}
              onClick={() => setAggregation(agg)}
            >
              {agg === 'day' ? 'Dia' : agg === 'week' ? 'Semana' : 'Mês'}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Custo x Leads */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Investimento × Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={comparisonData}>
                  <defs>
                    <linearGradient id="colorCusto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                  <XAxis 
                    dataKey="dia" 
                    tickFormatter={formatXAxis} 
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
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                  <Area 
                    yAxisId="left" 
                    type="monotone" 
                    dataKey="custo_total" 
                    name="Investimento" 
                    fill="url(#colorCusto)"
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                  />
                  {comparisonEnabled && (
                    <Line 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="custo_total_prev" 
                      name="Invest. (anterior)" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      dot={false}
                      opacity={0.5}
                    />
                  )}
                  <Bar 
                    yAxisId="right" 
                    dataKey="leads_total" 
                    name="Leads" 
                    fill="hsl(var(--accent))" 
                    radius={[4, 4, 0, 0]}
                    opacity={0.8}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* CPL x CAC */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">CPL × CAC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                  <XAxis 
                    dataKey="dia" 
                    tickFormatter={formatXAxis} 
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => `R$${v}`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                  {averages.cpl > 0 && (
                    <ReferenceLine 
                      y={averages.cpl} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="5 5"
                      strokeOpacity={0.5}
                    />
                  )}
                  <Line 
                    type="monotone" 
                    dataKey="cpl" 
                    name="CPL" 
                    stroke="hsl(38, 92%, 50%)" 
                    strokeWidth={2.5} 
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cac" 
                    name="CAC" 
                    stroke="hsl(0, 72%, 50%)" 
                    strokeWidth={2.5} 
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                  />
                  {comparisonEnabled && (
                    <>
                      <Line 
                        type="monotone" 
                        dataKey="cpl_prev" 
                        name="CPL (anterior)" 
                        stroke="hsl(38, 92%, 50%)" 
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        dot={false}
                        opacity={0.4}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cac_prev" 
                        name="CAC (anterior)" 
                        stroke="hsl(0, 72%, 50%)" 
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        dot={false}
                        opacity={0.4}
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
