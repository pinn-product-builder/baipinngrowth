import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  Database,
  Clock,
  BarChart3,
  Wifi,
  WifiOff
} from 'lucide-react';

interface DashboardStatus {
  id: string;
  name: string;
  tenant_name: string;
  is_active: boolean;
  last_health_status: string | null;
  last_health_check_at: string | null;
  last_fetched_at: string | null;
  last_error_message: string | null;
  source_kind: string;
  data_source_name: string | null;
}

interface DataSourceStatus {
  id: string;
  name: string;
  tenant_name: string;
  is_active: boolean;
  project_url: string;
  anon_key_present: boolean;
  service_role_key_present: boolean;
}

export default function DashboardHealth() {
  const [dashboards, setDashboards] = useState<DashboardStatus[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      // Fetch dashboards with health info
      const { data: dashData, error: dashError } = await supabase
        .from('dashboards')
        .select(`
          id,
          name,
          is_active,
          last_health_status,
          last_health_check_at,
          last_fetched_at,
          last_error_message,
          source_kind,
          tenants!inner(name),
          tenant_data_sources(name)
        `)
        .order('name');

      if (dashError) throw dashError;

      setDashboards(
        (dashData || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          tenant_name: d.tenants?.name || 'N/A',
          is_active: d.is_active,
          last_health_status: d.last_health_status,
          last_health_check_at: d.last_health_check_at,
          last_fetched_at: d.last_fetched_at,
          last_error_message: d.last_error_message,
          source_kind: d.source_kind,
          data_source_name: d.tenant_data_sources?.name || null,
        }))
      );

      // Fetch data sources
      const { data: dsData, error: dsError } = await supabase
        .from('tenant_data_sources')
        .select(`
          id,
          name,
          is_active,
          project_url,
          anon_key_present,
          service_role_key_present,
          tenants!inner(name)
        `)
        .order('name');

      if (dsError) throw dsError;

      setDataSources(
        (dsData || []).map((ds: any) => ({
          id: ds.id,
          name: ds.name,
          tenant_name: ds.tenants?.name || 'N/A',
          is_active: ds.is_active,
          project_url: ds.project_url,
          anon_key_present: ds.anon_key_present,
          service_role_key_present: ds.service_role_key_present,
        }))
      );
    } catch (error) {
      console.error('Error fetching health data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Nunca';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  // Calculate stats
  const activeDashboards = dashboards.filter(d => d.is_active);
  const healthyDashboards = dashboards.filter(d => d.last_health_status === 'ok');
  const errorDashboards = dashboards.filter(d => d.last_health_status === 'error');
  const activeDataSources = dataSources.filter(ds => ds.is_active);
  const configuredDataSources = dataSources.filter(ds => ds.anon_key_present || ds.service_role_key_present);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Health Monitor"
          description="Status de dashboards e conexões"
        />
        <Button onClick={handleRefresh} variant="outline" disabled={isRefreshing}>
          {isRefreshing ? (
            <LoadingSpinner className="mr-2 h-4 w-4" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeDashboards.length}</p>
                <p className="text-sm text-muted-foreground">Dashboards ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{healthyDashboards.length}</p>
                <p className="text-sm text-muted-foreground">Saudáveis</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{errorDashboards.length}</p>
                <p className="text-sm text-muted-foreground">Com erro</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary">
                <Database className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{configuredDataSources.length}/{dataSources.length}</p>
                <p className="text-sm text-muted-foreground">Data Sources</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Dashboards Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Dashboards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {dashboards.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum dashboard encontrado
                  </p>
                ) : (
                  dashboards.map(dash => (
                    <div
                      key={dash.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {getStatusIcon(dash.last_health_status)}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{dash.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {dash.tenant_name} • {dash.data_source_name || dash.source_kind}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!dash.is_active && (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatTime(dash.last_fetched_at)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Data Sources Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {dataSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum data source encontrado
                  </p>
                ) : (
                  dataSources.map(ds => (
                    <div
                      key={ds.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {ds.is_active && (ds.anon_key_present || ds.service_role_key_present) ? (
                          <Wifi className="h-4 w-4 text-success" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{ds.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {ds.tenant_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!ds.is_active && (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                        {ds.is_active && !ds.anon_key_present && !ds.service_role_key_present && (
                          <Badge variant="destructive">Sem chave</Badge>
                        )}
                        {ds.is_active && (ds.anon_key_present || ds.service_role_key_present) && (
                          <Badge variant="default" className="bg-success">OK</Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Recent Errors */}
      {errorDashboards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              Dashboards com Erro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {errorDashboards.map(dash => (
                <div
                  key={dash.id}
                  className="p-4 rounded-lg border border-destructive/20 bg-destructive/5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{dash.name}</p>
                      <p className="text-sm text-muted-foreground">{dash.tenant_name}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(dash.last_health_check_at)}
                    </span>
                  </div>
                  {dash.last_error_message && (
                    <div className="mt-2 p-2 rounded bg-background font-mono text-xs overflow-x-auto">
                      {dash.last_error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
