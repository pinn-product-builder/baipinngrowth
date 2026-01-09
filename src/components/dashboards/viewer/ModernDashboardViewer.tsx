import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format, subDays, differenceInDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, BarChart3, LogIn, Bug, Clock, Table, Calendar, Wand2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

import DashboardFilterBar, { DateRange } from './DashboardFilterBar';
import DashboardTabs, { TabsContent, TabType } from './DashboardTabs';
import DetailDrawer from './DetailDrawer';
import EnhancedDataTable from './EnhancedDataTable';
import DiagnosticsDrawer from './DiagnosticsDrawer';
import ThemeToggle from './ThemeToggle';
import AIAnalystDrawer from './AIAnalystDrawer';
import AIAnalystButton from './AIAnalystButton';
import AIEditDrawer from './AIEditDrawer';
import { generateTemplateConfig, TemplateConfig, getDefaultTemplateConfig } from './templateEngine';
import { normalizeDataset, NormalizedDataset, formatValue } from './datasetNormalizer';
import { parseDashboardSpec, DashboardSpec } from './types/dashboardSpec';

// New executive components
import ExecutiveKPIRow from './ExecutiveKPIRow';
import ExecutiveFunnel from './ExecutiveFunnel';
import ExecutiveTrendCharts from './ExecutiveTrendCharts';
import DiagnosticsPanel from './DiagnosticsPanel';
import DecisionCenter from './DecisionCenterV2';
import DebugPanel from './DebugPanel';

