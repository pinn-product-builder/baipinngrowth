// ============================================================
// AFONSINA DASHBOARD DATA HOOK
// Centralized hook for fetching Afonsina v3 views data
// ============================================================

import { useQuery, useQueries } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

// Types for v3 data structures
export interface DashboardDailyRow {
  date: string;
  dia?: string;
  org_id?: string;
  leads_total?: number;
  leads?: number;
  leads_new?: number;
  entradas_total?: number;
  entradas?: number;
  entrada?: number;
  reunioes_agendadas?: number;
  meetings_scheduled?: number;
  reuniao_agendada_total?: number;
  reunioes_realizadas?: number;
  meetings_held?: number;
  reuniao_realizada_total?: number;
  vendas_total?: number;
  vendas?: number;
  venda?: number;
  conversions?: number;
  [key: string]: unknown;
}

export interface SpendDailyRow {
  date: string;
  dia?: string;
  org_id?: string;
  spend?: number;
  custo_total?: number;
  investment?: number;
  [key: string]: unknown;
}

export interface FunnelStageRow {
  stage_name: string;
  stage_id?: string;
  count: number;
  org_id?: string;
  [key: string]: unknown;
}

export interface MeetingsDailyRow {
  date: string;
  dia?: string;
  org_id?: string;
  scheduled?: number;
  held?: number;
  no_show?: number;
  total?: number;
  [key: string]: unknown;
}

export interface MessagesHourlyRow {
  hour: number;
  day?: string;
  date?: string;
  org_id?: string;
  count?: number;
  messages?: number;
  [key: string]: unknown;
}

export interface AggregatedKPIs {
  investimento_total: number;
  leads_total: number;
  entradas_total: number;
  reunioes_agendadas: number;
  reunioes_realizadas: number;
  vendas_total: number;
  cpl: number | null;
  custo_por_entrada: number | null;
  cac: number | null;
  taxa_entrada: number | null;
  taxa_comparecimento: number | null;
  taxa_conversao: number | null;
}

export interface AfonsinaDataResult {
  // Raw data from views
  dashboardDaily: DashboardDailyRow[];
  spendDaily: SpendDailyRow[];
  funnelCurrent: FunnelStageRow[];
  meetingsDaily: MeetingsDailyRow[];
  messagesHourly: MessagesHourlyRow[];
  
  // Previous period data for comparison
  previousDashboardDaily?: DashboardDailyRow[];
  previousSpendDaily?: SpendDailyRow[];
  
  // Aggregated KPIs
  kpis: AggregatedKPIs;
  previousKpis?: AggregatedKPIs;
  
  // Merged daily series for charts
  dailySeries: DailySeriesRow[];
  previousDailySeries?: DailySeriesRow[];
  
  // Loading & error states
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  
  // Refetch function
  refetch: () => void;
}

export interface DailySeriesRow {
  date: string;
  investimento: number;
  leads: number;
  entradas: number;
  reunioes_agendadas: number;
  reunioes_realizadas: number;
  vendas: number;
  cpl: number | null;
  cac: number | null;
  taxa_entrada: number | null;
  taxa_comparecimento: number | null;
  taxa_conversao: number | null;
}

interface UseAfonsinaDashboardDataParams {
  orgId?: string;
  startDate: string;
  endDate: string;
  compareEnabled?: boolean;
  enabled?: boolean;
}

// Helper to safely get numeric value from row
function getNumeric(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null) {
      const num = parseFloat(String(val));
      if (isFinite(num)) return num;
    }
  }
  return 0;
}

// Helper to get date from row
function getDate(row: Record<string, unknown>): string {
  return String(row.date || row.dia || row.day || '');
}

