import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
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
import { Download, RefreshCw, DollarSign, Users, TrendingUp, Target } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CustosFunilDiaData {
  dia: string;
  custo_total: number;
  leads_total: number;
  entrada_total: number;
  reuniao_agendada_total: number;
  reuniao_realizada_total: number;
  venda_total: number;
  cpl: number;
  cac: number;
  taxa_entrada: number;
  taxa_reuniao_agendada: number;
  taxa_comparecimento: number;
  taxa_venda_total: number;
}

interface DashboardCustosFunilProps {
  dashboardId: string;
}

const datePresets = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 60 dias', days: 60 },
  { label: 'Últimos 90 dias', days: 90 },
];

export default function DashboardCustosFunil({ dashboardId }: DashboardCustosFunilProps) {
  const [data, setData] = useState<CustosFunilDiaData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 60), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [preset, setPreset] = useState('60');
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await supabase.functions.invoke('dashboard-data', {
        body: null,
        headers: {},
      });

      // Use query params via URL
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Não autenticado');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const url = new URL(`${supabaseUrl}/functions/v1/dashboard-data`);
      url.searchParams.set('dashboard_id', dashboardId);
      url.searchParams.set('start', startDate);
      url.searchParams.set('end', endDate);

      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${res.status}`);
      }

      const result = await res.json();
      setData(result.data || []);

      if (result.cached) {
        toast({ 
          title: 'Dados do cache', 
          description: 'Exibindo dados em cache. Atualize para buscar dados frescos.',
          duration: 3000
        });
      }
    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError(err.message || 'Erro ao carregar dados');
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dashboardId, startDate, endDate]);

  const handlePresetChange = (days: string) => {
    setPreset(days);
    const daysNum = parseInt(days);
    setStartDate(format(subDays(new Date(), daysNum), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  // Calcular totais
  const totals = useMemo(() => {
    if (data.length === 0) return null;

    const sum = data.reduce((acc, row) => ({
      custo_total: acc.custo_total + (row.custo_total || 0),
      leads_total: acc.leads_total + (row.leads_total || 0),
      venda_total: acc.venda_total + (row.venda_total || 0),
    }), { custo_total: 0, leads_total: 0, venda_total: 0 });

    return {
      custo_total: sum.custo_total,
      leads_total: sum.leads_total,
      venda_total: sum.venda_total,
      cpl: sum.leads_total > 0 ? sum.custo_total / sum.leads_total : 0,
      cac: sum.venda_total > 0 ? sum.custo_total / sum.venda_total : 0,
    };
  }, [data]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const exportCSV = () => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => row[h as keyof CustosFunilDiaData]).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `custos_funil_${startDate}_${endDate}.csv`;
    link.click();
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={fetchData} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Período</Label>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {datePresets.map((p) => (
                <SelectItem key={p.days} value={String(p.days)}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Data Início</Label>
          <Input 
            type="date" 
            value={startDate} 
            onChange={(e) => {
              setStartDate(e.target.value);
              setPreset('');
            }}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label>Data Fim</Label>
          <Input 
            type="date" 
            value={endDate} 
            onChange={(e) => {
              setEndDate(e.target.value);
              setPreset('');
            }}
            className="w-[150px]"
          />
        </div>
        <Button onClick={fetchData} variant="outline" disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
        <Button onClick={exportCSV} variant="outline" disabled={data.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Cards de resumo */}
          {totals && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Custo Total</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totals.custo_total)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Leads Total</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totals.leads_total.toLocaleString('pt-BR')}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">CPL Médio</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totals.cpl)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Vendas Total</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totals.venda_total.toLocaleString('pt-BR')}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">CAC Médio</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totals.cac)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Gráfico 1: Custo e Leads */}
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
                      tickFormatter={(v) => {
                        try {
                          return format(parseISO(v), 'dd/MM', { locale: ptBR });
                        } catch {
                          return v;
                        }
                      }}
                      className="text-xs"
                    />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" />
                    <Tooltip 
                      labelFormatter={(v) => {
                        try {
                          return format(parseISO(v as string), 'dd/MM/yyyy', { locale: ptBR });
                        } catch {
                          return v;
                        }
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'Custo') return formatCurrency(value);
                        return value.toLocaleString('pt-BR');
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

          {/* Gráfico 2: CPL e CAC */}
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
                      tickFormatter={(v) => {
                        try {
                          return format(parseISO(v), 'dd/MM', { locale: ptBR });
                        } catch {
                          return v;
                        }
                      }}
                      className="text-xs"
                    />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      labelFormatter={(v) => {
                        try {
                          return format(parseISO(v as string), 'dd/MM/yyyy', { locale: ptBR });
                        } catch {
                          return v;
                        }
                      }}
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

          {/* Tabela */}
          <Card>
            <CardHeader>
              <CardTitle>Dados Detalhados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Entradas</TableHead>
                      <TableHead className="text-right">Reuniões Ag.</TableHead>
                      <TableHead className="text-right">Reuniões Real.</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">CPL</TableHead>
                      <TableHead className="text-right">CAC</TableHead>
                      <TableHead className="text-right">Taxa Entrada</TableHead>
                      <TableHead className="text-right">Taxa Venda</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row) => (
                      <TableRow key={row.dia}>
                        <TableCell>
                          {(() => {
                            try {
                              return format(parseISO(row.dia), 'dd/MM/yyyy', { locale: ptBR });
                            } catch {
                              return row.dia;
                            }
                          })()}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.custo_total || 0)}</TableCell>
                        <TableCell className="text-right">{(row.leads_total || 0).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right">{(row.entrada_total || 0).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right">{(row.reuniao_agendada_total || 0).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right">{(row.reuniao_realizada_total || 0).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right">{(row.venda_total || 0).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.cpl || 0)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.cac || 0)}</TableCell>
                        <TableCell className="text-right">{formatPercent(row.taxa_entrada || 0)}</TableCell>
                        <TableCell className="text-right">{formatPercent(row.taxa_venda_total || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
