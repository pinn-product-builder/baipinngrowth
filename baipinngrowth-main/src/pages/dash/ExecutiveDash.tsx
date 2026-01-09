import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  RefreshCw, 
  DollarSign, 
  Users, 
  TrendingUp, 
  TrendingDown, 
  MessageSquare, 
  Calendar,
  Phone,
  Target,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Video,
  Clock,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============ Types ============
interface KPIs7d {
  leads_total_7d: number;
  spend_7d: number;
  cpl_7d: number;
  msg_in_7d: number;
  meetings_scheduled_7d: number;
  meetings_cancelled_7d: number;
  cpm_meeting_7d: number;
  conv_lead_to_msg_7d: number;
  conv_msg_to_meeting_7d: number;
  calls_total_7d?: number;
  meetings_upcoming?: number;
}

interface KPIs30d {
  leads_total_30d: number;
  spend_30d: number;
  cpl_30d: number;
  msg_in_30d: number;
  meetings_scheduled_30d: number;
  meetings_cancelled_30d: number;
  cpm_meeting_30d: number;
  conv_lead_to_msg_30d: number;
  conv_msg_to_meeting_30d: number;
  calls_total_30d?: number;
}

interface DailySeries {
  day: string;
  leads_new: number;
  spend: number;
  msg_in: number;
  meetings_scheduled: number;
}

interface FunnelStage {
  stage_name: string;
  stage_rank: number;
  leads_total: number;
}

interface UpcomingMeeting {
  start_at: string;
  end_at: string;
  summary: string;
  lead_name: string;
  lead_email: string;
  lead_phone: string;
  status: string;
  html_link: string;
  meeting_url: string;
}

interface AIInsight {
  alerts: Array<{ type: string; message: string; severity: string }>;
  insights: Array<{ title: string; description: string }>;
  recommendations: Array<{ action: string; priority: string }>;
}

interface DashboardData {
  kpis7d: KPIs7d | null;
  kpis30d: KPIs30d | null;
  dailySeries: DailySeries[];
  funnel: FunnelStage[];
  upcomingMeetings: UpcomingMeeting[];
  aiInsights: AIInsight | null;
}

// ============ Helpers ============
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const formatInteger = (value: number) => {
  return (value || 0).toLocaleString('pt-BR');
};

const formatPercent = (value: number) => {
  return `${((value || 0) * 100).toFixed(1)}%`;
};

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM', { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const formatDateFull = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), "dd/MM 'às' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

// Funnel colors
const FUNNEL_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