// Aggregate KPIs from daily data
function aggregateKPIs(
  dashboardData: DashboardDailyRow[],
  spendData: SpendDailyRow[]
): AggregatedKPIs {
  const kpis: AggregatedKPIs = {
    investimento_total: 0,
    leads_total: 0,
    entradas_total: 0,
    reunioes_agendadas: 0,
    reunioes_realizadas: 0,
    vendas_total: 0,
    cpl: null,
    custo_por_entrada: null,
    cac: null,
    taxa_entrada: null,
    taxa_comparecimento: null,
    taxa_conversao: null,
  };
  
  // Sum spend
  for (const row of spendData) {
    kpis.investimento_total += getNumeric(row, 'spend', 'custo_total', 'investment', 'valor');
  }
  
  // Sum dashboard metrics
  for (const row of dashboardData) {
    kpis.leads_total += getNumeric(row, 'leads_total', 'leads', 'leads_new', 'total_leads');
    kpis.entradas_total += getNumeric(row, 'entradas_total', 'entradas', 'entrada', 'entrada_total');
    kpis.reunioes_agendadas += getNumeric(row, 'reunioes_agendadas', 'meetings_scheduled', 'reuniao_agendada_total', 'agendadas');
    kpis.reunioes_realizadas += getNumeric(row, 'reunioes_realizadas', 'meetings_held', 'reuniao_realizada_total', 'realizadas');
    kpis.vendas_total += getNumeric(row, 'vendas_total', 'vendas', 'venda', 'venda_total', 'conversions');
  }
  
  // Calculate derived metrics
  if (kpis.investimento_total > 0) {
    if (kpis.leads_total > 0) {
      kpis.cpl = kpis.investimento_total / kpis.leads_total;
    }
    if (kpis.entradas_total > 0) {
      kpis.custo_por_entrada = kpis.investimento_total / kpis.entradas_total;
    }
    if (kpis.vendas_total > 0) {
      kpis.cac = kpis.investimento_total / kpis.vendas_total;
    }
  }
  
  // Calculate rates
  if (kpis.leads_total > 0) {
    kpis.taxa_entrada = kpis.entradas_total / kpis.leads_total;
  }
  if (kpis.reunioes_agendadas > 0) {
    kpis.taxa_comparecimento = kpis.reunioes_realizadas / kpis.reunioes_agendadas;
  }
  if (kpis.entradas_total > 0) {
    kpis.taxa_conversao = kpis.vendas_total / kpis.entradas_total;
  }
  
  return kpis;
}

// Merge dashboard and spend data by date
function mergeDailySeries(
  dashboardData: DashboardDailyRow[],
  spendData: SpendDailyRow[]
): DailySeriesRow[] {
  const byDate = new Map<string, DailySeriesRow>();
  
  // Initialize from dashboard data
  for (const row of dashboardData) {
    const date = getDate(row);
    if (!date) continue;
    
    byDate.set(date, {
      date,
      investimento: 0,
      leads: getNumeric(row, 'leads_total', 'leads', 'leads_new'),
      entradas: getNumeric(row, 'entradas_total', 'entradas', 'entrada'),
      reunioes_agendadas: getNumeric(row, 'reunioes_agendadas', 'meetings_scheduled', 'reuniao_agendada_total'),
      reunioes_realizadas: getNumeric(row, 'reunioes_realizadas', 'meetings_held', 'reuniao_realizada_total'),
      vendas: getNumeric(row, 'vendas_total', 'vendas', 'venda', 'conversions'),
      cpl: null,
      cac: null,
      taxa_entrada: null,
      taxa_comparecimento: null,
      taxa_conversao: null,
    });
  }
  
  // Add spend data
  for (const row of spendData) {
    const date = getDate(row);
    if (!date) continue;
    
    const existing = byDate.get(date) || {
      date,
      investimento: 0,
      leads: 0,
      entradas: 0,
      reunioes_agendadas: 0,
      reunioes_realizadas: 0,
      vendas: 0,
      cpl: null,
      cac: null,
      taxa_entrada: null,
      taxa_comparecimento: null,
      taxa_conversao: null,
    };
    
    existing.investimento = getNumeric(row, 'spend', 'custo_total', 'investment', 'valor');
    byDate.set(date, existing);
  }
  
  // Calculate derived metrics per day
  const series = Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => {
      // CPL
      if (row.investimento > 0 && row.leads > 0) {
        row.cpl = row.investimento / row.leads;
      }
      // CAC
      if (row.investimento > 0 && row.vendas > 0) {
        row.cac = row.investimento / row.vendas;
      }
      // Rates
      if (row.leads > 0) {
        row.taxa_entrada = row.entradas / row.leads;
      }
      if (row.reunioes_agendadas > 0) {
        row.taxa_comparecimento = row.reunioes_realizadas / row.reunioes_agendadas;
      }
      if (row.entradas > 0) {
        row.taxa_conversao = row.vendas / row.entradas;
      }
      
      return row;
    });
  
  return series;
}

