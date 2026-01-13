// ============================================================
// VAPI TAB - Ligações do Agente de Voz
// ============================================================

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Phone,
  PhoneCall,
  Activity,
  Calendar,
  Clock,
  Users,
} from 'lucide-react';

import { PinnKPICard } from '../PinnKPICard';
import { PinnChart } from '../PinnChart';
import { PinnSectionHeader } from '../PinnSectionHeader';
import type { VapiDailyData, VapiHourlyData, VapiByAssistantData } from '@/hooks/useDashboardViews';

interface VapiTabProps {
  vapiKPIs: {
    total_calls: number;
    avg_calls_per_day: number;
    active_days: number;
    contact_rate: number | null;
  };
  vapiDaily: VapiDailyData[];
  vapiHourly: VapiHourlyData[];
  vapiByAssistant: VapiByAssistantData[];
  period: number;
}

// Custom tooltip
const PinnTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  
  return (
    <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 min-w-[160px]">
      <p className="text-sm font-medium text-white mb-2 pb-2 border-b border-white/10">
        {label}
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

export function VapiTab({
  vapiKPIs,
  vapiDaily,
  vapiHourly,
  vapiByAssistant,
  period,
}: VapiTabProps) {
  const formatDate = (dateValue: string) => {
    try {
      return format(parseISO(dateValue), 'dd/MM', { locale: ptBR });
    } catch {
      return dateValue;
    }
  };
  
  // Aggregate by assistant for the period
  const assistantTotals = useMemo(() => {
    const totals: Record<string, { name: string; calls: number }> = {};
    vapiByAssistant.forEach(row => {
      if (!totals[row.assistant_id]) {
        totals[row.assistant_id] = { name: row.assistant_name, calls: 0 };
      }
      totals[row.assistant_id].calls += row.calls_total;
    });
    return Object.entries(totals)
      .map(([id, data]) => ({ id, name: data.name, calls: data.calls }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5);
  }, [vapiByAssistant]);
  
  // Format hourly data
  const hourlyFormatted = useMemo(() => {
    return vapiHourly.map(h => ({
      ...h,
      label: `${h.hour}h`,
    }));
  }, [vapiHourly]);
  
  return (
    <div className="space-y-8">
      <PinnSectionHeader
        title="Agente de Voz (VAPI)"
        subtitle="Performance completa do agente de ligações"
        icon={Phone}
        badge="Prioridade"
      />
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <PinnKPICard
          label="Total de Ligações"
          value={vapiKPIs.total_calls.toLocaleString('pt-BR')}
          subtitle={`Período de ${period} dias`}
          icon={PhoneCall}
          accentColor="orange"
          glow
        />
        <PinnKPICard
          label="Média por Dia"
          value={vapiKPIs.avg_calls_per_day.toLocaleString('pt-BR')}
          subtitle="Ligações/dia"
          icon={Activity}
          accentColor="blue"
        />
        <PinnKPICard
          label="Dias Ativos"
          value={vapiKPIs.active_days.toString()}
          subtitle="Com pelo menos 1 ligação"
          icon={Calendar}
          accentColor="green"
        />
        <PinnKPICard
          label="Taxa de Contato"
          value={vapiKPIs.contact_rate !== null 
            ? `${vapiKPIs.contact_rate.toFixed(1)}%` 
            : '—'}
          subtitle={vapiKPIs.contact_rate !== null ? "Atendidas/Total" : "Não disponível"}
          icon={Users}
          accentColor="purple"
        />
      </div>
      
      {/* Main Chart - Daily Calls */}
      <PinnChart title="Ligações feitas por dia" subtitle="Volume diário de chamadas" height="h-[350px]">
        {vapiDaily.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={vapiDaily}>
              <defs>
                <linearGradient id="vapiGradientTab" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
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
                dataKey="calls_total"
                name="Ligações"
                stroke="#FF6B00"
                strokeWidth={3}
                fill="url(#vapiGradientTab)"
                dot={false}
                activeDot={{ r: 6, fill: '#FF6B00', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-white/40">
            <p>Sem dados de ligações no período</p>
          </div>
        )}
      </PinnChart>
      
      {/* Secondary Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* By Hour */}
        <PinnChart title="Ligações por Hora" subtitle="Distribuição ao longo do dia" height="h-[280px]">
          {hourlyFormatted.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyFormatted}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis 
                  dataKey="label"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<PinnTooltip />} />
                <Bar dataKey="calls_total" name="Ligações" radius={[4, 4, 0, 0]}>
                  {hourlyFormatted.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={`rgba(255, 107, 0, ${0.3 + (entry.calls_total / Math.max(...hourlyFormatted.map(h => h.calls_total), 1)) * 0.7})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-white/40">
              <p>Sem dados por hora</p>
            </div>
          )}
        </PinnChart>
        
        {/* By Assistant */}
        <PinnChart title="Top Agentes" subtitle="Ranking por volume de ligações" height="h-[280px]">
          {assistantTotals.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assistantTotals} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis 
                  type="number"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  type="category"
                  dataKey="name"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip content={<PinnTooltip />} />
                <Bar dataKey="calls" name="Ligações" fill="#FF6B00" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-white/40">
              <p>Sem dados por agente</p>
            </div>
          )}
        </PinnChart>
      </div>
    </div>
  );
}