// ============ Component ============
export default function ExecutiveDash() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  // State
  const [data, setData] = useState<DashboardData>({
    kpis7d: null,
    kpis30d: null,
    dailySeries: [],
    funnel: [],
    upcomingMeetings: [],
    aiInsights: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all data from multiple views
  const fetchData = useCallback(async (showRefresh = false) => {
    if (!tenantId) {
      setError('Tenant não identificado');
      setIsLoading(false);
      return;
    }

    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Fetch all views in parallel
      const [kpis7dRes, kpis30dRes, dailyRes, funnelRes, meetingsRes, callsRes, insightsRes] = await Promise.all([
        // KPIs 7 dias
        supabase.functions.invoke('dashboard-data', {
          body: { view: 'vw_dashboard_kpis_7d_v3', orgId: tenantId },
        }),
        // KPIs 30 dias
        supabase.functions.invoke('dashboard-data', {
          body: { view: 'vw_dashboard_kpis_30d_v3', orgId: tenantId },
        }),
        // Série diária 60 dias
        supabase.functions.invoke('dashboard-data', {
          body: { view: 'vw_dashboard_daily_60d_v3', orgId: tenantId, limit: 60 },
        }),
        // Funil atual
        supabase.functions.invoke('dashboard-data', {
          body: { view: 'vw_funnel_current_v3', orgId: tenantId },
        }),
        // Próximas reuniões
        supabase.functions.invoke('dashboard-data', {
          body: { view: 'vw_meetings_upcoming_v3', orgId: tenantId, limit: 10 },
        }),
        // Ligações KPIs
        supabase.functions.invoke('dashboard-data', {
          body: { view: 'vw_calls_kpis_7d', orgId: tenantId },
        }),
        // AI Insights
        supabase.functions.invoke('dashboard-data', {
          body: { view: 'ai_insights', orgId: tenantId, limit: 1 },
        }),
      ]);

      // Process KPIs 7d
      const kpis7d = kpis7dRes.data?.data?.[0] || null;
      
      // Merge calls data into kpis7d
      if (kpis7d && callsRes.data?.data?.[0]) {
        kpis7d.calls_total_7d = callsRes.data.data[0].calls_total_7d;
      }

      // Process KPIs 30d
      const kpis30d = kpis30dRes.data?.data?.[0] || null;

      // Process daily series
      const dailySeries = (dailyRes.data?.data || [])
        .sort((a: DailySeries, b: DailySeries) => 
          new Date(a.day).getTime() - new Date(b.day).getTime()
        );

      // Process funnel
      const funnel = (funnelRes.data?.data || [])
        .sort((a: FunnelStage, b: FunnelStage) => a.stage_rank - b.stage_rank);

      // Process upcoming meetings
      const upcomingMeetings = (meetingsRes.data?.data || [])
        .sort((a: UpcomingMeeting, b: UpcomingMeeting) => 
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        );

      // Process AI insights
      const aiInsights = insightsRes.data?.data?.[0]?.payload || null;

      setData({
        kpis7d,
        kpis30d,
        dailySeries,
        funnel,
        upcomingMeetings,
        aiInsights,
      });

    } catch (err: any) {
      console.error('Error fetching executive data:', err);
      setError(err.message || 'Erro ao carregar dados');
      toast({
        title: 'Erro ao carregar dados',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tenantId, toast]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData(true);
  };

  // ============ KPI Card Component ============
  const KPICard = ({ 
    label, 
    value7d, 
    value30d, 
    format: formatFn = formatInteger,
    icon: Icon = TrendingUp,
    showComparison = true
  }: { 
    label: string; 
    value7d: number | undefined; 
    value30d?: number | undefined;
    format?: (v: number) => string;
    icon?: any;
    showComparison?: boolean;
  }) => {
    const change = value7d !== undefined && value30d !== undefined && value30d > 0
      ? ((value7d - (value30d / 30 * 7)) / (value30d / 30 * 7)) * 100
      : null;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {value7d !== undefined ? formatFn(value7d) : '-'}
          </div>
          {showComparison && value30d !== undefined && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                30d: {formatFn(value30d)}
              </span>
              {change !== null && (
                <Badge variant={change >= 0 ? 'default' : 'destructive'} className="text-xs">
                  {change >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {Math.abs(change).toFixed(0)}%
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // ============ Loading State ============
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard Executivo"
          description="Visão geral dos principais indicadores"
        />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-16 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ============ Error State ============
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard Executivo"
          description="Visão geral dos principais indicadores"
        />
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-4 py-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-medium">Erro ao carregar dados</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={handleRefresh} variant="outline" className="ml-auto">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { kpis7d, kpis30d, dailySeries, funnel, upcomingMeetings, aiInsights } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Dashboard Executivo"
          description="Visão geral dos principais indicadores"
        />
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* AI Insights Alert */}
      {aiInsights?.alerts && aiInsights.alerts.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Alertas de IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {aiInsights.alerts.slice(0, 3).map((alert, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge variant={alert.severity === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                    {alert.type}
                  </Badge>
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs Grid - 7d with 30d comparison */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KPICard 
          label="Leads" 
          value7d={kpis7d?.leads_total_7d} 
          value30d={kpis30d?.leads_total_30d}
          icon={Users}
        />
        <KPICard 
          label="Investimento" 
          value7d={kpis7d?.spend_7d} 
          value30d={kpis30d?.spend_30d}
          format={formatCurrency}
          icon={DollarSign}
        />
        <KPICard 
          label="CPL" 
          value7d={kpis7d?.cpl_7d} 
          value30d={kpis30d?.cpl_30d}
          format={formatCurrency}
          icon={Target}
        />
        <KPICard 
          label="Mensagens" 
          value7d={kpis7d?.msg_in_7d} 
          value30d={kpis30d?.msg_in_30d}
          icon={MessageSquare}
        />
        <KPICard 
          label="Reuniões Agendadas" 
          value7d={kpis7d?.meetings_scheduled_7d} 
          value30d={kpis30d?.meetings_scheduled_30d}
          icon={Calendar}
        />
        <KPICard 
          label="Reuniões Canceladas" 
          value7d={kpis7d?.meetings_cancelled_7d} 
          value30d={kpis30d?.meetings_cancelled_30d}
          icon={Calendar}
        />
        <KPICard 
          label="Custo/Reunião" 
          value7d={kpis7d?.cpm_meeting_7d} 
          value30d={kpis30d?.cpm_meeting_30d}
          format={formatCurrency}
          icon={DollarSign}
        />
        <KPICard 
          label="Conv. Lead→Msg" 
          value7d={kpis7d?.conv_lead_to_msg_7d} 
          value30d={kpis30d?.conv_lead_to_msg_30d}
          format={formatPercent}
          icon={ArrowRight}
        />
        <KPICard 
          label="Conv. Msg→Reunião" 
          value7d={kpis7d?.conv_msg_to_meeting_7d} 
          value30d={kpis30d?.conv_msg_to_meeting_30d}
          format={formatPercent}
          icon={ArrowRight}
        />
        <KPICard 
          label="Ligações" 
          value7d={kpis7d?.calls_total_7d} 
          showComparison={false}
          icon={Phone}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Leads & Spend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads e Investimento (60 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    labelFormatter={formatDateFull}
                    formatter={(value: number, name: string) => {
                      if (name === 'Investimento') return formatCurrency(value);
                      return formatInteger(value);
                    }}
                  />
                  <Legend />
                  <Line yAxisId="right" type="monotone" dataKey="spend" name="Investimento" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="leads_new" name="Leads" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Meetings & Messages Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mensagens e Reuniões (60 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={formatDateFull} formatter={(value: number) => formatInteger(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="msg_in" name="Mensagens" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="meetings_scheduled" name="Reuniões" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel & Meetings Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funil de Conversão</CardTitle>
            <CardDescription>Distribuição atual por etapa</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnel} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis 
                      type="category" 
                      dataKey="stage_name" 
                      tick={{ fontSize: 11 }} 
                      width={120}
                    />
                    <Tooltip formatter={(value: number) => formatInteger(value)} />
                    <Bar dataKey="leads_total" radius={[0, 4, 4, 0]}>
                      {funnel.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                Nenhum dado de funil disponível
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Meetings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4" />
              Próximas Reuniões
            </CardTitle>
            <CardDescription>{upcomingMeetings.length} reuniões agendadas</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingMeetings.length > 0 ? (
              <ScrollArea className="h-[280px]">
                <div className="space-y-3">
                  {upcomingMeetings.map((meeting, i) => (
                    <div 
                      key={i} 
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex-shrink-0 w-12 text-center">
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(meeting.start_at), 'dd/MM')}
                        </div>
                        <div className="text-sm font-medium">
                          {format(parseISO(meeting.start_at), 'HH:mm')}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{meeting.summary || 'Reunião'}</p>
                        <p className="text-xs text-muted-foreground truncate">{meeting.lead_name}</p>
                        {meeting.lead_phone && (
                          <p className="text-xs text-muted-foreground">{meeting.lead_phone}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <Badge variant={meeting.status === 'confirmed' ? 'default' : 'secondary'}>
                          {meeting.status}
                        </Badge>
                      </div>
                      {meeting.meeting_url && (
                        <a 
                          href={meeting.meeting_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex-shrink-0"
                        >
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                Nenhuma reunião próxima
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendations */}
      {aiInsights?.recommendations && aiInsights.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Recomendações de IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {aiInsights.recommendations.map((rec, i) => (
                <div key={i} className="p-3 rounded-lg border bg-card">
                  <Badge variant={rec.priority === 'high' ? 'default' : 'secondary'} className="mb-2">
                    {rec.priority === 'high' ? 'Alta' : rec.priority === 'medium' ? 'Média' : 'Baixa'}
                  </Badge>
                  <p className="text-sm">{rec.action}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer info */}
      <div className="text-xs text-muted-foreground text-right">
        Atualizado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </div>
    </div>
  );
}
