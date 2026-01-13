// ============================================================
// OVERVIEW TAB - Visão Geral Executiva
// ============================================================

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
  Phone,
  Users,
  MessageSquare,
  Calendar,
  ExternalLink,
} from 'lucide-react';

import { PinnKPICard } from '../PinnKPICard';
import { PinnChart } from '../PinnChart';
import { PinnSectionHeader } from '../PinnSectionHeader';
import { PinnGlassCard, PinnGlassCardHeader, PinnGlassCardContent } from '../PinnGlassCard';
import type { DashboardKPIs, VapiDailyData, MeetingsKPIs, MeetingUpcoming } from '@/hooks/useDashboardViews';

interface OverviewTabProps {
  kpis: DashboardKPIs | null | undefined;
  vapiKPIs: {
    total_calls: number;
    avg_calls_per_day: number;
    active_days: number;
    contact_rate: number | null;
  };
  vapiDaily: VapiDailyData[];
  kommoDaily: { day: string; msg_in_total: number }[];
  meetingsKPIs: MeetingsKPIs | null | undefined;
  meetingsUpcoming: MeetingUpcoming[];
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
    <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 min-w-[180px]">
      <p className="text-sm font-medium text-white mb-3 pb-2 border-b border-white/10">
        {formatDateFull(label)}
      </p>
      <div className="space-y-2">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-white/60">{entry.name}</span>
            </div>
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

export function OverviewTab({
  kpis,
  vapiKPIs,
  vapiDaily,
  kommoDaily,
  meetingsKPIs,
  meetingsUpcoming,
  period,
}: OverviewTabProps) {
  const formatDate = (dateValue: string) => {
    try {
      return format(parseISO(dateValue), 'dd/MM', { locale: ptBR });
    } catch {
      return dateValue;
    }
  };
  
  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <PinnKPICard
          label="Leads"
          value={kpis?.leads_total?.toLocaleString('pt-BR') || '0'}
          subtitle={`Últimos ${period} dias`}
          icon={Users}
          accentColor="blue"
        />
        <PinnKPICard
          label="Ligações (VAPI)"
          value={vapiKPIs.total_calls.toLocaleString('pt-BR')}
          subtitle={`${vapiKPIs.active_days} dias ativos`}
          icon={Phone}
          accentColor="orange"
          glow
        />
        <PinnKPICard
          label="Mensagens"
          value={kpis?.mensagens_recebidas?.toLocaleString('pt-BR') || '0'}
          subtitle="Kommo inbound"
          icon={MessageSquare}
          accentColor="green"
        />
        <PinnKPICard
          label="Reuniões"
          value={meetingsKPIs?.meetings_booked?.toLocaleString('pt-BR') || '0'}
          subtitle="Agendadas"
          icon={Calendar}
          accentColor="purple"
        />
      </div>
      
      {/* Main Chart - VAPI Calls */}
      <PinnSectionHeader
        title="Ligações feitas por dia (VAPI)"
        subtitle="Volume de chamadas realizadas pelo agente de voz"
        icon={Phone}
        badge="Destaque"
      />
      
      <PinnChart title="Evolução de Ligações" height="h-[350px]">
        {vapiDaily.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={vapiDaily}>
              <defs>
                <linearGradient id="vapiGradientOverview" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="rgba(255,255,255,0.06)" 
                vertical={false} 
              />
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
                strokeWidth={2.5}
                fill="url(#vapiGradientOverview)"
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
      
      {/* Secondary Chart - Messages */}
      {kommoDaily.length > 0 && (
        <PinnChart title="Mensagens Recebidas por Dia" subtitle="Kommo inbound" height="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={kommoDaily}>
              <defs>
                <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
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
                strokeWidth={2}
                fill="url(#msgGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </PinnChart>
      )}
      
      {/* Upcoming Meetings */}
      {meetingsUpcoming.length > 0 && (
        <>
          <PinnSectionHeader
            title="Próximas Reuniões"
            subtitle="Agendamentos confirmados"
            icon={Calendar}
          />
          
          <PinnGlassCard>
            <PinnGlassCardContent className="p-0">
              <div className="divide-y divide-white/[0.06]">
                {meetingsUpcoming.slice(0, 5).map((meeting, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-pinn-orange/20 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-pinn-orange" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{meeting.summary}</p>
                        <p className="text-sm text-white/40">
                          {meeting.lead_name || meeting.lead_email || 'Participante'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">
                          {format(parseISO(meeting.start_at), 'dd/MM HH:mm', { locale: ptBR })}
                        </p>
                        <p className="text-xs text-white/40 capitalize">{meeting.status}</p>
                      </div>
                      {meeting.meeting_url && (
                        <a
                          href={meeting.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4 text-white/60" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </PinnGlassCardContent>
          </PinnGlassCard>
        </>
      )}
    </div>
  );
}
