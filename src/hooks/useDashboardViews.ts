// ============================================================
// HOOKS PARA VIEWS DO DASHBOARD AFONSINA
// Centraliza todos os fetches de dados com tratamento de erros
// ============================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

// ==================== TYPES ====================

export interface DashboardKPIs {
  ligacoes_total: number;
  ligacoes_media_dia: number;
  dias_ativos: number;
  minutos_totais: number;
  leads_total: number;
  mensagens_recebidas: number;
  reunioes_marcadas: number;
}

export interface VapiDailyData {
  day: string;
  calls_total: number;
  calls_answered?: number;
  calls_missed?: number;
}

export interface VapiHourlyData {
  hour: number;
  calls_total: number;
}

export interface VapiByAssistantData {
  day: string;
  assistant_id: string;
  assistant_name: string;
  calls_total: number;
}

export interface FunnelStage {
  stage_key: string;
  stage_name: string;
  stage_order: number;
  leads: number;
}

export interface MeetingUpcoming {
  start_at: string;
  summary: string;
  status: string;
  meeting_url: string;
  lead_name?: string;
  lead_email?: string;
  lead_phone?: string;
}

export interface AgentKPIs {
  eventos_total: number;
  leads_tocados: number;
  dias_ativos: number;
}

export interface MeetingsKPIs {
  meetings_booked: number;
  meetings_completed: number;
  meetings_cancelled: number;
}

export interface HeatmapCell {
  hour: number;
  dow: number;
  msg_in_total: number;
}

// ==================== DASHBOARD KPIS ====================

export function useDashboardKPIs(orgId: string | null, period: 7 | 30 | 60) {
  const viewName = period === 7 ? 'vw_dashboard_kpis_7d_v3' : 'vw_dashboard_kpis_30d_v3';
  
  return useQuery({
    queryKey: ['dashboard-kpis', orgId, period],
    queryFn: async (): Promise<DashboardKPIs | null> => {
      if (!orgId) return null;
      
      try {
        const { data, error } = await supabase
          .from(viewName as any)
          .select('*')
          .eq('org_id', orgId)
          .maybeSingle();
        
        if (error) {
          console.warn('Dashboard KPIs error:', error.message);
          return null;
        }
        return data as unknown as DashboardKPIs | null;
      } catch (err) {
        console.warn('Dashboard KPIs exception:', err);
        return null;
      }
    },
    enabled: !!orgId,
  });
}

// ==================== VAPI CALLS DAILY ====================

export function useVapiCallsDaily(orgId: string | null, period: 7 | 30 | 60) {
  return useQuery({
    queryKey: ['vapi-calls-daily', orgId, period],
    queryFn: async (): Promise<VapiDailyData[]> => {
      if (!orgId) return [];
      
      try {
        const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data, error } = await supabase
          .from('vw_vapi_calls_daily_v3' as any)
          .select('*')
          .eq('org_id', orgId)
          .gte('day', startDate)
          .order('day', { ascending: true });
        
        if (error) {
          console.warn('VAPI daily error:', error.message);
          return [];
        }
        return (data as unknown as VapiDailyData[]) || [];
      } catch (err) {
        console.warn('VAPI daily exception:', err);
        return [];
      }
    },
    enabled: !!orgId,
  });
}

// ==================== VAPI CALLS HOURLY ====================

export function useVapiCallsHourly(orgId: string | null) {
  return useQuery({
    queryKey: ['vapi-calls-hourly', orgId],
    queryFn: async (): Promise<VapiHourlyData[]> => {
      if (!orgId) return [];
      
      try {
        const { data, error } = await supabase
          .from('vw_vapi_calls_hourly_v3' as any)
          .select('*')
          .eq('org_id', orgId)
          .order('hour', { ascending: true });
        
        if (error) {
          console.warn('VAPI hourly error:', error.message);
          return [];
        }
        return (data as unknown as VapiHourlyData[]) || [];
      } catch (err) {
        console.warn('VAPI hourly exception:', err);
        return [];
      }
    },
    enabled: !!orgId,
  });
}

// ==================== VAPI BY ASSISTANT ====================

export function useVapiByAssistant(orgId: string | null, period: 7 | 30 | 60) {
  return useQuery({
    queryKey: ['vapi-by-assistant', orgId, period],
    queryFn: async (): Promise<VapiByAssistantData[]> => {
      if (!orgId) return [];
      
      try {
        const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data, error } = await supabase
          .from('vw_vapi_calls_by_assistant_daily_v3' as any)
          .select('*')
          .eq('org_id', orgId)
          .gte('day', startDate);
        
        if (error) {
          console.warn('VAPI by assistant error:', error.message);
          return [];
        }
        return (data as unknown as VapiByAssistantData[]) || [];
      } catch (err) {
        console.warn('VAPI by assistant exception:', err);
        return [];
      }
    },
    enabled: !!orgId,
  });
}

// ==================== FUNNEL ====================

export function useFunnelCurrent(orgId: string | null) {
  return useQuery({
    queryKey: ['funnel-current', orgId],
    queryFn: async (): Promise<FunnelStage[]> => {
      if (!orgId) return [];
      
      try {
        const { data, error } = await supabase
          .from('vw_funnel_current_exec_v4' as any)
          .select('*')
          .eq('org_id', orgId)
          .order('stage_order', { ascending: true });
        
        if (error) {
          console.warn('Funnel error:', error.message);
          return [];
        }
        return (data as unknown as FunnelStage[]) || [];
      } catch (err) {
        console.warn('Funnel exception:', err);
        return [];
      }
    },
    enabled: !!orgId,
  });
}

