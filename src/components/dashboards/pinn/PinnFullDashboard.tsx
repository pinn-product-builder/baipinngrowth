// ============================================================
// PINN FULL DASHBOARD - Dashboard completo com 4 tabs
// Estilo premium PinnPB com todas as views integradas
// ============================================================

import { useState, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Phone, 
  Filter,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';

// Hooks
import {
  useDashboardKPIs,
  useVapiCallsDaily,
  useVapiCallsHourly,
  useVapiByAssistant,
  useFunnelCurrent,
  useMeetingsKPIs,
  useMeetingsUpcoming,
  useAgentKPIs,
  useKommoMsgDaily,
  useKommoHeatmap,
  useVapiComputedKPIs,
} from '@/hooks/useDashboardViews';

// Components
import { PinnPeriodSelector } from './PinnPeriodSelector';

// Tab components
import { OverviewTab } from './tabs/OverviewTab';
import { AgentTab } from './tabs/AgentTab';
import { VapiTab } from './tabs/VapiTab';
import { FunnelTab } from './tabs/FunnelTab';

const PERIOD_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
];

interface PinnFullDashboardProps {
  dashboardId: string;
  dashboardName?: string;
  className?: string;
}

export default function PinnFullDashboard({
  dashboardId,
  dashboardName = 'Dashboard',
  className,
}: PinnFullDashboardProps) {
  const { user, profile } = useAuth();
  const [period, setPeriod] = useState<7 | 30 | 60>(30);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Get org_id from profile
  const orgId = profile?.tenant_id || null;
  
  // Fetch all data
  const { data: dashboardKPIs, isLoading: kpisLoading, refetch: refetchKPIs } = useDashboardKPIs(orgId, period);
  const { data: vapiDaily, isLoading: vapiLoading, refetch: refetchVapi } = useVapiCallsDaily(orgId, period);
  const { data: vapiHourly } = useVapiCallsHourly(orgId);
  const { data: vapiByAssistant } = useVapiByAssistant(orgId, period);
  const { data: funnelStages, isLoading: funnelLoading } = useFunnelCurrent(orgId);
  const { data: meetingsKPIs } = useMeetingsKPIs(orgId, period <= 7 ? 7 : 30);
  const { data: meetingsUpcoming } = useMeetingsUpcoming(orgId);
  const { data: agentKPIs } = useAgentKPIs(orgId, period <= 7 ? 7 : 30);
  const { data: kommoDaily } = useKommoMsgDaily(orgId, period);
  const { data: kommoHeatmap } = useKommoHeatmap(orgId);
  
  // Computed VAPI KPIs
  const vapiKPIs = useVapiComputedKPIs(vapiDaily || []);
  
  // Date range display
  const dateRange = useMemo(() => {
    const end = new Date();
    const start = subDays(end, period);
    return {
      start: format(start, 'dd MMM', { locale: ptBR }),
      end: format(end, 'dd MMM yyyy', { locale: ptBR }),
    };
  }, [period]);
  
  // Refresh all data
  const handleRefresh = () => {
    refetchKPIs();
    refetchVapi();
  };
  
  const isLoading = kpisLoading || vapiLoading;
  
  // Loading state
  if (isLoading && !dashboardKPIs && !vapiDaily?.length) {
    return (
      <div className={cn("min-h-screen bg-pinn-dark p-6 space-y-8", className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48 bg-white/5" />
          <Skeleton className="h-10 w-64 bg-white/5" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 rounded-2xl bg-white/5" />
          ))}
        </div>
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
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-pinn-orange/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-pinn-orange/3 rounded-full blur-3xl" />
      </div>
      
      <div className="relative z-10 p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
              {dashboardName}
            </h1>
            <p className="text-sm text-white/40 mt-1">
              {dateRange.start} — {dateRange.end}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <PinnPeriodSelector
              options={PERIOD_OPTIONS}
              selected={period}
              onSelect={(p) => setPeriod(p as 7 | 30 | 60)}
            />
            
            <button
              onClick={handleRefresh}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
            >
              <RefreshCw className="h-5 w-5 text-white/60" />
            </button>
          </div>
        </header>
        
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
            <TabsTrigger 
              value="overview" 
              className="data-[state=active]:bg-pinn-orange data-[state=active]:text-white rounded-lg px-4 py-2 text-white/60"
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger 
              value="agent"
              className="data-[state=active]:bg-pinn-orange data-[state=active]:text-white rounded-lg px-4 py-2 text-white/60"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Agente
            </TabsTrigger>
            <TabsTrigger 
              value="vapi"
              className="data-[state=active]:bg-pinn-orange data-[state=active]:text-white rounded-lg px-4 py-2 text-white/60"
            >
              <Phone className="h-4 w-4 mr-2" />
              VAPI
            </TabsTrigger>
            <TabsTrigger 
              value="funnel"
              className="data-[state=active]:bg-pinn-orange data-[state=active]:text-white rounded-lg px-4 py-2 text-white/60"
            >
              <Filter className="h-4 w-4 mr-2" />
              Funil
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="mt-6">
            <OverviewTab
              kpis={dashboardKPIs}
              vapiKPIs={vapiKPIs}
              vapiDaily={vapiDaily || []}
              kommoDaily={kommoDaily || []}
              meetingsKPIs={meetingsKPIs}
              meetingsUpcoming={meetingsUpcoming || []}
              period={period}
            />
          </TabsContent>
          
          <TabsContent value="agent" className="mt-6">
            <AgentTab
              agentKPIs={agentKPIs}
              kommoDaily={kommoDaily || []}
              kommoHeatmap={kommoHeatmap || []}
              period={period}
            />
          </TabsContent>
          
          <TabsContent value="vapi" className="mt-6">
            <VapiTab
              vapiKPIs={vapiKPIs}
              vapiDaily={vapiDaily || []}
              vapiHourly={vapiHourly || []}
              vapiByAssistant={vapiByAssistant || []}
              period={period}
            />
          </TabsContent>
          
          <TabsContent value="funnel" className="mt-6">
            <FunnelTab
              stages={funnelStages || []}
              isLoading={funnelLoading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
