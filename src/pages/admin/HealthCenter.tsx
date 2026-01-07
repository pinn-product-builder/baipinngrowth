import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Database,
  Server,
  Cpu,
  Activity,
  Clock,
  BarChart3,
  Zap,
  AlertCircle,
  Eye,
  ChevronRight
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DataSourceHealth {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  project_url: string;
  last_check?: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  latency_ms?: number;
  error_message?: string;
}

interface DashboardHealth {
  id: string;
  name: string;
  tenant_name: string;
  is_active: boolean;
  last_fetched_at?: string;
  last_health_status?: string;
  last_error_message?: string;
  data_source_name?: string;
}

interface HealthEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  source: string;
  source_name?: string;
  trace_id?: string;
  error_code?: string;
  message: string;
  details: Record<string, unknown>;
  resolved_at?: string;
  created_at: string;
}

interface HealthMetrics {
  datasources: { total: number; healthy: number; warning: number; error: number };
  dashboards: { total: number; active: number; inactive: number; errored: number };
  ai: { requests24h: number; errors24h: number; avgLatency: number; totalCost: number };
  events: { unresolved: number; last24h: number };
}

export default function HealthCenter() {
  const { userRole, tenantId } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceHealth[]>([]);
  const [dashboards, setDashboards] = useState<DashboardHealth[]>([]);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);

  const isAdmin = userRole === 'admin';

  const fetchHealthData = async () => {
    try {
      // Fetch data sources
      const dsQuery = supabase
        .from('tenant_data_sources')
        .select('id, name, type, is_active, project_url, tenant_id');
      
      if (!isAdmin && tenantId) {
        dsQuery.eq('tenant_id', tenantId);
      }
      
      const { data: dsData } = await dsQuery;
      
      const mappedDs: DataSourceHealth[] = (dsData || []).map(ds => ({
        id: ds.id,
        name: ds.name,
        type: ds.type,
        is_active: ds.is_active,
        project_url: ds.project_url,
        status: ds.is_active ? 'healthy' : 'warning',
      }));
      setDataSources(mappedDs);

      // Fetch dashboards with health info
      const dashQuery = supabase
        .from('dashboards')
        .select(`
          id, 
          name, 
          is_active, 
          last_fetched_at, 
          last_health_status, 
          last_error_message,
          tenant_id,
          tenants:tenant_id(name),
          tenant_data_sources:data_source_id(name)
        `)
        .order('updated_at', { ascending: false })
        .limit(50);
      
      if (!isAdmin && tenantId) {
        dashQuery.eq('tenant_id', tenantId);
      }
      
      const { data: dashData } = await dashQuery;
      
      const mappedDash: DashboardHealth[] = (dashData || []).map(d => ({
        id: d.id,
        name: d.name,
        tenant_name: (d.tenants as any)?.name || 'Unknown',
        is_active: d.is_active,
        last_fetched_at: d.last_fetched_at,
        last_health_status: d.last_health_status,
        last_error_message: d.last_error_message,
        data_source_name: (d.tenant_data_sources as any)?.name,
      }));
      setDashboards(mappedDash);

      // Fetch health events
      const eventsQuery = supabase
        .from('system_health_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (!isAdmin && tenantId) {
        eventsQuery.eq('tenant_id', tenantId);
      }
      
      const { data: eventsData } = await eventsQuery;
      setEvents((eventsData || []) as HealthEvent[]);

      // Fetch AI usage for metrics
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const aiQuery = supabase
        .from('ai_usage_logs')
        .select('status, latency_ms, cost_estimated, created_at')
        .gte('created_at', yesterday.toISOString());
      
      if (!isAdmin && tenantId) {
        aiQuery.eq('tenant_id', tenantId);
      }
      
      const { data: aiData } = await aiQuery;
      
      // Calculate metrics
      const aiLogs = aiData || [];
      const aiErrors = aiLogs.filter(l => l.status === 'error').length;
      const avgLatency = aiLogs.length > 0 
        ? aiLogs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) / aiLogs.length 
        : 0;
      const totalCost = aiLogs.reduce((sum, l) => sum + (Number(l.cost_estimated) || 0), 0);
      
      const unresolvedEvents = (eventsData || []).filter((e: any) => !e.resolved_at).length;
      const last24hEvents = (eventsData || []).filter((e: any) => 
        new Date(e.created_at) > yesterday
      ).length;

      setMetrics({
        datasources: {
          total: mappedDs.length,
          healthy: mappedDs.filter(d => d.status === 'healthy').length,
          warning: mappedDs.filter(d => d.status === 'warning').length,
          error: mappedDs.filter(d => d.status === 'error').length,
        },
        dashboards: {
          total: mappedDash.length,
          active: mappedDash.filter(d => d.is_active).length,
          inactive: mappedDash.filter(d => !d.is_active).length,
          errored: mappedDash.filter(d => d.last_health_status === 'error').length,
        },
        ai: {
          requests24h: aiLogs.length,
          errors24h: aiErrors,
          avgLatency: Math.round(avgLatency),
          totalCost,
        },
        events: {
          unresolved: unresolvedEvents,
          last24h: last24hEvents,
        },
      });

    } catch (error) {
      console.error('Error fetching health data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
  }, [tenantId, isAdmin]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchHealthData();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventTypeBadge = (type: string) => {
    switch (type) {
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500">Aviso</Badge>;
      case 'info':
        return <Badge variant="secondary">Info</Badge>;
      case 'alert':
        return <Badge className="bg-orange-500">Alerta</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const formatTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'Nunca';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health Center"
        description="Monitoramento de saúde do sistema, data sources, dashboards e IA"
        actions={
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        }
      />

      {/* Summary Cards */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Data Sources</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.datasources.healthy}/{metrics.datasources.total}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.datasources.warning > 0 && (
                  <span className="text-yellow-500">{metrics.datasources.warning} avisos</span>
                )}
                {metrics.datasources.error > 0 && (
                  <span className="text-red-500 ml-2">{metrics.datasources.error} erros</span>
                )}
                {metrics.datasources.warning === 0 && metrics.datasources.error === 0 && (
                  <span className="text-green-500">Todos saudáveis</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Dashboards</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.dashboards.active}/{metrics.dashboards.total}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.dashboards.errored > 0 ? (
                  <span className="text-red-500">{metrics.dashboards.errored} com erros</span>
                ) : (
                  <span className="text-green-500">Todos funcionando</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">IA (24h)</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.ai.requests24h}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.ai.errors24h > 0 ? (
                  <span className="text-red-500">{metrics.ai.errors24h} erros</span>
                ) : (
                  <span className="text-green-500">Sem erros</span>
                )}
                <span className="ml-2">• {metrics.ai.avgLatency}ms avg</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Eventos</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.events.unresolved}</div>
              <p className="text-xs text-muted-foreground">
                não resolvidos
                <span className="ml-2">• {metrics.events.last24h} nas últimas 24h</span>
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="datasources">Data Sources</TabsTrigger>
          <TabsTrigger value="dashboards">Dashboards</TabsTrigger>
          <TabsTrigger value="events">Eventos & Erros</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Recent Errors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  Erros Recentes
                </CardTitle>
                <CardDescription>Últimos erros registrados no sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {events.filter(e => e.event_type === 'error').length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                      <p>Nenhum erro recente</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {events
                        .filter(e => e.event_type === 'error')
                        .slice(0, 10)
                        .map(event => (
                          <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                            <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{event.message}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <span>{event.source_name || event.source}</span>
                                <span>•</span>
                                <span>{formatTime(event.created_at)}</span>
                                {event.trace_id && (
                                  <>
                                    <span>•</span>
                                    <code className="text-xs">{event.trace_id.slice(0, 8)}</code>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Data Source Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Status dos Data Sources
                </CardTitle>
                <CardDescription>Conectividade das fontes de dados</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {dataSources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Database className="h-8 w-8 mb-2" />
                      <p>Nenhum data source configurado</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dataSources.map(ds => (
                        <div key={ds.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          {getStatusIcon(ds.status)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{ds.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{ds.project_url}</p>
                          </div>
                          <Badge variant={ds.is_active ? 'default' : 'secondary'}>
                            {ds.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Dashboards with Issues */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Dashboards com Problemas
              </CardTitle>
              <CardDescription>Dashboards que precisam de atenção</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboards.filter(d => d.last_health_status === 'error' || d.last_error_message).length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <CheckCircle className="h-6 w-6 mr-2 text-green-500" />
                  <span>Todos os dashboards estão funcionando normalmente</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboards
                    .filter(d => d.last_health_status === 'error' || d.last_error_message)
                    .map(dash => (
                      <div key={dash.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{dash.name}</p>
                          <p className="text-xs text-muted-foreground">{dash.tenant_name}</p>
                          {dash.last_error_message && (
                            <p className="text-xs text-red-500 mt-1">{dash.last_error_message}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(dash.last_fetched_at)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="datasources">
          <Card>
            <CardHeader>
              <CardTitle>Data Sources</CardTitle>
              <CardDescription>Status detalhado de todas as fontes de dados</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dataSources.map(ds => (
                  <div key={ds.id} className="flex items-center gap-4 p-4 rounded-lg border">
                    {getStatusIcon(ds.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{ds.name}</h4>
                        <Badge variant="outline">{ds.type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{ds.project_url}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={ds.is_active ? 'default' : 'secondary'}>
                        {ds.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      {ds.latency_ms && (
                        <p className="text-xs text-muted-foreground mt-1">{ds.latency_ms}ms</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboards">
          <Card>
            <CardHeader>
              <CardTitle>Dashboards</CardTitle>
              <CardDescription>Status de todos os dashboards</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {dashboards.map(dash => (
                    <div key={dash.id} className="flex items-center gap-4 p-4 rounded-lg border">
                      {dash.last_health_status === 'error' ? (
                        <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                      ) : dash.is_active ? (
                        <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{dash.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{dash.tenant_name}</span>
                          {dash.data_source_name && (
                            <>
                              <span>•</span>
                              <span>{dash.data_source_name}</span>
                            </>
                          )}
                        </div>
                        {dash.last_error_message && (
                          <p className="text-xs text-red-500 mt-1 truncate">{dash.last_error_message}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant={dash.is_active ? 'default' : 'secondary'}>
                          {dash.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Último fetch: {formatTime(dash.last_fetched_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Eventos & Erros</CardTitle>
              <CardDescription>Histórico de eventos do sistema com trace IDs</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Activity className="h-8 w-8 mb-2" />
                    <p>Nenhum evento registrado</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {events.map(event => (
                      <div key={event.id} className="p-4 rounded-lg border">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0">
                            {event.event_type === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                            {event.event_type === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                            {event.event_type === 'info' && <AlertCircle className="h-5 w-5 text-blue-500" />}
                            {event.event_type === 'alert' && <Activity className="h-5 w-5 text-orange-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getEventTypeBadge(event.event_type)}
                              <Badge variant="outline">{event.source}</Badge>
                              {event.source_name && (
                                <span className="text-sm text-muted-foreground">{event.source_name}</span>
                              )}
                            </div>
                            <p className="text-sm">{event.message}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(event.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                              </span>
                              {event.trace_id && (
                                <span className="flex items-center gap-1">
                                  <code className="bg-muted px-1 py-0.5 rounded">{event.trace_id}</code>
                                </span>
                              )}
                              {event.error_code && (
                                <span className="flex items-center gap-1">
                                  <code className="bg-red-100 text-red-700 px-1 py-0.5 rounded">{event.error_code}</code>
                                </span>
                              )}
                              {event.resolved_at && (
                                <Badge variant="outline" className="text-green-600">
                                  Resolvido
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
