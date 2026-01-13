// ============================================================
// AFONSINA DASHBOARD DATA HOOK
// Centralized hook for fetching Afonsina v3 views data
// ============================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

// Types matching the edge function response
export interface KPIs {
  investimento_total: number;
  leads_total: number;
  entradas_total: number;
  reunioes_agendadas: number;
  reunioes_realizadas: number;
  faltas_total: number;
  desmarques_total: number;
  vendas_total: number;
  cpl: number | null;
  custo_por_entrada: number | null;
  custo_por_reuniao_agendada: number | null;
  custo_por_reuniao_realizada: number | null;
  cac: number | null;
  taxa_entrada: number | null;
  taxa_reuniao_agendada: number | null;
  taxa_comparecimento: number | null;
  taxa_venda_pos_reuniao: number | null;
  taxa_venda_total: number | null;
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
  custo_por_entrada: number | null;
  cac: number | null;
  taxa_entrada: number | null;
  taxa_comparecimento: number | null;
  taxa_venda_total: number | null;
}

export interface FunnelStageRow {
  stage_name: string;
  stage_rank: number;
  leads_total: number;
  org_id?: string;
}

export interface AfonsinaDataResult {
  kpis: KPIs;
  previousKpis?: KPIs;
  dailySeries: DailySeriesRow[];
  previousDailySeries?: DailySeriesRow[];
  funnelCurrent: FunnelStageRow[];
  rawData: Record<string, unknown[]>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

interface UseAfonsinaDashboardDataParams {
  orgId?: string;
  startDate: string;
  endDate: string;
  compareEnabled?: boolean;
  enabled?: boolean;
}

const emptyKPIs: KPIs = {
  investimento_total: 0,
  leads_total: 0,
  entradas_total: 0,
  reunioes_agendadas: 0,
  reunioes_realizadas: 0,
  faltas_total: 0,
  desmarques_total: 0,
  vendas_total: 0,
  cpl: null,
  custo_por_entrada: null,
  custo_por_reuniao_agendada: null,
  custo_por_reuniao_realizada: null,
  cac: null,
  taxa_entrada: null,
  taxa_reuniao_agendada: null,
  taxa_comparecimento: null,
  taxa_venda_pos_reuniao: null,
  taxa_venda_total: null,
};

export function useAfonsinaDashboardData({
  orgId,
  startDate,
  endDate,
  compareEnabled = false,
  enabled = true,
}: UseAfonsinaDashboardDataParams): AfonsinaDataResult {
  
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
        },
      });
      
      if (fnError) throw new Error(fnError.message);
      if (!result?.ok) throw new Error(result?.error?.message || 'Erro ao buscar dados');
      
      return result;
    },
    enabled: enabled && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  
  const processedData = useMemo(() => {
    if (!data) {
      return {
        kpis: emptyKPIs,
        dailySeries: [],
        funnelCurrent: [],
        rawData: {},
      };
    }
    
    return {
      kpis: data.kpis || emptyKPIs,
      previousKpis: data.previous_kpis,
      dailySeries: data.daily_series || [],
      previousDailySeries: data.previous_daily_series,
      funnelCurrent: (data.data?.funnel_current || []) as FunnelStageRow[],
      rawData: data.data || {},
    };
  }, [data]);
  
  return {
    ...processedData,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

export default useAfonsinaDashboardData;
