// ============================================================
// PINN AFONSINA DASHBOARD - Dashboard completo estilo Pinn
// ============================================================

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, subDays, parseISO, startOfDay, endOfDay, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { 
  Phone, 
  PhoneCall, 
  Calendar, 
  Activity, 
  TrendingUp, 
  BarChart3,
  RefreshCw,
  AlertCircle,
  Users,
  DollarSign,
  Target,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

import { PinnGlassCard, PinnGlassCardContent } from './PinnGlassCard';
import { PinnKPICard } from './PinnKPICard';
import { PinnChart } from './PinnChart';
import { PinnPeriodSelector } from './PinnPeriodSelector';
import { PinnSectionHeader } from './PinnSectionHeader';
import { useVapiDashboardData } from '@/hooks/useVapiDashboardData';
import { useAfonsinaDashboardData } from '@/hooks/useAfonsinaDashboardData';

interface DateRange {
  start: Date;
  end: Date;
}

interface PinnAfonsinaDashboardProps {
  dashboardId: string;
  dashboardName?: string;
  className?: string;
}

const PRESETS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
];

// Custom tooltip for Pinn charts
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

export default function PinnAfonsinaDashboard({
  dashboardId,
  dashboardName = 'Dashboard',
  className,
}: PinnAfonsinaDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Date range state
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
        // Fallback
      }
    }
    
    return {
      start: startOfDay(subDays(new Date(), 30)),
      end: endOfDay(new Date()),
    };
  });
  
  const [selectedPreset, setSelectedPreset] = useState<number | null>(30);
  
  // Format dates for API
  const startDate = format(dateRange.start, 'yyyy-MM-dd');
  const endDate = format(dateRange.end, 'yyyy-MM-dd');
  
  // Fetch VAPI data
  const {
    kpis: vapiKpis,
    dailySeries: vapiDaily,
    isLoading: vapiLoading,
    isError: vapiError,
    refetch: vapiRefetch,
  } = useVapiDashboardData({
    startDate,
    endDate,
    enabled: true,
  });
  
  // Fetch traffic data
  const {
    kpis: trafficKpis,
    dailySeries: trafficDaily,
    isLoading: trafficLoading,
    isError: trafficError,
    refetch: trafficRefetch,
  } = useAfonsinaDashboardData({
    startDate,
    endDate,
    compareEnabled: false,
    enabled: true,
  });
  
  // Handle preset selection
  const handlePresetSelect = (days: number) => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(end, days));
    setDateRange({ start, end });
    setSelectedPreset(days);
    setSearchParams({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  };
  
  // Refresh all data
  const handleRefresh = () => {
    vapiRefetch();
    trafficRefetch();
  };
  
  const isLoading = vapiLoading || trafficLoading;
  
  // Format date for chart
  const formatDate = (dateValue: string) => {
    try {
      return format(parseISO(dateValue), 'dd/MM', { locale: ptBR });
    } catch {
      return dateValue;
    }
  };
  
  // Format duration
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };
  
  // Loading state
  if (isLoading) {
    return (
      <div className={cn("min-h-screen bg-pinn-dark p-6 space-y-8", className)}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48 bg-white/5" />
          <Skeleton className="h-10 w-64 bg-white/5" />
        </div>
        
        {/* KPI skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 rounded-2xl bg-white/5" />
          ))}
        </div>
        
        {/* Chart skeleton */}
        <Skeleton className="h-80 rounded-2xl bg-white/5" />
      </div>
    );
  }
  
  return (
    <div className={cn(
      "min-h-screen bg-pinn-dark",
      "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-pinn-dark-lighter via-pinn-dark to-pinn-dark",
      className
    )}>
      {/* Subtle glow effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-pinn-orange/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-pinn-orange/3 rounded-full blur-3xl" />
      </div>
      
      <div className="relative z-10 p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
              {dashboardName}
            </h1>
            <p className="text-sm text-white/40 mt-1">
              {format(dateRange.start, 'dd MMM', { locale: ptBR })} — {format(dateRange.end, 'dd MMM yyyy', { locale: ptBR })}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Period selector */}
            <PinnPeriodSelector
              options={PRESETS}
              selected={selectedPreset}
              onSelect={handlePresetSelect}
            />
            
            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
            >
              <RefreshCw className="h-5 w-5 text-white/60" />
            </button>
          </div>
        </header>
        
        {/* ===== SEÇÃO VAPI ===== */}
        <section className="space-y-6">
          <PinnSectionHeader
            title="Agente de Voz (VAPI)"
            subtitle="Performance do agente de ligações"
            icon={Phone}
            badge="Prioridade"
          />
          
          {/* VAPI KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PinnKPICard
              label="Total de Ligações"
              value={vapiKpis.total_calls.toLocaleString('pt-BR')}
              subtitle={`No período de ${selectedPreset || 30} dias`}
              icon={PhoneCall}
              accentColor="orange"
              glow
            />
            <PinnKPICard
              label="Média por Dia"
              value={vapiKpis.avg_calls_per_day.toLocaleString('pt-BR')}
              subtitle="Ligações diárias"
              icon={Activity}
              accentColor="blue"
            />
            <PinnKPICard
              label="Dias Ativos"
              value={vapiKpis.active_days}
              subtitle="Com pelo menos 1 ligação"
              icon={Calendar}
              accentColor="green"
            />
          </div>
          
          {/* VAPI Chart */}
          <PinnChart
            title="Ligações feitas por dia (VAPI)"
            subtitle="Evolução do volume de chamadas"
          >
            {vapiDaily.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={vapiDaily}>
                  <defs>
                    <linearGradient id="vapiGradient" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#vapiGradient)"
                    dot={false}
                    activeDot={{ 
                      r: 6, 
                      fill: '#FF6B00', 
                      stroke: '#fff',
                      strokeWidth: 2 
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-white/40">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Sem dados no período selecionado</p>
                </div>
              </div>
            )}
          </PinnChart>
          
          {/* Duration metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PinnKPICard
              label="Duração Média"
              value={formatDuration(vapiKpis.avg_duration_seconds)}
              subtitle="Por ligação"
              icon={Clock}
              accentColor="purple"
            />
            <PinnKPICard
              label="Tempo Total"
              value={`${Math.floor(vapiKpis.total_duration_minutes / 60)}h ${vapiKpis.total_duration_minutes % 60}m`}
              subtitle="Em ligações no período"
              icon={Clock}
              accentColor="blue"
            />
          </div>
        </section>
        
        {/* ===== SEÇÃO TRÁFEGO ===== */}
        <section className="space-y-6 pt-8 border-t border-white/[0.06]">
          <PinnSectionHeader
            title="Tráfego / Ads"
            subtitle="Performance de aquisição"
            icon={BarChart3}
          />
          
          {/* Traffic KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <PinnKPICard
              label="Investimento"
              value={trafficKpis.investimento_total > 0 
                ? `R$ ${trafficKpis.investimento_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : '—'
              }
              icon={DollarSign}
              accentColor="green"
            />
            <PinnKPICard
              label="Leads"
              value={trafficKpis.leads_total.toLocaleString('pt-BR')}
              icon={Users}
              accentColor="blue"
            />
            <PinnKPICard
              label="CPL"
              value={trafficKpis.cpl !== null 
                ? `R$ ${trafficKpis.cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : '—'
              }
              icon={Target}
              accentColor="orange"
            />
            <PinnKPICard
              label="Taxa de Entrada"
              value={trafficKpis.taxa_entrada !== null 
                ? `${trafficKpis.taxa_entrada.toFixed(1)}%`
                : '—'
              }
              icon={TrendingUp}
              accentColor="purple"
            />
          </div>
          
          {/* Traffic Charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Leads chart */}
            <PinnChart
              title="Leads por Dia"
              subtitle="Volume de captação"
            >
              {trafficDaily.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficDaily}>
                    <defs>
                      <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="rgba(255,255,255,0.06)" 
                      vertical={false} 
                    />
                    <XAxis 
                      dataKey="date" 
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
                      dataKey="leads"
                      name="Leads"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="url(#leadsGradient)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-white/40">
                  Sem dados disponíveis
                </div>
              )}
            </PinnChart>
            
            {/* CPL chart */}
            <PinnChart
              title="CPL ao Longo do Tempo"
              subtitle="Custo por lead"
            >
              {trafficDaily.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficDaily}>
                    <defs>
                      <linearGradient id="cplGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="rgba(255,255,255,0.06)" 
                      vertical={false} 
                    />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatDate}
                      tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                      tickFormatter={(v) => `R$${v}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<PinnTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="cpl"
                      name="CPL"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#cplGradient)"
                      dot={false}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-white/40">
                  Sem dados disponíveis
                </div>
              )}
            </PinnChart>
          </div>
        </section>
      </div>
    </div>
  );
}
