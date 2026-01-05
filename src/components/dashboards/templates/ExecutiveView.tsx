import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { DollarSign, Users, TrendingUp, Target, ArrowRightLeft, Briefcase } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import KpiCard from '../shared/KpiCard';

interface ExecutiveViewProps {
  data: any[];
  spec: Record<string, any>;
  previousData?: any[];
  comparisonEnabled?: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const formatInteger = (value: number) => {
  return (value || 0).toLocaleString('pt-BR');
};

const KPI_ICONS: Record<string, any> = {
  custo_total: DollarSign,
  leads_total: Users,
  entrada_total: ArrowRightLeft,
  reuniao_realizada_total: Briefcase,
  venda_total: Target,
  cpl: TrendingUp,
  cac: DollarSign,
};

const KPI_LABELS: Record<string, string> = {
  custo_total: 'Investimento',
  leads_total: 'Leads',
  entrada_total: 'Entradas',
  reuniao_realizada_total: 'Reuniões Realizadas',
  venda_total: 'Vendas',
  cpl: 'CPL do Período',
  cac: 'CAC do Período',
};

const KPI_TOOLTIPS: Record<string, string> = {
  custo_total: 'Total investido em marketing no período selecionado.',
  leads_total: 'Total de leads gerados pelos canais de aquisição.',
  entrada_total: 'Leads que entraram no funil de vendas.',
  reuniao_realizada_total: 'Reuniões efetivamente realizadas com prospects.',
  venda_total: 'Vendas fechadas no período.',
  cpl: 'Custo Por Lead: investimento dividido pelo número de leads.',
  cac: 'Custo de Aquisição de Cliente: investimento dividido pelo número de vendas.',
};

export default function ExecutiveView({ 
  data, 
  spec, 
  previousData = [],
  comparisonEnabled = false 
}: ExecutiveViewProps) {
  // Calculate aggregated KPIs for the period
  const aggregatedKpis = useMemo(() => {
    if (data.length === 0) return {};

    const sums: Record<string, number> = {};
    const kpiList = spec?.kpis || ['custo_total', 'leads_total', 'entrada_total', 'reuniao_realizada_total', 'venda_total'];
    
    // Sum all numeric columns
    data.forEach(row => {
      kpiList.forEach((key: string) => {
        if (typeof row[key] === 'number') {
          sums[key] = (sums[key] || 0) + row[key];
        }
      });
    });

    // Calculate CPL and CAC from aggregates
    if (sums.custo_total !== undefined) {
      if (sums.leads_total && sums.leads_total > 0) {
        sums.cpl = sums.custo_total / sums.leads_total;
      }
      if (sums.venda_total && sums.venda_total > 0) {
        sums.cac = sums.custo_total / sums.venda_total;
      }
    }

    return sums;
  }, [data, spec]);

  // Calculate previous period aggregates
  const previousAggregates = useMemo(() => {
    if (!previousData || previousData.length === 0) return {};

    const sums: Record<string, number> = {};
    const kpiList = spec?.kpis || ['custo_total', 'leads_total', 'entrada_total', 'reuniao_realizada_total', 'venda_total'];
    
    previousData.forEach(row => {
      kpiList.forEach((key: string) => {
        if (typeof row[key] === 'number') {
          sums[key] = (sums[key] || 0) + row[key];
        }
      });
    });

    if (sums.custo_total !== undefined) {
      if (sums.leads_total && sums.leads_total > 0) {
        sums.cpl = sums.custo_total / sums.leads_total;
      }
      if (sums.venda_total && sums.venda_total > 0) {
        sums.cac = sums.custo_total / sums.venda_total;
      }
    }

    return sums;
  }, [previousData, spec]);

  // Get sparkline data for each KPI
  const sparklineData = useMemo(() => {
    const sparklines: Record<string, number[]> = {};
    const kpiList = ['custo_total', 'leads_total', 'cpl', 'cac', 'venda_total', 'entrada_total', 'reuniao_realizada_total'];
    
    kpiList.forEach(key => {
      sparklines[key] = data.map(row => row[key] || 0);
    });
    
    return sparklines;
  }, [data]);

  const formatting = spec?.formatting || {};
  const kpiList = [...(spec?.kpis || ['custo_total', 'leads_total', 'entrada_total', 'reuniao_realizada_total', 'venda_total']), 'cpl', 'cac'];
  const uniqueKpis = [...new Set(kpiList)];

  const formatValue = (key: string, value: number) => {
    const fmt = formatting[key];
    if (fmt === 'currency' || key === 'cpl' || key === 'cac' || key.includes('custo')) {
      return formatCurrency(value);
    }
    return formatInteger(value);
  };

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

  // Determine format type for KpiCard
  const getFormatType = (key: string): 'currency' | 'percent' | 'integer' => {
    if (key === 'cpl' || key === 'cac' || key.includes('custo')) return 'currency';
    if (key.startsWith('taxa_')) return 'percent';
    return 'integer';
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards - Grid with enterprise styling */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {uniqueKpis.map((key) => {
          if (aggregatedKpis[key] === undefined) return null;
          const Icon = KPI_ICONS[key] || TrendingUp;
          const showComparison = comparisonEnabled && previousAggregates[key] !== undefined;
          
          return (
            <KpiCard
              key={key}
              label={KPI_LABELS[key] || key}
              value={formatValue(key, aggregatedKpis[key])}
              icon={Icon}
              tooltip={KPI_TOOLTIPS[key]}
              currentValue={showComparison ? aggregatedKpis[key] : undefined}
              previousValue={showComparison ? previousAggregates[key] : undefined}
              sparklineData={sparklineData[key]}
              format={getFormatType(key)}
            />
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart: Custo e Leads por Dia */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custo e Leads por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="dia" 
                    tickFormatter={formatDate}
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis yAxisId="left" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number, name: string) => {
                      if (name === 'Custo') return formatCurrency(value);
                      return formatInteger(value);
                    }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="custo_total" 
                    name="Custo"
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="leads_total" 
                    name="Leads"
                    stroke="hsl(var(--accent))" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart: CPL e CAC por Dia */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CPL e CAC por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="dia" 
                    tickFormatter={formatDate}
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="cpl" 
                    name="CPL"
                    stroke="hsl(var(--warning))" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cac" 
                    name="CAC"
                    stroke="hsl(var(--destructive))" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
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
