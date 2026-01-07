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
  if (!dateStr) return '';
  try {
    return format(parseISO(dateStr), 'dd/MM', { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const formatDateFull = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return dateStr;
  }
};

// Helper to get the date field from a row (v3 uses 'day', legacy uses 'dia')
const getDateKey = (row: any): string => row.day || row.dia || '';

// Helper to get spend (v3 uses 'spend', legacy uses 'custo_total')
const getSpend = (row: any): number => row.spend ?? row.custo_total ?? 0;

// Helper to get leads (v3 uses 'leads_new', legacy uses 'leads_total')
const getLeads = (row: any): number => row.leads_new ?? row.leads_total ?? 0;

export default function TrendCharts({
  data,
  previousData = [],
  spec = {},
  className,
}: TrendChartsProps) {
  // Normalize data to have consistent field names
  const normalizedData = useMemo(() => {
    return data.map(row => ({
      ...row,
      // Normalize date field
      dia: getDateKey(row),
      // Normalize cost field
      custo_total: getSpend(row),
      // Normalize leads field
      leads_total: getLeads(row),
      // Keep original fields for v3 specific charts
      spend: getSpend(row),
      leads_new: getLeads(row),
    }));
  }, [data]);

  // Calculate moving averages
  const enrichedData = useMemo(() => {
    return normalizedData.map((row, index) => {
      const windowSize = 7;
      const start = Math.max(0, index - windowSize + 1);
      const window = normalizedData.slice(start, index + 1);
      
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
  }, [normalizedData]);

  // Calculate averages for reference lines
  const averages = useMemo(() => {
    if (normalizedData.length === 0) return {};
    
    const result: Record<string, number> = {};
    const keys = ['cpl', 'cac', 'leads_total', 'custo_total'];
    
    keys.forEach(key => {
      const values = normalizedData.map(r => r[key]).filter(v => typeof v === 'number');
      if (values.length > 0) {
        result[key] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    });
    
    return result;
  }, [normalizedData]);

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

        {/* CAC Trend or Meetings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {normalizedData.some(r => r.cac) ? 'Tendência de CAC' : 'Reuniões Agendadas'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={normalizedData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => normalizedData.some(r => r.cac) ? `R$${v}` : v} />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number, name: string) => [
                      normalizedData.some(r => r.cac) ? formatCurrency(value) : formatInteger(value),
                      name
                    ]}
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
                  {normalizedData.some(r => r.cac) ? (
                    <Area 
                      type="monotone" 
                      dataKey="cac" 
                      name="CAC" 
                      fill="hsl(0, 72%, 50% / 0.2)" 
                      stroke="hsl(0, 72%, 50%)" 
                      strokeWidth={2}
                    />
                  ) : (
                    <Area 
                      type="monotone" 
                      dataKey="meetings_scheduled" 
                      name="Reuniões" 
                      fill="hsl(38, 92%, 50% / 0.2)" 
                      stroke="hsl(38, 92%, 50%)" 
                      strokeWidth={2}
                    />
                  )}
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
                <LineChart data={normalizedData}>
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
                  {/* Legacy rate fields */}
                  {normalizedData.some(r => r.taxa_entrada) && (
                    <Line 
                      type="monotone" 
                      dataKey="taxa_entrada" 
                      name="Tx Entrada" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2} 
                      dot={false}
                    />
                  )}
                  {normalizedData.some(r => r.taxa_comparecimento) && (
                    <Line 
                      type="monotone" 
                      dataKey="taxa_comparecimento" 
                      name="Tx Comparec." 
                      stroke="hsl(38, 92%, 50%)" 
                      strokeWidth={2} 
                      dot={false}
                    />
                  )}
                  {normalizedData.some(r => r.taxa_venda_total) && (
                    <Line 
                      type="monotone" 
                      dataKey="taxa_venda_total" 
                      name="Tx Conversão" 
                      stroke="hsl(145, 65%, 40%)" 
                      strokeWidth={2} 
                      dot={false}
                    />
                  )}
                  {/* V3 rate fields - show if no legacy rates */}
                  {!normalizedData.some(r => r.taxa_entrada) && normalizedData.some(r => r.conv_lead_to_msg) && (
                    <Line 
                      type="monotone" 
                      dataKey="conv_lead_to_msg" 
                      name="Lead→Msg" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2} 
                      dot={false}
                    />
                  )}
                  {!normalizedData.some(r => r.taxa_comparecimento) && normalizedData.some(r => r.conv_msg_to_meeting) && (
                    <Line 
                      type="monotone" 
                      dataKey="conv_msg_to_meeting" 
                      name="Msg→Reunião" 
                      stroke="hsl(38, 92%, 50%)" 
                      strokeWidth={2} 
                      dot={false}
                    />
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
