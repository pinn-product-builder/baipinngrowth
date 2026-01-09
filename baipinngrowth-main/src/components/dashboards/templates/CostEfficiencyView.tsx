import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DollarSign } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CostEfficiencyViewProps {
  data: any[];
  spec: Record<string, any>;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const COST_LABELS: Record<string, string> = {
  custo_por_entrada: 'Custo por Entrada',
  custo_por_reuniao_agendada: 'Custo por Reunião Agendada',
  custo_por_reuniao_realizada: 'Custo por Reunião Realizada',
  cpl: 'CPL (Custo por Lead)',
  cac: 'CAC (Custo de Aquisição)',
};

const BAR_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export default function CostEfficiencyView({ data, spec }: CostEfficiencyViewProps) {
  // Calculate aggregated metrics
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
    
    // Calculate costs per stage if not present
    if (sums.custo_total !== undefined) {
      if (!sums.cpl && sums.leads_total && sums.leads_total > 0) {
        sums.cpl = sums.custo_total / sums.leads_total;
      }
      if (!sums.custo_por_entrada && sums.entrada_total && sums.entrada_total > 0) {
        sums.custo_por_entrada = sums.custo_total / sums.entrada_total;
      }
      if (!sums.custo_por_reuniao_agendada && sums.reuniao_agendada_total && sums.reuniao_agendada_total > 0) {
        sums.custo_por_reuniao_agendada = sums.custo_total / sums.reuniao_agendada_total;
      }
      if (!sums.custo_por_reuniao_realizada && sums.reuniao_realizada_total && sums.reuniao_realizada_total > 0) {
        sums.custo_por_reuniao_realizada = sums.custo_total / sums.reuniao_realizada_total;
      }
      if (!sums.cac && sums.venda_total && sums.venda_total > 0) {
        sums.cac = sums.custo_total / sums.venda_total;
      }
    }
    
    return sums;
  }, [data]);

  // KPIs to display
  const costKpis = ['cpl', 'custo_por_entrada', 'custo_por_reuniao_agendada', 'custo_por_reuniao_realizada', 'cac'];
  const availableKpis = costKpis.filter(k => aggregates[k] !== undefined && aggregates[k] !== null);

  // Bar chart data
  const barChartData = availableKpis.map((key, index) => ({
    name: COST_LABELS[key] || key,
    value: aggregates[key],
    fill: BAR_COLORS[index % BAR_COLORS.length]
  }));

  // Table data - daily costs
  const tableData = useMemo(() => {
    return data.map(row => {
      const calculated = { ...row };
      
      // Calculate daily costs if not present
      if (row.custo_total !== undefined) {
        if (!calculated.cpl && row.leads_total && row.leads_total > 0) {
          calculated.cpl = row.custo_total / row.leads_total;
        }
        if (!calculated.custo_por_entrada && row.entrada_total && row.entrada_total > 0) {
          calculated.custo_por_entrada = row.custo_total / row.entrada_total;
        }
        if (!calculated.custo_por_reuniao_agendada && row.reuniao_agendada_total && row.reuniao_agendada_total > 0) {
          calculated.custo_por_reuniao_agendada = row.custo_total / row.reuniao_agendada_total;
        }
        if (!calculated.custo_por_reuniao_realizada && row.reuniao_realizada_total && row.reuniao_realizada_total > 0) {
          calculated.custo_por_reuniao_realizada = row.custo_total / row.reuniao_realizada_total;
        }
        if (!calculated.cac && row.venda_total && row.venda_total > 0) {
          calculated.cac = row.custo_total / row.venda_total;
        }
      }
      
      return calculated;
    });
  }, [data]);

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {availableKpis.map((key) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{COST_LABELS[key] || key}</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(aggregates[key])}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Custo por Etapa do Funil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} className="text-xs" />
                <YAxis type="category" dataKey="name" width={180} className="text-xs" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {barChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Custos por Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead className="text-right">Custo Total</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                  <TableHead className="text-right">Custo/Entrada</TableHead>
                  <TableHead className="text-right">Custo/Reu. Ag.</TableHead>
                  <TableHead className="text-right">Custo/Reu. Real.</TableHead>
                  <TableHead className="text-right">CAC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((row) => (
                  <TableRow key={row.dia}>
                    <TableCell>{formatDate(row.dia)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.custo_total)}</TableCell>
                    <TableCell className="text-right">{row.cpl ? formatCurrency(row.cpl) : '-'}</TableCell>
                    <TableCell className="text-right">{row.custo_por_entrada ? formatCurrency(row.custo_por_entrada) : '-'}</TableCell>
                    <TableCell className="text-right">{row.custo_por_reuniao_agendada ? formatCurrency(row.custo_por_reuniao_agendada) : '-'}</TableCell>
                    <TableCell className="text-right">{row.custo_por_reuniao_realizada ? formatCurrency(row.custo_por_reuniao_realizada) : '-'}</TableCell>
                    <TableCell className="text-right">{row.cac ? formatCurrency(row.cac) : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
