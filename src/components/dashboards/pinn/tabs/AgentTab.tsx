// ============================================================
// AGENT TAB - Kommo / Mensagens
// ============================================================

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  MessageSquare,
  Users,
  Activity,
  Calendar,
} from 'lucide-react';

import { PinnKPICard } from '../PinnKPICard';
import { PinnChart } from '../PinnChart';
import { PinnSectionHeader } from '../PinnSectionHeader';
import { PinnGlassCard, PinnGlassCardHeader, PinnGlassCardContent } from '../PinnGlassCard';
import type { AgentKPIs, HeatmapCell } from '@/hooks/useDashboardViews';

interface AgentTabProps {
  agentKPIs: AgentKPIs | null | undefined;
  kommoDaily: { day: string; msg_in_total: number }[];
  kommoHeatmap: HeatmapCell[];
  period: number;
}

// Custom tooltip
const PinnTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  
  const formatDateFull = (dateValue: string) => {
    try {
      return format(parseISO(dateValue), "dd 'de' MMMM", { locale: ptBR });
    } catch {
      return dateValue;
    }
  };
  
  return (
    <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 min-w-[160px]">
      <p className="text-sm font-medium text-white mb-2 pb-2 border-b border-white/10">
        {formatDateFull(label)}
      </p>
      <div className="space-y-1">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-white/60">{entry.name}</span>
            <span className="font-semibold text-white tabular-nums">
              {typeof entry.value === 'number' 
                ? entry.value.toLocaleString('pt-BR')
                : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Heatmap component
function HeatmapGrid({ data }: { data: HeatmapCell[] }) {
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  
  const grid = useMemo(() => {
    const result: Record<string, number> = {};
    let maxVal = 0;
    
    data.forEach(cell => {
      const key = `${cell.dow}-${cell.hour}`;
      result[key] = (result[key] || 0) + cell.msg_in_total;
      maxVal = Math.max(maxVal, result[key]);
    });
    
    return { grid: result, maxVal };
  }, [data]);
  
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-white/40">
        <p>Sem dados de heatmap</p>
      </div>
    );
  }
  
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hours header */}
        <div className="flex gap-1 mb-1 ml-12">
          {HOURS.filter(h => h % 3 === 0).map(hour => (
            <div key={hour} className="w-8 text-[10px] text-white/40 text-center">
              {hour}h
            </div>
          ))}
        </div>
        
        {/* Grid */}
        {DAYS.map((day, dowIndex) => (
          <div key={day} className="flex items-center gap-1 mb-1">
            <div className="w-10 text-xs text-white/40">{day}</div>
            {HOURS.map(hour => {
              const key = `${dowIndex}-${hour}`;
              const value = grid.grid[key] || 0;
              const intensity = grid.maxVal > 0 ? value / grid.maxVal : 0;
              
              return (
                <div
                  key={hour}
                  className="w-3 h-3 rounded-sm transition-colors"
                  style={{
                    backgroundColor: value > 0 
                      ? `rgba(255, 107, 0, ${0.2 + intensity * 0.8})`
                      : 'rgba(255, 255, 255, 0.05)',
                  }}
                  title={`${day} ${hour}h: ${value} mensagens`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentTab({
  agentKPIs,
  kommoDaily,
  kommoHeatmap,
  period,
}: AgentTabProps) {
  const formatDate = (dateValue: string) => {
    try {
      return format(parseISO(dateValue), 'dd/MM', { locale: ptBR });
    } catch {
      return dateValue;
    }
  };
  
  // Calculate totals from daily data
  const totalMessages = useMemo(() => {
    return kommoDaily.reduce((sum, d) => sum + (d.msg_in_total || 0), 0);
  }, [kommoDaily]);
  
  return (
    <div className="space-y-8">
      <PinnSectionHeader
        title="Agente (Kommo)"
        subtitle="Mensagens e interações do CRM"
        icon={MessageSquare}
      />
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PinnKPICard
          label="Mensagens Recebidas"
          value={totalMessages.toLocaleString('pt-BR')}
          subtitle={`Últimos ${period} dias`}
          icon={MessageSquare}
          accentColor="blue"
          glow
        />
        <PinnKPICard
          label="Leads Tocados"
          value={agentKPIs?.leads_tocados?.toLocaleString('pt-BR') || '—'}
          subtitle="Contatos únicos"
          icon={Users}
          accentColor="green"
        />
        <PinnKPICard
          label="Dias Ativos"
          value={agentKPIs?.dias_ativos?.toString() || '—'}
          subtitle="Com atividade"
          icon={Calendar}
          accentColor="purple"
        />
      </div>
      
      {/* Messages Chart */}
      <PinnChart title="Mensagens Recebidas por Dia" subtitle="Volume de inbound" height="h-[320px]">
        {kommoDaily.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={kommoDaily}>
              <defs>
                <linearGradient id="msgGradientAgent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis 
                dataKey="day" 
                tickFormatter={formatDate}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<PinnTooltip />} />
              <Area
                type="monotone"
                dataKey="msg_in_total"
                name="Mensagens"
                stroke="#3B82F6"
                strokeWidth={2.5}
                fill="url(#msgGradientAgent)"
                dot={false}
                activeDot={{ r: 6, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-white/40">
            <p>Sem dados de mensagens no período</p>
          </div>
        )}
      </PinnChart>
      
      {/* Heatmap */}
      <PinnGlassCard>
        <PinnGlassCardHeader>
          <h3 className="text-base font-semibold text-white">Heatmap de Mensagens</h3>
          <p className="text-sm text-white/40 mt-0.5">Distribuição por hora e dia da semana (30d)</p>
        </PinnGlassCardHeader>
        <PinnGlassCardContent>
          <HeatmapGrid data={kommoHeatmap} />
        </PinnGlassCardContent>
      </PinnGlassCard>
    </div>
  );
}