// Calculate previous period dates
function getPreviousPeriod(startDate: string, endDate: string): { start: string; end: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const durationMs = end.getTime() - start.getTime();
  
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000); // Day before start
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  
  return {
    start: prevStart.toISOString().split('T')[0],
    end: prevEnd.toISOString().split('T')[0],
  };
}

export function useAfonsinaDashboardData({
  orgId,
  startDate,
  endDate,
  compareEnabled = false,
  enabled = true,
}: UseAfonsinaDashboardDataParams): AfonsinaDataResult {
  
  const prevPeriod = useMemo(() => 
    compareEnabled ? getPreviousPeriod(startDate, endDate) : null,
    [startDate, endDate, compareEnabled]
  );
  
  // Fetch data from edge function
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['afonsina-data-v3', orgId, startDate, endDate, compareEnabled],
    queryFn: async () => {
      const { data: result, error: fnError } = await supabase.functions.invoke('afonsina-data-v3', {
        body: {
          action: 'fetch_all',
          org_id: orgId,
          start_date: startDate,
          end_date: endDate,
          compare_enabled: compareEnabled,
          views_to_fetch: [
            'dashboard_daily',
            'spend_daily',
            'funnel_current',
            'meetings_daily',
            'messages_hourly_30d',
          ],
        },
      });
      
      if (fnError) throw new Error(fnError.message);
      if (!result?.ok) throw new Error(result?.error?.message || 'Erro ao buscar dados');
      
      return result;
    },
    enabled: enabled && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
  
  // Process and merge data
  const processedData = useMemo(() => {
    if (!data?.data) {
      return {
        dashboardDaily: [],
        spendDaily: [],
        funnelCurrent: [],
        meetingsDaily: [],
        messagesHourly: [],
        kpis: aggregateKPIs([], []),
        dailySeries: [],
      };
    }
    
    const dashboardDaily = (data.data.dashboard_daily || []) as DashboardDailyRow[];
    const spendDaily = (data.data.spend_daily || []) as SpendDailyRow[];
    const funnelCurrent = (data.data.funnel_current || []) as FunnelStageRow[];
    const meetingsDaily = (data.data.meetings_daily || []) as MeetingsDailyRow[];
    const messagesHourly = (data.data.messages_hourly_30d || []) as MessagesHourlyRow[];
    
    const kpis = data.kpis || aggregateKPIs(dashboardDaily, spendDaily);
    const dailySeries = mergeDailySeries(dashboardDaily, spendDaily);
    
    // Previous period data
    let previousDashboardDaily: DashboardDailyRow[] | undefined;
    let previousSpendDaily: SpendDailyRow[] | undefined;
    let previousKpis: AggregatedKPIs | undefined;
    let previousDailySeries: DailySeriesRow[] | undefined;
    
    if (compareEnabled && data.previous_data) {
      previousDashboardDaily = (data.previous_data.dashboard_daily || []) as DashboardDailyRow[];
      previousSpendDaily = (data.previous_data.spend_daily || []) as SpendDailyRow[];
      previousKpis = data.previous_kpis || aggregateKPIs(previousDashboardDaily, previousSpendDaily);
      previousDailySeries = mergeDailySeries(previousDashboardDaily, previousSpendDaily);
    }
    
    return {
      dashboardDaily,
      spendDaily,
      funnelCurrent,
      meetingsDaily,
      messagesHourly,
      previousDashboardDaily,
      previousSpendDaily,
      kpis,
      previousKpis,
      dailySeries,
      previousDailySeries,
    };
  }, [data, compareEnabled]);
  
  return {
    ...processedData,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

export default useAfonsinaDashboardData;
