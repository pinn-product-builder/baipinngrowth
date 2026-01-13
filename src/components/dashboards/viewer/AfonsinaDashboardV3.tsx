// ============================================================
// AFONSINA DASHBOARD V3 - Dashboard completo usando views v3
// ============================================================

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, subDays, parseISO, startOfDay, endOfDay, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RefreshCw, AlertCircle, TrendingUp, Calendar as CalendarIcon, GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AfonsinaKPICards from './AfonsinaKPICards';
import AfonsinaTrendCharts from './AfonsinaTrendCharts';
import AfonsinaFunnelChart from './AfonsinaFunnelChart';
import { useAfonsinaDashboardData } from '@/hooks/useAfonsinaDashboardData';

interface DateRange {
  start: Date;
  end: Date;
}

interface AfonsinaDashboardV3Props {
  dashboardId: string;
  dashboardName?: string;
  className?: string;
}

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
];

export default function AfonsinaDashboardV3({
  dashboardId,
  dashboardName = 'Dashboard Afonsina',
  className,
}: AfonsinaDashboardV3Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Date range from URL or default to last 30 days
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    
    if (startParam && endParam) {
      try {
        const start = parseISO(startParam);
        const end = parseISO(endParam);
        if (isValid(start) && isValid(end)) {
          return { start, end };
        }
      } catch {
        // Fallback to default
      }
    }
    
    return {
      start: startOfDay(subDays(new Date(), 30)),
      end: endOfDay(new Date()),
    };
  });
  
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'funnel' | 'efficiency'>('overview');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(30);
  
  // Format dates for API
  const startDate = format(dateRange.start, 'yyyy-MM-dd');
  const endDate = format(dateRange.end, 'yyyy-MM-dd');
  
  // Fetch data using the v3 hook
  const {
    kpis,
    previousKpis,
    dailySeries,
    previousDailySeries,
    funnelCurrent,
    isLoading,
    isError,
    error,
    refetch,
  } = useAfonsinaDashboardData({
    startDate,
    endDate,
    compareEnabled: comparisonEnabled,
    enabled: true,
  });
  
  // Handle preset selection
  const handlePresetClick = (days: number) => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(end, days));
    setDateRange({ start, end });
    setSelectedPreset(days);
    setSearchParams({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  };
  
  // Handle custom date selection
  const handleDateSelect = (date: Date | undefined, type: 'start' | 'end') => {
    if (!date) return;
    
    const newRange = {
      ...dateRange,
      [type]: type === 'start' ? startOfDay(date) : endOfDay(date),
    };
    
    setDateRange(newRange);
    setSelectedPreset(null);
    setSearchParams({
      start: format(newRange.start, 'yyyy-MM-dd'),
      end: format(newRange.end, 'yyyy-MM-dd'),
    });
  };
  
  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-6 p-6", className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  
  // Error state
  if (isError) {
    return (
      <div className={cn("p-6", className)}>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-medium mb-1">Erro ao carregar dados</h3>
            <p className="text-muted-foreground text-sm max-w-md mb-4">
              {error?.message || 'Ocorreu um erro ao buscar os dados do dashboard.'}
            </p>
            <Button onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className={cn("space-y-6", className)}>
      {/* Header with filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{dashboardName}</h1>
          <p className="text-sm text-muted-foreground">
            {format(dateRange.start, 'dd/MM/yyyy')} a {format(dateRange.end, 'dd/MM/yyyy')}
          </p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Presets */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            {PRESETS.map(({ label, days }) => (
              <Button
                key={days}
                variant={selectedPreset === days ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => handlePresetClick(days)}
              >
                {label}
              </Button>
            ))}
          </div>
          
          {/* Date pickers */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(dateRange.start, 'dd/MM', { locale: ptBR })} - {format(dateRange.end, 'dd/MM', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-50 bg-popover" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.start, to: dateRange.end }}
                onSelect={(range) => {
                  if (range?.from) handleDateSelect(range.from, 'start');
                  if (range?.to) handleDateSelect(range.to, 'end');
                }}
                locale={ptBR}
                numberOfMonths={2}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          {/* Comparison toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="compare"
              checked={comparisonEnabled}
              onCheckedChange={setComparisonEnabled}
            />
            <Label htmlFor="compare" className="text-xs flex items-center gap-1">
              <GitCompare className="h-3 w-3" />
              Comparar
            </Label>
          </div>
          
          {/* Refresh */}
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="funnel" className="gap-2">
            <Calendar className="h-4 w-4" />
            Funil
          </TabsTrigger>
          <TabsTrigger value="efficiency" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Eficiência
          </TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* KPI Cards */}
          <AfonsinaKPICards
            kpis={kpis}
            previousKpis={previousKpis}
            comparisonEnabled={comparisonEnabled}
          />
          
          {/* Trend Charts */}
          <AfonsinaTrendCharts
            dailySeries={dailySeries}
            previousDailySeries={previousDailySeries}
            comparisonEnabled={comparisonEnabled}
          />
        </TabsContent>
        
        {/* Funnel Tab */}
        <TabsContent value="funnel" className="mt-6 space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <AfonsinaFunnelChart funnelData={funnelCurrent} />
            
            {/* Funnel metrics summary */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-base font-medium mb-4">Métricas do Funil</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-muted-foreground">Total de Leads</span>
                    <span className="font-semibold">{kpis.leads_total.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-muted-foreground">Entradas</span>
                    <span className="font-semibold">{kpis.entradas_total.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-muted-foreground">Reuniões Agendadas</span>
                    <span className="font-semibold">{kpis.reunioes_agendadas.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-muted-foreground">Reuniões Realizadas</span>
                    <span className="font-semibold">{kpis.reunioes_realizadas.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">Vendas</span>
                    <span className="font-semibold text-primary">{kpis.vendas_total.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Efficiency Tab */}
        <TabsContent value="efficiency" className="mt-6 space-y-6">
          {/* Cost efficiency cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">💰 Investimento Total</p>
                <p className="text-2xl font-bold">
                  {kpis.investimento_total > 0 
                    ? `R$ ${kpis.investimento_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : '—'
                  }
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">📊 CPL</p>
                <p className="text-2xl font-bold">
                  {kpis.cpl !== null 
                    ? `R$ ${kpis.cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : '—'
                  }
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">📈 Custo por Entrada</p>
                <p className="text-2xl font-bold">
                  {kpis.custo_por_entrada !== null 
                    ? `R$ ${kpis.custo_por_entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : '—'
                  }
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">🎯 CAC</p>
                <p className="text-2xl font-bold">
                  {kpis.cac !== null 
                    ? `R$ ${kpis.cac.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : '—'
                  }
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Conversion rates */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-base font-medium mb-4">Taxas de Conversão</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Taxa de Entrada</p>
                  <p className="text-xl font-semibold">
                    {kpis.taxa_entrada !== null ? `${kpis.taxa_entrada.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taxa Reunião Agendada</p>
                  <p className="text-xl font-semibold">
                    {kpis.taxa_reuniao_agendada !== null ? `${kpis.taxa_reuniao_agendada.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taxa Comparecimento</p>
                  <p className="text-xl font-semibold">
                    {kpis.taxa_comparecimento !== null ? `${kpis.taxa_comparecimento.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taxa Venda (pós-reunião)</p>
                  <p className="text-xl font-semibold">
                    {kpis.taxa_venda_pos_reuniao !== null ? `${kpis.taxa_venda_pos_reuniao.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taxa Venda Total</p>
                  <p className="text-xl font-semibold text-primary">
                    {kpis.taxa_venda_total !== null ? `${kpis.taxa_venda_total.toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* CPL x CAC chart */}
          <AfonsinaTrendCharts
            dailySeries={dailySeries}
            previousDailySeries={previousDailySeries}
            comparisonEnabled={comparisonEnabled}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
