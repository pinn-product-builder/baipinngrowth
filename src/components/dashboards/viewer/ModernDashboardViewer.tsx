import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format, subDays, differenceInDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, BarChart3, LogIn } from 'lucide-react';

import DashboardFilterBar, { DateRange } from './DashboardFilterBar';
import DashboardTabs, { TabsContent, TabType } from './DashboardTabs';
import KPICard from './KPICard';
import AlertsInsights from './AlertsInsights';
import DetailDrawer from './DetailDrawer';
import EnhancedDataTable from './EnhancedDataTable';
import TrendCharts from './TrendCharts';
import { generateTemplateConfig, TemplateConfig } from './templateEngine';

import ExecutiveView from '../templates/ExecutiveView';
import FunnelView from '../templates/FunnelView';
import CostEfficiencyView from '../templates/CostEfficiencyView';

interface ModernDashboardViewerProps {
  dashboardId: string;
  dashboardSpec?: Record<string, any>;
  templateKind?: string;
  detectedColumns?: string[];
  dashboardName?: string;
}

interface AggregatedData {
  [key: string]: number;
}

// Session expired error component
function SessionExpiredView({ onLogin }: { onLogin: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-warning/10 p-4 mb-4">
          <LogIn className="h-8 w-8 text-warning" />
        </div>
        <h3 className="text-lg font-medium mb-1">Sessão expirada</h3>
        <p className="text-muted-foreground text-sm max-w-md mb-4">
          Sua sessão expirou ou você foi deslogado. Faça login novamente para continuar.
        </p>
        <Button onClick={onLogin}>
          <LogIn className="mr-2 h-4 w-4" />
          Fazer login
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ModernDashboardViewer({
  dashboardId,
  dashboardSpec = {},
  templateKind = 'costs_funnel_daily',
  detectedColumns = [],
  dashboardName = 'Dashboard',
}: ModernDashboardViewerProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // State
  const [data, setData] = useState<any[]>([]);
  const [previousData, setPreviousData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<{ message: string; type?: string; details?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: subDays(new Date(), 30),
    end: new Date(),
  });
  const [previousRange, setPreviousRange] = useState<DateRange | undefined>();
  const [activeTab, setActiveTab] = useState<TabType>('executivo');
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Generate template config from columns
  const templateConfig: TemplateConfig = useMemo(() => {
    const columns = detectedColumns.length > 0 
      ? detectedColumns 
      : data.length > 0 ? Object.keys(data[0]) : [];
    return generateTemplateConfig(columns, templateKind, dashboardSpec);
  }, [detectedColumns, data, templateKind, dashboardSpec]);

  // Aggregate data for KPIs and insights
  const aggregatedData: AggregatedData = useMemo(() => {
    if (data.length === 0) return {};
    
    const sums: AggregatedData = {};
    data.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'number') {
          sums[key] = (sums[key] || 0) + value;
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
      if (sums.entrada_total && sums.entrada_total > 0) {
        sums.custo_por_entrada = sums.custo_total / sums.entrada_total;
      }
    }
    
    // Calculate rates
    if (sums.leads_total && sums.entrada_total) {
      sums.taxa_entrada = sums.entrada_total / sums.leads_total;
    }
    if (sums.leads_total && sums.venda_total) {
      sums.taxa_venda_total = sums.venda_total / sums.leads_total;
    }
    if (sums.reuniao_agendada_total && sums.reuniao_realizada_total) {
      sums.taxa_comparecimento = sums.reuniao_realizada_total / sums.reuniao_agendada_total;
    }
    
    return sums;
  }, [data]);

  const previousAggregated: AggregatedData = useMemo(() => {
    if (previousData.length === 0) return {};
    
    const sums: AggregatedData = {};
    previousData.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'number') {
          sums[key] = (sums[key] || 0) + value;
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
    
    if (sums.leads_total && sums.entrada_total) {
      sums.taxa_entrada = sums.entrada_total / sums.leads_total;
    }
    if (sums.leads_total && sums.venda_total) {
      sums.taxa_venda_total = sums.venda_total / sums.leads_total;
    }
    
    return sums;
  }, [previousData]);

  // Fetch data using supabase.functions.invoke
  const fetchData = useCallback(async (fetchPrev = false) => {
    setIsRefreshing(true);
    setError(null);
    setSessionExpired(false);

    try {
      // Check session first
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !sessionData.session) {
        console.warn('Session invalid or expired');
        setSessionExpired(true);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const startStr = format(dateRange.start, 'yyyy-MM-dd');
      const endStr = format(dateRange.end, 'yyyy-MM-dd');
      
      // Use supabase.functions.invoke instead of raw fetch
      // This automatically sends the user's JWT
      const { data: result, error: fnError } = await supabase.functions.invoke('dashboard-data', {
        body: {
          dashboard_id: dashboardId,
          start: startStr,
          end: endStr,
        },
      });

      // Handle errors
      if (fnError) {
        console.error('Edge function error:', fnError);
        
        // Check for auth errors (401)
        if (fnError.message?.includes('401') || fnError.message?.includes('Unauthorized') || fnError.message?.includes('Invalid JWT')) {
          setSessionExpired(true);
          toast({ 
            title: 'Sessão expirada', 
            description: 'Faça login novamente para continuar.',
            variant: 'destructive'
          });
          return;
        }
        
        throw {
          message: fnError.message || 'Erro ao carregar dados',
          type: 'edge_function_error',
          details: fnError.context?.message,
        };
      }

      // Check for error in response body
      if (result?.error) {
        // Check if it's an auth error
        if (result.error.includes('autenticado') || result.error.includes('autorizado')) {
          setSessionExpired(true);
          return;
        }
        
        throw {
          message: result.error,
          type: result.error_type || 'generic',
          details: result.details,
        };
      }

      setData(result?.data || []);

      // Fetch previous period if comparison enabled
      if (fetchPrev && previousRange) {
        const prevStartStr = format(previousRange.start, 'yyyy-MM-dd');
        const prevEndStr = format(previousRange.end, 'yyyy-MM-dd');

        const { data: prevResult, error: prevError } = await supabase.functions.invoke('dashboard-data', {
          body: {
            dashboard_id: dashboardId,
            start: prevStartStr,
            end: prevEndStr,
          },
        });

        if (!prevError && prevResult?.data) {
          setPreviousData(prevResult.data);
        }
      } else {
        setPreviousData([]);
      }

    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError({
        message: err.message || 'Erro ao carregar dados',
        type: err.type,
        details: err.details,
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dashboardId, dateRange, previousRange, toast]);

  // Initial fetch
  useEffect(() => {
    fetchData(comparisonEnabled);
  }, [dashboardId]);

  // Refetch when date range changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchData(comparisonEnabled);
    }, 300);
    return () => clearTimeout(timeout);
  }, [dateRange, comparisonEnabled]);

  // Handle date range change from filter bar
  const handleDateRangeChange = useCallback((range: DateRange, prevRange?: DateRange) => {
    setDateRange(range);
    setPreviousRange(prevRange);
  }, []);

  // Handle copy link
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({ title: 'Link copiado!' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  }, [toast]);

  // Handle export
  const handleExport = useCallback(() => {
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${dashboardName}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    
    toast({ title: 'Exportado!', description: 'CSV baixado.' });
  }, [data, dashboardName, toast]);

  // Handle row click for drilldown
  const handleRowClick = useCallback((row: any, index: number) => {
    setSelectedRow(row);
    
    // Find previous day's data for comparison
    const dateCol = templateConfig.dateColumn;
    if (dateCol && row[dateCol]) {
      const currentDate = parseISO(row[dateCol]);
      const prevRow = data.find(r => {
        if (!r[dateCol]) return false;
        const d = parseISO(r[dateCol]);
        return differenceInDays(currentDate, d) === 1;
      });
      setSelectedRow({ current: row, previous: prevRow || null });
    }
    
    setDrawerOpen(true);
  }, [data, templateConfig.dateColumn]);

  // Goals from spec for alerts
  const goals = useMemo(() => {
    const g = templateConfig.goals || {};
    const result: Array<{ metric: string; operator: '<=' | '>='; value: number; label?: string }> = [];
    
    if (g.cpl) result.push({ metric: 'cpl', operator: '<=', value: g.cpl, label: 'CPL' });
    if (g.cac) result.push({ metric: 'cac', operator: '<=', value: g.cac, label: 'CAC' });
    if (g.taxa_entrada) result.push({ metric: 'taxa_entrada', operator: '>=', value: g.taxa_entrada, label: 'Taxa de Entrada' });
    if (g.taxa_comparecimento) result.push({ metric: 'taxa_comparecimento', operator: '>=', value: g.taxa_comparecimento, label: 'Taxa de Comparecimento' });
    
    return result;
  }, [templateConfig.goals]);

  // Sparkline data per KPI
  const sparklines = useMemo(() => {
    const result: Record<string, number[]> = {};
    templateConfig.kpis.forEach(kpi => {
      result[kpi] = data.map(row => row[kpi] || 0);
    });
    return result;
  }, [data, templateConfig.kpis]);

  // Handle login redirect
  const handleLoginRedirect = useCallback(() => {
    navigate('/auth');
  }, [navigate]);

  // Session expired state
  if (sessionExpired) {
    return <SessionExpiredView onLogin={handleLoginRedirect} />;
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[1,2,3,4,5,6,7].map(i => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <RefreshCw className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-medium mb-1">
            {error.type === 'timeout' ? 'Tempo esgotado' : 
             error.type === 'network' ? 'Erro de rede' :
             error.type === 'proxy_error' ? 'Erro do proxy' :
             'Falha ao obter dados'}
          </h3>
          <p className="text-muted-foreground text-sm max-w-md mb-2">{error.message}</p>
          {error.details && (
            <p className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded mb-4 max-w-md">
              {error.details}
            </p>
          )}
          <Button onClick={() => fetchData(comparisonEnabled)} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardFilterBar
          onDateRangeChange={handleDateRangeChange}
          onRefresh={() => fetchData(comparisonEnabled)}
          onCopyLink={handleCopyLink}
          onExport={handleExport}
          isRefreshing={isRefreshing}
          copied={copied}
          comparisonEnabled={comparisonEnabled}
          onComparisonToggle={setComparisonEnabled}
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">Sem dados no período</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Não encontramos dados para o período selecionado. Tente expandir o intervalo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <DashboardFilterBar
        onDateRangeChange={handleDateRangeChange}
        onRefresh={() => fetchData(comparisonEnabled)}
        onCopyLink={handleCopyLink}
        onExport={handleExport}
        isRefreshing={isRefreshing}
        copied={copied}
        comparisonEnabled={comparisonEnabled}
        onComparisonToggle={setComparisonEnabled}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {templateConfig.kpis.slice(0, 7).map(kpi => {
          if (aggregatedData[kpi] === undefined) return null;
          
          const format = kpi.includes('custo') || kpi === 'cpl' || kpi === 'cac' 
            ? 'currency' 
            : kpi.includes('taxa_') ? 'percent' : 'integer';
          
          const goalDirection = kpi === 'cpl' || kpi === 'cac' || kpi.includes('custo') 
            ? 'lower_better' 
            : 'higher_better';
          
          return (
            <KPICard
              key={kpi}
              label={kpi.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              value={aggregatedData[kpi]}
              previousValue={comparisonEnabled ? previousAggregated[kpi] : undefined}
              goal={templateConfig.goals[kpi]}
              goalDirection={goalDirection as any}
              format={format as any}
              sparklineData={sparklines[kpi]}
            />
          );
        })}
      </div>

      {/* Alerts & Insights */}
      {(goals.length > 0 || comparisonEnabled) && (
        <AlertsInsights
          data={aggregatedData}
          previousData={comparisonEnabled ? previousAggregated : undefined}
          goals={goals}
        />
      )}

      {/* Tabs */}
      <DashboardTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        enabledTabs={templateConfig.enabledTabs}
      >
        <TabsContent value="executivo" className="mt-6">
          <ExecutiveView 
            data={data} 
            spec={dashboardSpec}
            previousData={previousData}
            comparisonEnabled={comparisonEnabled}
          />
        </TabsContent>

        <TabsContent value="funil" className="mt-6">
          <FunnelView 
            data={data} 
            spec={dashboardSpec}
            previousData={previousData}
            comparisonEnabled={comparisonEnabled}
          />
        </TabsContent>

        <TabsContent value="eficiencia" className="mt-6">
          <CostEfficiencyView data={data} spec={dashboardSpec} />
        </TabsContent>

        <TabsContent value="tendencias" className="mt-6">
          <TrendCharts 
            data={data}
            previousData={previousData}
            spec={dashboardSpec}
          />
        </TabsContent>

        <TabsContent value="detalhes" className="mt-6">
          <EnhancedDataTable 
            data={data}
            spec={dashboardSpec}
            onRowClick={handleRowClick}
          />
        </TabsContent>
      </DashboardTabs>

      {/* Detail Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        rowData={selectedRow?.current || selectedRow}
        previousRowData={selectedRow?.previous}
        dateColumn={templateConfig.dateColumn}
      />
    </div>
  );
}