// ==================== MEETINGS ====================

export function useMeetingsKPIs(orgId: string | null, period: 7 | 30) {
  const viewName = period === 7 ? 'vw_meetings_kpis_7d_v3' : 'vw_meetings_kpis_30d_v3';
  
  return useQuery({
    queryKey: ['meetings-kpis', orgId, period],
    queryFn: async (): Promise<MeetingsKPIs | null> => {
      if (!orgId) return null;
      
      try {
        const { data, error } = await supabase
          .from(viewName as any)
          .select('*')
          .eq('org_id', orgId)
          .maybeSingle();
        
        if (error) {
          console.warn('Meetings KPIs error:', error.message);
          return null;
        }
        return data as unknown as MeetingsKPIs | null;
      } catch (err) {
        console.warn('Meetings KPIs exception:', err);
        return null;
      }
    },
    enabled: !!orgId,
  });
}

export function useMeetingsUpcoming(orgId: string | null) {
  return useQuery({
    queryKey: ['meetings-upcoming', orgId],
    queryFn: async (): Promise<MeetingUpcoming[]> => {
      if (!orgId) return [];
      
      try {
        const { data, error } = await supabase
          .from('vw_meetings_upcoming_v3' as any)
          .select('*')
          .eq('org_id', orgId)
          .limit(10);
        
        if (error) {
          console.warn('Meetings upcoming error:', error.message);
          return [];
        }
        return (data as unknown as MeetingUpcoming[]) || [];
      } catch (err) {
        console.warn('Meetings upcoming exception:', err);
        return [];
      }
    },
    enabled: !!orgId,
  });
}

// ==================== AGENT / KOMMO ====================

export function useAgentKPIs(orgId: string | null, period: 7 | 30) {
  const viewName = period === 7 ? 'vw_agente_kpis_7d' : 'vw_agente_kpis_30d';
  
  return useQuery({
    queryKey: ['agent-kpis', orgId, period],
    queryFn: async (): Promise<AgentKPIs | null> => {
      if (!orgId) return null;
      
      try {
        const { data, error } = await supabase
          .from(viewName as any)
          .select('*')
          .eq('org_id', orgId)
          .maybeSingle();
        
        if (error) {
          console.warn('Agent KPIs error:', error.message);
          return null;
        }
        return data as unknown as AgentKPIs | null;
      } catch (err) {
        console.warn('Agent KPIs exception:', err);
        return null;
      }
    },
    enabled: !!orgId,
  });
}

export function useKommoMsgDaily(orgId: string | null, period: 7 | 30 | 60) {
  return useQuery({
    queryKey: ['kommo-msg-daily', orgId, period],
    queryFn: async (): Promise<{ day: string; msg_in_total: number }[]> => {
      if (!orgId) return [];
      
      try {
        const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data, error } = await supabase
          .from('vw_kommo_msg_in_daily_60d_v3' as any)
          .select('*')
          .eq('org_id', orgId)
          .gte('day', startDate)
          .order('day', { ascending: true });
        
        if (error) {
          console.warn('Kommo msg daily error:', error.message);
          return [];
        }
        return (data as unknown as { day: string; msg_in_total: number }[]) || [];
      } catch (err) {
        console.warn('Kommo msg daily exception:', err);
        return [];
      }
    },
    enabled: !!orgId,
  });
}

export function useKommoHeatmap(orgId: string | null) {
  return useQuery({
    queryKey: ['kommo-heatmap', orgId],
    queryFn: async (): Promise<HeatmapCell[]> => {
      if (!orgId) return [];
      
      try {
        const { data, error } = await supabase
          .from('vw_kommo_msg_in_heatmap_30d_v3' as any)
          .select('*')
          .eq('org_id', orgId);
        
        if (error) {
          console.warn('Kommo heatmap error:', error.message);
          return [];
        }
        return (data as unknown as HeatmapCell[]) || [];
      } catch (err) {
        console.warn('Kommo heatmap exception:', err);
        return [];
      }
    },
    enabled: !!orgId,
  });
}

// ==================== COMPUTED METRICS ====================

export function useVapiComputedKPIs(dailyData: VapiDailyData[]) {
  return useMemo(() => {
    if (!dailyData || dailyData.length === 0) {
      return {
        total_calls: 0,
        avg_calls_per_day: 0,
        active_days: 0,
        contact_rate: null as number | null,
      };
    }
    
    const total_calls = dailyData.reduce((sum, d) => sum + (d.calls_total || 0), 0);
    const active_days = dailyData.filter(d => (d.calls_total || 0) > 0).length;
    const avg_calls_per_day = active_days > 0 ? Math.round(total_calls / active_days) : 0;
    
    const total_answered = dailyData.reduce((sum, d) => sum + (d.calls_answered || 0), 0);
    const contact_rate = total_calls > 0 ? (total_answered / total_calls) * 100 : null;
    
    return {
      total_calls,
      avg_calls_per_day,
      active_days,
      contact_rate,
    };
  }, [dailyData]);
}