interface ModernDashboardViewerProps {
  dashboardId: string;
  dashboardSpec?: Record<string, any>;
  templateKind?: string;
  detectedColumns?: string[];
  dashboardName?: string;
  defaultFilters?: {
    initial_date_range?: {
      start: string;
      end: string;
    };
  } | null;
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

// Compatibility mode view (fail-soft)
function CompatibilityModeView({ 
  data, 
  columns,
  warnings,
  onRowClick 
}: { 
  data: Record<string, any>[];
  columns: string[];
  warnings: string[];
  onRowClick?: (row: any, index: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
        <Table className="h-5 w-5 text-warning" />
        <div className="flex-1">
          <p className="text-sm font-medium text-warning">Modo compatibilidade</p>
          <p className="text-xs text-muted-foreground">
            Exibição simplificada devido a limitações de dados
          </p>
        </div>
        {warnings.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {warnings.length} aviso(s)
          </Badge>
        )}
      </div>
      
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {columns.slice(0, 10).map(col => (
                  <th key={col} className="px-4 py-3 text-left font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 50).map((row, i) => (
                <tr 
                  key={i} 
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => onRowClick?.(row, i)}
                >
                  {columns.slice(0, 10).map(col => (
                    <td key={col} className="px-4 py-2">
                      {formatValue(row[col], 'string')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.length > 50 && (
          <div className="p-3 border-t text-center text-sm text-muted-foreground">
            Exibindo 50 de {data.length} linhas
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ModernDashboardViewer({
  dashboardId,
  dashboardSpec: rawDashboardSpec = {},
  templateKind = 'costs_funnel_daily',
  detectedColumns = [],
  dashboardName = 'Dashboard',
  defaultFilters = null,
}: ModernDashboardViewerProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Calculate smart initial date range based on defaultFilters
  const getInitialDateRange = useCallback((): DateRange => {
    if (defaultFilters?.initial_date_range?.start && defaultFilters?.initial_date_range?.end) {
      try {
        const start = parseISO(defaultFilters.initial_date_range.start);
        const end = parseISO(defaultFilters.initial_date_range.end);
        // Use the last 30 days within the available range
        const maxEnd = new Date() < end ? new Date() : end;
        const smartStart = subDays(maxEnd, 30);
        return {
          start: smartStart < start ? start : smartStart,
          end: maxEnd
        };
      } catch {
        // Fallback to default
      }
    }
    return {
      start: subDays(new Date(), 30),
      end: new Date(),
    };
  }, [defaultFilters]);
  
  // State
  const [rawData, setRawData] = useState<any[]>([]);
  const [normalizedData, setNormalizedData] = useState<NormalizedDataset | null>(null);
  const [previousRawData, setPreviousRawData] = useState<any[]>([]);
  const [previousNormalized, setPreviousNormalized] = useState<NormalizedDataset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<{ 
    message: string; 
    code?: string;
    type?: string; 
    details?: string; 
    debug?: any;
    binding?: any;
    trace_id?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getInitialDateRange);
  const [previousRange, setPreviousRange] = useState<DateRange | undefined>();
  const [activeTab, setActiveTab] = useState<TabType>('decisoes');
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiEditDrawerOpen, setAiEditDrawerOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [compatibilityMode, setCompatibilityMode] = useState(false);
  const [availableDateRange, setAvailableDateRange] = useState<{ min: string; max: string } | null>(null);
  
  // V2 computed data from dashboard-data-v2 (FULL aggregation, not limited)
  const [v2Aggregations, setV2Aggregations] = useState<{
    kpis: Record<string, number>;
    funnel: { stage: string; count: number; value: number; rate?: number; label?: string }[];
    series: { date: string; [key: string]: any }[];
    rankings: Record<string, { value: string; count: number }[]>;
    meta?: { rows_aggregated: number; aggregation_complete: boolean };
  } | null>(null);
  const [renderingMode, setRenderingMode] = useState<'spec' | 'template' | 'compatibility'>('template');
  
  // Data quality info from V2
  const [dataQuality, setDataQuality] = useState<{
    time_parse_rate: number;
    truthy_rates: Record<string, number>;
    degraded_mode: boolean;
    total_rows_aggregated: number;
  } | null>(null);
  const [dataWarnings, setDataWarnings] = useState<{
    code: string;
    severity: string;
    message: string;
  }[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    total_rows: number;
    total_pages: number;
    has_more: boolean;
  } | null>(null);
  
  // Parse dashboard spec
  const dashboardSpec = useMemo<DashboardSpec | null>(() => {
    if (!rawDashboardSpec || Object.keys(rawDashboardSpec).length === 0) {
      return null;
    }
    return parseDashboardSpec(rawDashboardSpec);
  }, [rawDashboardSpec]);
  
  // Get spec columns for normalization
  const specColumns = useMemo(() => {
    if (!dashboardSpec?.columns) return undefined;
    return dashboardSpec.columns.map(col => ({
      name: col.name,
      type: col.type,
      scale: col.scale,
    }));
  }, [dashboardSpec]);
  
  // Normalize data whenever raw data changes
  useEffect(() => {
    if (rawData.length === 0) {
      setNormalizedData(null);
      return;
    }
    
    try {
      const normalized = normalizeDataset({ data: rawData }, specColumns);
      setNormalizedData(normalized);
      
      // Check if we should enter compatibility mode
      if (normalized.warnings.length > 5 || normalized.columns.length === 0) {
        setCompatibilityMode(true);
      } else {
        setCompatibilityMode(false);
      }
    } catch (err) {
      console.error('Normalization error:', err);
      setCompatibilityMode(true);
    }
  }, [rawData, specColumns]);
  
  // Normalize previous data
  useEffect(() => {
    if (previousRawData.length === 0) {
      setPreviousNormalized(null);
      return;
    }
    
    try {
      setPreviousNormalized(normalizeDataset({ data: previousRawData }, specColumns));
    } catch {
      setPreviousNormalized(null);
    }
  }, [previousRawData, specColumns]);
  
  // Get working data (prefer normalized)
  const data = useMemo(() => normalizedData?.rows || rawData, [normalizedData, rawData]);
  const previousData = useMemo(() => previousNormalized?.rows || previousRawData, [previousNormalized, previousRawData]);
  
  // Generate template config from columns (with try-catch to prevent crash)
  const templateConfig: TemplateConfig = useMemo(() => {
    try {
      const columns = normalizedData?.columns.map(c => c.name) || 
                      detectedColumns.length > 0 ? detectedColumns : 
                      data.length > 0 ? Object.keys(data[0]) : [];
      return generateTemplateConfig(columns, templateKind, rawDashboardSpec);
    } catch (error) {
      console.error('Error generating template config:', error);
      return getDefaultTemplateConfig();
    }
  }, [normalizedData, detectedColumns, data, templateKind, rawDashboardSpec]);

  // P0 FIX: Aggregate data for KPIs and insights
  // PREFER V2 server-side aggregations when available (spec-first, FULL aggregation)
  // Only fallback to client-side calculation if V2 not available
  const aggregatedData: AggregatedData = useMemo(() => {
    // PRIORITY 1: Use V2 server-side aggregations (FULL, no limit 1000)
    if (v2Aggregations?.kpis && Object.keys(v2Aggregations.kpis).length > 0) {
      console.log('[Viewer] Using V2 FULL aggregations (spec-first):', 
        v2Aggregations.meta?.rows_aggregated, 'rows');
      
      // Return server-computed KPIs directly
      const serverKpis = { ...v2Aggregations.kpis };
      
      // Add derived metrics that may not be in the server response
      if (serverKpis.custo_total !== undefined && serverKpis.custo_total > 0) {
        if (serverKpis.leads_total && serverKpis.leads_total > 0) {
          serverKpis.cpl = serverKpis.custo_total / serverKpis.leads_total;
        }
        if (serverKpis.venda_total && serverKpis.venda_total > 0) {
          serverKpis.cac = serverKpis.custo_total / serverKpis.venda_total;
        }
      }
      
      return serverKpis;
    }
    
    // PRIORITY 2: Fallback to client-side calculation (legacy mode)
    console.log('[Viewer] Fallback to client-side aggregation (legacy mode)');
    if (data.length === 0) return {};
    
    const sums: AggregatedData = {};
    data.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'number' && isFinite(value)) {
          sums[key] = (sums[key] || 0) + value;
        }
      });
    });
    
    // Calculate derived metrics (with null safety)
    if (sums.custo_total !== undefined && sums.custo_total > 0) {
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
    
    // Calculate rates (with null safety)
    if (sums.leads_total && sums.leads_total > 0) {
      if (sums.entrada_total) {
        sums.taxa_entrada = sums.entrada_total / sums.leads_total;
      }
      if (sums.venda_total) {
        sums.taxa_venda_total = sums.venda_total / sums.leads_total;
      }
    }
    if (sums.reuniao_agendada_total && sums.reuniao_agendada_total > 0 && sums.reuniao_realizada_total) {
      sums.taxa_comparecimento = sums.reuniao_realizada_total / sums.reuniao_agendada_total;
    }
    
    return sums;
  }, [data, v2Aggregations]);

  const previousAggregated: AggregatedData = useMemo(() => {
    if (previousData.length === 0) return {};
    
    const sums: AggregatedData = {};
    previousData.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'number' && isFinite(value)) {
          sums[key] = (sums[key] || 0) + value;
        }
      });
    });
    
    if (sums.custo_total !== undefined && sums.custo_total > 0) {
      if (sums.leads_total && sums.leads_total > 0) {
        sums.cpl = sums.custo_total / sums.leads_total;
      }
      if (sums.venda_total && sums.venda_total > 0) {
        sums.cac = sums.custo_total / sums.venda_total;
      }
    }
    
    if (sums.leads_total && sums.leads_total > 0) {
      if (sums.entrada_total) {
        sums.taxa_entrada = sums.entrada_total / sums.leads_total;
      }
      if (sums.venda_total) {
        sums.taxa_venda_total = sums.venda_total / sums.leads_total;
      }
    }
    
    return sums;
  }, [previousData]);

  // Fetch data - prioritize dashboard-data-v2 when spec exists
  const fetchData = useCallback(async (fetchPrev = false) => {
    // Validate dashboard_id before calling
    if (!dashboardId) {
      console.warn('[Viewer] Missing dashboard_id - cannot fetch data');
      setError({
        message: 'Dashboard inválido',
        code: 'INVALID_DASHBOARD',
        type: 'validation',
        details: 'O ID do dashboard não está definido.',
      });
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    setError(null);
    setSessionExpired(false);

    try {
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
      
      // Determine rendering mode based on spec
      const hasValidSpec = dashboardSpec && Object.keys(dashboardSpec).length > 0;
      
      if (hasValidSpec) {
        // Try dashboard-data-v2 first for spec-first rendering
        try {
          console.log(`[Viewer] Calling dashboard-data-v2 for ${dashboardId}`);
          
          const { data: v2Result, error: v2Error } = await supabase.functions.invoke('dashboard-data-v2', {
            body: {
              dashboard_id: dashboardId,
              start: startStr,
              end: endStr,
            },
          });

          if (v2Error) {
            console.warn('[Viewer] dashboard-data-v2 invocation error:', v2Error);
            // Will fallback to legacy
          } else if (v2Result?.ok) {
            // Use V2 computed data
            const meta = v2Result.meta || {};
            console.log(`[Viewer] V2 success: ${meta.rows_fetched || 0} rows aggregated, trace_id=${meta.trace_id}`);
            
            setV2Aggregations({
              kpis: v2Result.aggregations?.kpis || {},
              funnel: v2Result.aggregations?.funnel || [],
              series: v2Result.aggregations?.series || [],
              rankings: v2Result.aggregations?.rankings || {},
              meta: {
                rows_aggregated: meta.rows_fetched || 0,
                aggregation_complete: meta.aggregation_complete ?? true,
              },
            });
            setRawData(v2Result.rows || []);
            setAvailableDateRange(meta.date_range || null);
            setRenderingMode('spec');
            setLastUpdated(new Date());
            
            // NEW: Set data quality info
            if (v2Result.data_quality) {
              setDataQuality(v2Result.data_quality);
            }
            if (v2Result.warnings && Array.isArray(v2Result.warnings)) {
              setDataWarnings(v2Result.warnings);
            } else {
              setDataWarnings([]);
            }
            if (v2Result.pagination) {
              setPagination(v2Result.pagination);
            }
            
            // Log aggregation completeness
            if (meta.aggregation_complete) {
              console.log(`[Viewer] Aggregation complete: ${meta.rows_fetched} rows`);
            } else {
              console.warn(`[Viewer] Aggregation limited: ${meta.rows_fetched}/${meta.rows_total} rows`);
            }
            
            return;
          } else if (v2Result && !v2Result.ok && v2Result.error) {
            // V2 returned structured error
            console.error('[Viewer] dashboard-data-v2 error response:', v2Result.error);
            throw {
              message: v2Result.error.message || 'Erro ao carregar dados',
              code: v2Result.error.code,
              type: v2Result.error.code,
              details: v2Result.error.details,
              trace_id: v2Result.trace_id || v2Result.meta?.trace_id,
            };
          }
          
          // V2 returned unexpected format, fallback to legacy
          console.warn('[Viewer] dashboard-data-v2 unexpected response, falling back to legacy');
        } catch (v2Err: any) {
          // If it's a structured error from our throw above, re-throw it
          if (v2Err.code) {
            throw v2Err;
          }
          console.warn('[Viewer] dashboard-data-v2 exception, falling back to legacy:', v2Err);
        }
      }
      
      // Fallback to legacy dashboard-data
      setRenderingMode(hasValidSpec ? 'spec' : 'template');
      
      const { data: result, error: fnError } = await supabase.functions.invoke('dashboard-data', {
        body: {
          dashboard_id: dashboardId,
          section: 'legacy',
          start: startStr,
          end: endStr,
        },
      });

      if (fnError) {
        console.error('Edge function error:', fnError);
        
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

      // Handle new API response format
      if (!result?.ok && result?.error) {
        const errObj = result.error;
        if (errObj.code === 'UNAUTHORIZED' || errObj.code === 'AUTH_FAILED' || errObj.code === 'ACCESS_DENIED') {
          setSessionExpired(true);
          return;
        }
        
        throw {
          message: errObj.message || 'Erro ao carregar dados',
          code: errObj.code,
          type: errObj.code,
          details: errObj.details || errObj.fix,
          binding: result.binding,
          debug: result.debug,
          trace_id: result.trace_id,
        };
      }
      
      // Legacy error format support
      if (result?.error && typeof result.error === 'string') {
        if (result.error.includes('autenticado') || result.error.includes('autorizado')) {
          setSessionExpired(true);
          return;
        }
        
        throw {
          message: result.error,
          type: result.error_type || 'generic',
          details: result.details,
          binding: result.binding,
          debug: result.debug,
          trace_id: result.trace_id,
        };
      }

      // Handle response - prefer 'daily' for time series, fallback to 'data'
      const dailyData = result?.daily || result?.data || [];
      setRawData(dailyData);
      setV2Aggregations(null); // Clear v2 aggregations when using legacy
      setLastUpdated(new Date());

      // Fetch previous period if comparison enabled
      if (fetchPrev && previousRange) {
        const prevStartStr = format(previousRange.start, 'yyyy-MM-dd');
        const prevEndStr = format(previousRange.end, 'yyyy-MM-dd');

        const { data: prevResult, error: prevError } = await supabase.functions.invoke('dashboard-data', {
          body: {
            dashboard_id: dashboardId,
            section: 'legacy',
            start: prevStartStr,
            end: prevEndStr,
          },
        });

        if (!prevError && prevResult) {
          const prevDaily = prevResult?.daily || prevResult?.data || [];
          setPreviousRawData(prevDaily);
        }
      } else {
        setPreviousRawData([]);
      }

    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError({
        message: err.message || 'Erro ao carregar dados',
        code: err.code,
        type: err.type,
        details: err.details,
        binding: err.binding,
        debug: err.debug,
        trace_id: err.trace_id,
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dashboardId, dashboardSpec, dateRange, previousRange, toast]);

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
        if (val instanceof Date) return format(val, 'yyyy-MM-dd');
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
    
    const dateCol = templateConfig.dateColumn;
    if (dateCol && row[dateCol]) {
      const currentDate = row[dateCol] instanceof Date ? row[dateCol] : parseISO(row[dateCol]);
      const prevRow = data.find(r => {
        if (!r[dateCol]) return false;
        const d = r[dateCol] instanceof Date ? r[dateCol] : parseISO(r[dateCol]);
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
      result[kpi] = data.map(row => {
        const val = row[kpi];
        return typeof val === 'number' && isFinite(val) ? val : 0;
      });
    });
    return result;
  }, [data, templateConfig.kpis]);

  // Handle login redirect
  const handleLoginRedirect = useCallback(() => {
    navigate('/auth');
  }, [navigate]);
  
  // Check if user is admin/manager for diagnostics
  const isAdminOrManager = userRole === 'admin' || userRole === 'manager';

  // Persist tab selection per dashboard (MOVED UP - must be before any returns)
  useEffect(() => {
    const storedTab = localStorage.getItem(`dashboard-tab-${dashboardId}`);
    if (storedTab && ['decisoes', 'executivo', 'funil', 'eficiencia', 'tendencias', 'detalhes'].includes(storedTab)) {
      setActiveTab(storedTab as TabType);
    }
  }, [dashboardId]);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    localStorage.setItem(`dashboard-tab-${dashboardId}`, tab);
  }, [dashboardId]);

  // Warnings summary for executive view
  const warningsSummary = useMemo(() => {
    if (!normalizedData || normalizedData.warnings.length === 0) return null;
    const count = normalizedData.warnings.length;
    return {
      count,
      message: count === 1 
        ? 'Detectamos 1 inconsistência nos dados.' 
        : `Detectamos ${count} inconsistências nos dados.`
    };
  }, [normalizedData]);

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

  // Error state with binding info
  if (error) {
    const errorTitle = error.code === 'VIEW_NOT_FOUND' ? 'View não encontrada' :
                       error.code === 'NO_DATASOURCE' ? 'Data Source não configurado' :
                       error.code === 'NO_VIEW_NAME' ? 'View não configurada' :
                       error.code === 'VIEW_NOT_ALLOWED' ? 'View não permitida' :
                       error.code === 'FETCH_ERROR' ? 'Erro ao buscar dados' :
                       error.type === 'timeout' ? 'Tempo esgotado' : 
                       error.type === 'network' ? 'Erro de rede' :
                       'Falha ao obter dados';
    
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <RefreshCw className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-medium mb-1">{errorTitle}</h3>
          <p className="text-muted-foreground text-sm max-w-md mb-2">{error.message}</p>
          {error.details && (
            <p className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded mb-4 max-w-md">
              {error.details}
            </p>
          )}
          
          {/* Binding info for admins/managers */}
          {isAdminOrManager && error.binding && (
            <div className="w-full max-w-lg mb-4 text-left">
              <details className="bg-muted/50 rounded-lg p-3">
                <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  <Bug className="h-4 w-4" />
                  Detalhes do binding (admin)
                </summary>
                <div className="mt-3 space-y-2 text-xs font-mono">
                  {error.binding.dashboard_id && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">dashboard_id:</span>
                      <span>{error.binding.dashboard_id}</span>
                    </div>
                  )}
                  {error.binding.dashboard_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">dashboard_name:</span>
                      <span>{error.binding.dashboard_name}</span>
                    </div>
                  )}
                  {error.binding.view_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">view_name:</span>
                      <span className="text-destructive">{error.binding.view_name}</span>
                    </div>
                  )}
                  {error.binding.data_source_id && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">data_source_id:</span>
                      <span>{error.binding.data_source_id}</span>
                    </div>
                  )}
                  {error.binding.data_source_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">data_source_name:</span>
                      <span>{error.binding.data_source_name}</span>
                    </div>
                  )}
                  {error.binding.project_ref && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">project_ref:</span>
                      <span>{error.binding.project_ref}</span>
                    </div>
                  )}
                  {error.binding.allowed_views && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">allowed_views:</span>
                      <span className="text-green-600">{error.binding.allowed_views.join(', ')}</span>
                    </div>
                  )}
                  {error.trace_id && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">trace_id:</span>
                      <span>{error.trace_id}</span>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button onClick={() => fetchData(comparisonEnabled)} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
            {isAdminOrManager && (
              <Button variant="ghost" onClick={() => navigate('/admin/dashboards')}>
                Configurar Dashboard
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state with actionable buttons
  if (data.length === 0) {
    const handleAdjustToAvailable = () => {
      if (availableDateRange) {
        setDateRange({
          start: parseISO(availableDateRange.min),
          end: parseISO(availableDateRange.max)
        });
      } else if (defaultFilters?.initial_date_range) {
        setDateRange({
          start: parseISO(defaultFilters.initial_date_range.start),
          end: parseISO(defaultFilters.initial_date_range.end)
        });
      }
    };

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
            <div className="rounded-full bg-warning/10 p-4 mb-4">
              <BarChart3 className="h-8 w-8 text-warning" />
            </div>
            <h3 className="text-lg font-medium mb-1">Sem dados no período</h3>
            <p className="text-muted-foreground text-sm max-w-sm mb-4">
              Não encontramos dados para o período selecionado ({format(dateRange.start, 'dd/MM/yyyy')} - {format(dateRange.end, 'dd/MM/yyyy')}).
            </p>
            <div className="flex gap-2 flex-wrap justify-center">
              {(availableDateRange || defaultFilters?.initial_date_range) && (
                <Button variant="default" size="sm" onClick={handleAdjustToAvailable}>
                  Ajustar para período disponível
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDateRange({
                start: subDays(new Date(), 90),
                end: new Date()
              })}>
                Últimos 90 dias
              </Button>
              {isAdminOrManager && (
                <Button variant="ghost" size="sm" onClick={() => setDiagnosticsOpen(true)}>
                  <Bug className="h-4 w-4 mr-1" />
                  Diagnóstico
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        {isAdminOrManager && (
          <DiagnosticsDrawer
            open={diagnosticsOpen}
            onOpenChange={setDiagnosticsOpen}
            normalizedDataset={normalizedData}
            dashboardSpec={dashboardSpec}
            rawDataSample={rawData[0]}
            templateConfig={templateConfig}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Debug Panel - Admin only */}
      {isAdminOrManager && (
        <DebugPanel
          dashboardId={dashboardId}
          dashboardName={dashboardName}
          dateRange={dateRange}
          isAdminOrManager={isAdminOrManager}
        />
      )}

      {/* Sticky Header Bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-4 -mx-1 px-1 pt-1">
        {/* Top info bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold truncate">{dashboardName}</h1>
            {dashboardSpec && (
              <Badge variant="secondary" className="text-xs">
                Spec v{dashboardSpec.version}
              </Badge>
            )}
            {renderingMode === 'spec' && v2Aggregations && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600/50">
                Spec-first
              </Badge>
            )}
            {v2Aggregations?.meta?.rows_aggregated && (
              <Badge variant="outline" className="text-xs">
                {v2Aggregations.meta.aggregation_complete ? '✓' : '⚠'} {v2Aggregations.meta.rows_aggregated.toLocaleString()} linhas
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(lastUpdated, 'HH:mm')}
              </span>
            )}
            <ThemeToggle />
            {isAdminOrManager && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setAiEditDrawerOpen(true)}
                title="Editar com IA"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            )}
            {isAdminOrManager && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setDiagnosticsOpen(true)}
                title="Diagnóstico"
              >
                <Bug className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
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
      </div>

      {/* Compatibility mode fallback */}
      {compatibilityMode ? (
        <CompatibilityModeView 
          data={data} 
          columns={normalizedData?.columns.map(c => c.name) || Object.keys(data[0] || {})}
          warnings={normalizedData?.warnings.map(w => w.message) || []}
          onRowClick={handleRowClick}
        />
      ) : (
        <DashboardTabs 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          enabledTabs={['decisoes', 'executivo', 'funil', 'eficiencia', 'tendencias', 'detalhes']}
        >
          {/* Tab: Decisões (Decision Center) - FIRST TAB */}
          <TabsContent value="decisoes" className="mt-6">
            <DecisionCenter
              data={data}
              previousPeriodData={previousData}
              dateColumn="dia"
              onViewDetails={() => handleTabChange('detalhes')}
            />
          </TabsContent>

          {/* Tab: Executivo */}
          <TabsContent value="executivo" className="mt-6 space-y-6">
            {/* Warnings summary (brief) */}
            {warningsSummary && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                <span className="text-sm text-warning font-medium">{warningsSummary.message}</span>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="ml-auto h-auto p-0 text-warning"
                  onClick={() => handleTabChange('detalhes')}
                >
                  Ver detalhes
                </Button>
              </div>
            )}

            {/* KPIs - use v2Aggregations if available */}
            <ExecutiveKPIRow
              data={v2Aggregations?.kpis || aggregatedData}
              previousData={comparisonEnabled ? previousAggregated : undefined}
              dailyData={v2Aggregations?.series || data}
              goals={templateConfig.goals}
              comparisonEnabled={comparisonEnabled}
            />

            {/* Funnel - use v2Aggregations if available */}
            <ExecutiveFunnel
              data={v2Aggregations?.kpis || aggregatedData}
              previousData={comparisonEnabled ? previousAggregated : undefined}
              comparisonEnabled={comparisonEnabled}
              funnelStages={v2Aggregations?.funnel}
            />

            {/* Trend charts (2 main ones) */}
            <ExecutiveTrendCharts
              data={data}
              previousData={previousData}
              goals={templateConfig.goals}
              comparisonEnabled={comparisonEnabled}
            />

            {/* Diagnostics summary */}
            <DiagnosticsPanel
              data={data}
              aggregatedData={aggregatedData}
              goals={templateConfig.goals}
            />
          </TabsContent>

          {/* Tab: Funil */}
          <TabsContent value="funil" className="mt-6 space-y-6">
            <ExecutiveFunnel
              data={v2Aggregations?.kpis || aggregatedData}
              previousData={comparisonEnabled ? previousAggregated : undefined}
              comparisonEnabled={comparisonEnabled}
              funnelStages={v2Aggregations?.funnel}
              className="min-h-[400px]"
            />
            
            {/* Funnel conversion table */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-base font-medium mb-4">Taxas de Conversão por Etapa</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'taxa_entrada', label: 'Leads → Entrada' },
                    { key: 'taxa_reuniao_agendada', label: 'Entrada → Agendamento' },
                    { key: 'taxa_comparecimento', label: 'Agendado → Realizado' },
                    { key: 'taxa_venda_pos_reuniao', label: 'Realizado → Venda' },
                  ].map(({ key, label }) => {
                    const value = aggregatedData[key];
                    return (
                      <div key={key} className="text-center p-4 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground mb-1">{label}</p>
                        <p className="text-2xl font-semibold">
                          {typeof value === 'number' && isFinite(value) 
                            ? `${(value * 100).toFixed(1)}%` 
                            : '—'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Eficiência */}
          <TabsContent value="eficiencia" className="mt-6 space-y-6">
            {/* Cost efficiency KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: 'cpl', label: 'CPL' },
                { key: 'cac', label: 'CAC' },
                { key: 'custo_por_entrada', label: 'Custo por Entrada' },
                { key: 'custo_por_reuniao_realizada', label: 'Custo por Reunião' },
              ].map(({ key, label }) => {
                const value = aggregatedData[key];
                const goal = templateConfig.goals?.[key];
                const isGood = goal && typeof value === 'number' ? value <= goal : undefined;
                return (
                  <Card key={key} className={isGood === false ? 'border-destructive/50' : isGood === true ? 'border-success/50' : ''}>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className="text-2xl font-semibold">
                        {typeof value === 'number' && isFinite(value) 
                          ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                          : '—'}
                      </p>
                      {goal && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Meta: R$ {goal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Cost efficiency trend chart */}
            <ExecutiveTrendCharts
              data={data}
              previousData={previousData}
              goals={templateConfig.goals}
              comparisonEnabled={comparisonEnabled}
            />
          </TabsContent>

          {/* Tab: Tendências */}
          <TabsContent value="tendencias" className="mt-6 space-y-6">
            <ExecutiveTrendCharts
              data={data}
              previousData={previousData}
              goals={templateConfig.goals}
              comparisonEnabled={comparisonEnabled}
            />
          </TabsContent>

          {/* Tab: Detalhes */}
          <TabsContent value="detalhes" className="mt-6 space-y-6">
            {/* Full warnings if any */}
            {normalizedData && normalizedData.warnings.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-warning" />
                    Qualidade dos Dados ({normalizedData.warnings.length} aviso{normalizedData.warnings.length > 1 ? 's' : ''})
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {normalizedData.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-warning">•</span>
                        <span>{w.message}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Full data table */}
            <EnhancedDataTable 
              data={data}
              spec={rawDashboardSpec}
              onRowClick={handleRowClick}
            />
          </TabsContent>
        </DashboardTabs>
      )}

      {/* Detail Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        rowData={selectedRow?.current || selectedRow}
        previousRowData={selectedRow?.previous}
        dateColumn={templateConfig.dateColumn}
      />
      
      {/* Diagnostics Drawer (admin only) */}
      {isAdminOrManager && (
        <DiagnosticsDrawer
          open={diagnosticsOpen}
          onOpenChange={setDiagnosticsOpen}
          normalizedDataset={normalizedData}
          dashboardSpec={dashboardSpec}
          rawDataSample={rawData[0]}
          templateConfig={templateConfig}
        />
      )}
      
      {/* AI Analyst Button & Drawer */}
      <AIAnalystButton onClick={() => setAiDrawerOpen(true)} />
      <AIAnalystDrawer
        open={aiDrawerOpen}
        onOpenChange={setAiDrawerOpen}
        dashboardId={dashboardId}
        dashboardName={dashboardName}
        dateRange={dateRange}
      />
      
      {/* AI Edit Drawer (admin only) */}
      {isAdminOrManager && (
        <AIEditDrawer
          open={aiEditDrawerOpen}
          onOpenChange={setAiEditDrawerOpen}
          dashboardId={dashboardId}
          dashboardName={dashboardName}
          currentSpec={rawDashboardSpec}
          currentVersion={dashboardSpec?.version || 1}
          onSpecUpdated={() => fetchData(comparisonEnabled)}
        />
      )}
    </div>
  );
}
