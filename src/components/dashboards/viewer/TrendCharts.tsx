import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TrendChartsProps {
  data: any[];
  previousData?: any[];
  spec?: Record<string, any>;
  className?: string;
}

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatInteger = (value: number) => 
  (value || 0).toLocaleString('pt-BR');

const formatPercent = (value: number) => 
  `${((value || 0) * 100).toFixed(1)}%`;

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM', { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const formatDateFull = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return dateStr;
  }
};

export default function TrendCharts({
  data,
  previousData = [],
  spec = {},
  className,
}: TrendChartsProps) {
  // Calculate moving averages
  const enrichedData = useMemo(() => {
    return data.map((row, index) => {
      const windowSize = 7;
      const start = Math.max(0, index - windowSize + 1);
      const window = data.slice(start, index + 1);
      
      const cplSum = window.reduce((acc, r) => acc + (r.cpl || 0), 0);
      const cplAvg = cplSum / window.length;
      
      const leadsSum = window.reduce((acc, r) => acc + (r.leads_total || 0), 0);
      const leadsAvg = leadsSum / window.length;
      
      return {
        ...row,
        cpl_ma7: cplAvg,
        leads_ma7: leadsAvg,
      };
    });
  }, [data]);

  // Calculate averages for reference lines
  const averages = useMemo(() => {
    if (data.length === 0) return {};
    
    const result: Record<string, number> = {};
    const keys = ['cpl', 'cac', 'leads_total', 'custo_total'];
    
    keys.forEach(key => {
      const values = data.map(r => r[key]).filter(v => typeof v === 'number');
      if (values.length > 0) {
        result[key] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    });
    
    return result;
  }, [data]);

  // Goals from spec
  const goals = spec?.goals || {};

  return (
    <div className={className}>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* CPL Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendência de CPL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={enrichedData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  {averages.cpl && (
                    <ReferenceLine 
                      y={averages.cpl} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="5 5"
                      label={{ value: 'Média', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                  )}
                  {goals.cpl && (
                    <ReferenceLine 
                      y={goals.cpl} 
                      stroke="hsl(var(--success))" 
                      strokeDasharray="3 3"
                      label={{ value: 'Meta', fontSize: 10, fill: 'hsl(var(--success))' }}
                    />
                  )}
                  <Line 
                    type="monotone" 
                    dataKey="cpl" 
                    name="CPL" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cpl_ma7" 
                    name="Média 7d" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    opacity={0.6}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* CAC Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendência de CAC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number) => [formatCurrency(value), 'CAC']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  {goals.cac && (
                    <ReferenceLine 
                      y={goals.cac} 
                      stroke="hsl(var(--success))" 
                      strokeDasharray="3 3"
                      label={{ value: 'Meta', fontSize: 10, fill: 'hsl(var(--success))' }}
                    />
                  )}
                  <Area 
                    type="monotone" 
                    dataKey="cac" 
                    name="CAC" 
                    fill="hsl(0, 72%, 50% / 0.2)" 
                    stroke="hsl(0, 72%, 50%)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Volume Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Volume por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={enrichedData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number, name: string) => [formatInteger(value), name]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="leads_total" 
                    name="Leads" 
                    fill="hsl(var(--accent) / 0.3)" 
                    stroke="hsl(var(--accent))" 
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="leads_ma7" 
                    name="Média 7d" 
                    stroke="hsl(var(--accent))" 
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    opacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Conversion Rates Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taxas de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    domain={[0, 'auto']}
                  />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number, name: string) => [formatPercent(value), name]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="taxa_entrada" 
                    name="Tx Entrada" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2} 
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="taxa_comparecimento" 
                    name="Tx Comparec." 
                    stroke="hsl(38, 92%, 50%)" 
                    strokeWidth={2} 
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="taxa_venda_total" 
                    name="Tx Conversão" 
                    stroke="hsl(145, 65%, 40%)" 
                    strokeWidth={2} 
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
