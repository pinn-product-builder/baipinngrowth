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

interface ExecutiveViewProps {
  data: any[];
  spec: Record<string, any>;
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

export default function ExecutiveView({ data, spec }: ExecutiveViewProps) {
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

  const formatting = spec?.formatting || {};
  const kpiList = [...(spec?.kpis || ['custo_total', 'leads_total', 'entrada_total', 'reuniao_realizada_total', 'venda_total']), 'cpl', 'cac'];
  const uniqueKpis = [...new Set(kpiList)];

  const formatValue = (key: string, value: number) => {
    const format = formatting[key];
    if (format === 'currency' || key === 'cpl' || key === 'cac' || key.includes('custo')) {
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

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {uniqueKpis.map((key) => {
          if (aggregatedKpis[key] === undefined) return null;
          const Icon = KPI_ICONS[key] || TrendingUp;
          return (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{KPI_LABELS[key] || key}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatValue(key, aggregatedKpis[key])}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Chart: Custo e Leads por Dia */}
      <Card>
        <CardHeader>
          <CardTitle>Custo e Leads por Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="dia" 
                  tickFormatter={formatDate}
                  className="text-xs"
                />
                <YAxis yAxisId="left" className="text-xs" />
                <YAxis yAxisId="right" orientation="right" className="text-xs" />
                <Tooltip 
                  labelFormatter={formatDateFull}
                  formatter={(value: number, name: string) => {
                    if (name === 'Custo') return formatCurrency(value);
                    return formatInteger(value);
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
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="leads_total" 
                  name="Leads"
                  stroke="hsl(var(--chart-2))" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Chart: CPL e CAC por Dia */}
      <Card>
        <CardHeader>
          <CardTitle>CPL e CAC por Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="dia" 
                  tickFormatter={formatDate}
                  className="text-xs"
                />
                <YAxis className="text-xs" />
                <Tooltip 
                  labelFormatter={formatDateFull}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="cpl" 
                  name="CPL"
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={2}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="cac" 
                  name="CAC"
                  stroke="hsl(var(--chart-4))" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
