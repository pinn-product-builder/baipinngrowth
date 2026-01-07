import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { 
  CalendarIcon, 
  RefreshCw, 
  DollarSign, 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  ArrowRightLeft, 
  Briefcase, 
  Minus,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateRange {
  start: Date;
  end: Date;
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

const DEFAULT_VIEW = 'vw_dashboard_daily_60d_v3';

export default function ExecutiveDash() {
  const { tenantId, user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    return {
      start: startParam ? parseISO(startParam) : subDays(new Date(), 30),
      end: endParam ? parseISO(endParam) : new Date(),
    };
  });

  // Fetch data using tenant context
  const fetchData = useCallback(async (showRefresh = false) => {
    if (!tenantId) {
      setError('Tenant não identificado');
      setIsLoading(false);
      return;
    }

    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const startStr = format(dateRange.start, 'yyyy-MM-dd');
      const endStr = format(dateRange.end, 'yyyy-MM-dd');

      // Call the dashboard-data edge function with tenant context
      const { data: result, error: fetchError } = await supabase.functions.invoke('dashboard-data', {
        body: {
          view: DEFAULT_VIEW,
          orgId: tenantId,
          start: startStr,
          end: endStr,
        },
      });

      if (fetchError) throw fetchError;

      if (result?.data) {
        // Sort by date
        const sortedData = [...result.data].sort((a, b) => 
          new Date(a.dia).getTime() - new Date(b.dia).getTime()
        );
        setData(sortedData);
      } else {
        setData([]);
      }
    } catch (err: any) {
      console.error('Error fetching executive data:', err);
      setError(err.message || 'Erro ao carregar dados');
      toast({
        title: 'Erro ao carregar dados',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tenantId, dateRange, toast]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update URL params when date changes
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('start', format(dateRange.start, 'yyyy-MM-dd'));
    newParams.set('end', format(dateRange.end, 'yyyy-MM-dd'));
    setSearchParams(newParams, { replace: true });
  }, [dateRange, setSearchParams, searchParams]);

  // Aggregated KPIs
  const aggregatedKpis = useMemo(() => {
    if (data.length === 0) return {};

    const sums: Record<string, number> = {};
    const kpiList = ['custo_total', 'leads_total', 'entrada_total', 'reuniao_realizada_total', 'venda_total'];
    
    data.forEach(row => {
      kpiList.forEach((key: string) => {
        if (typeof row[key] === 'number') {
          sums[key] = (sums[key] || 0) + row[key];
        }
      });
    });

    // Calculate derived metrics
    if (sums.custo_total !== undefined) {
      if (sums.leads_total && sums.leads_total > 0) {
        sums.cpl = sums.custo_total / sums.leads_total;
      }
      if (sums.venda_total && sums.venda_total > 0) {
        sums.cac = sums.custo_total / sums.venda_total;
      }
    }

    return sums;
  }, [data]);

  const uniqueKpis = ['custo_total', 'leads_total', 'entrada_total', 'reuniao_realizada_total', 'venda_total', 'cpl', 'cac'];

  const formatValue = (key: string, value: number) => {
    if (key === 'cpl' || key === 'cac' || key.includes('custo')) {
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

  const handleRefresh = () => {
    fetchData(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard Executivo"
          description="Visão geral dos principais indicadores"
        />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-[280px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-[280px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard Executivo"
          description="Visão geral dos principais indicadores"
        />
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-4 py-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-medium">Erro ao carregar dados</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={handleRefresh} variant="outline" className="ml-auto">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Dashboard Executivo"
          description="Visão geral dos principais indicadores"
        />
        
        <div className="flex items-center gap-2">
          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateRange.start, 'dd/MM/yyyy')} - {format(dateRange.end, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange.start}
                selected={{ from: dateRange.start, to: dateRange.end }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ start: range.from, end: range.to });
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
          
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {uniqueKpis.map((key) => {
          if (aggregatedKpis[key] === undefined) return null;
          const Icon = KPI_ICONS[key] || TrendingUp;
          
          return (
            <Card key={key} className="overflow-hidden">
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

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custo e Leads por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number, name: string) => {
                      if (name === 'Custo') return formatCurrency(value);
                      return formatInteger(value);
                    }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="custo_total" name="Custo" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="leads_total" name="Leads" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CPL e CAC por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={formatDateFull} formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="cpl" name="CPL" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cac" name="CAC" stroke="hsl(0, 72%, 50%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data info */}
      <div className="text-xs text-muted-foreground text-right">
        {data.length} registros • Atualizado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </div>
    </div>
  );
}
