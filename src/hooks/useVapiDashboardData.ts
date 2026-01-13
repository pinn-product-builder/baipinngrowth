// ============================================================
// USE VAPI DASHBOARD DATA - Hook para dados VAPI
// ============================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

export interface VapiDailyRow {
  day: string;
  calls_total: number;
  calls_answered: number;
  calls_missed: number;
  avg_duration_seconds: number;
  total_duration_seconds: number;
}

export interface VapiKPIs {
  total_calls: number;
  avg_calls_per_day: number;
  active_days: number;
  total_duration_minutes: number;
  avg_duration_seconds: number;
}

interface UseVapiDashboardDataParams {
  orgId?: string;
  startDate: string;
  endDate: string;
  enabled?: boolean;
}

export function useVapiDashboardData({
  orgId,
  startDate,
  endDate,
  enabled = true,
}: UseVapiDashboardDataParams) {
  const query = useQuery({
    queryKey: ['vapi-data', orgId, startDate, endDate],
    queryFn: async () => {
      // Fetch VAPI daily data from the view
      const { data, error } = await supabase
        .from('vapi_calls')
        .select('call_date, calls_total, calls_answered, calls_missed, avg_duration_seconds, total_duration_seconds')
        .gte('call_date', startDate)
        .lte('call_date', endDate)
        .order('call_date', { ascending: true });
      
      if (error) throw error;
      
      return data || [];
    },
    enabled: enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
  
  // Calculate KPIs from daily data
  const kpis = useMemo<VapiKPIs>(() => {
    if (!query.data || query.data.length === 0) {
      return {
        total_calls: 0,
        avg_calls_per_day: 0,
        active_days: 0,
        total_duration_minutes: 0,
        avg_duration_seconds: 0,
      };
    }
    
    const data = query.data;
    const total_calls = data.reduce((sum, row) => sum + (row.calls_total || 0), 0);
    const active_days = data.filter(row => (row.calls_total || 0) > 0).length;
    const total_duration = data.reduce((sum, row) => sum + (row.total_duration_seconds || 0), 0);
    
    // Calculate days in range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysInRange = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    
    return {
      total_calls,
      avg_calls_per_day: Math.round(total_calls / daysInRange),
      active_days,
      total_duration_minutes: Math.round(total_duration / 60),
      avg_duration_seconds: active_days > 0 ? Math.round(total_duration / total_calls) : 0,
    };
  }, [query.data, startDate, endDate]);
  
  // Transform data for chart
  const dailySeries = useMemo<VapiDailyRow[]>(() => {
    if (!query.data) return [];
    
    return query.data.map(row => ({
      day: row.call_date,
      calls_total: row.calls_total || 0,
      calls_answered: row.calls_answered || 0,
      calls_missed: row.calls_missed || 0,
      avg_duration_seconds: Number(row.avg_duration_seconds) || 0,
      total_duration_seconds: row.total_duration_seconds || 0,
    }));
  }, [query.data]);
  
  return {
    kpis,
    dailySeries,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
