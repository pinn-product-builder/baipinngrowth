import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Loader2,
  Clock,
  Zap,
  DollarSign,
  TrendingUp,
  Filter
} from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UsageLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  dashboard_id: string | null;
  request_type: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_estimated: number | null;
  latency_ms: number | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface Dashboard {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  full_name: string | null;
}

export default function AIHealth() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [filterDashboard, setFilterDashboard] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('24h');
  
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch logs
      let query = supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      
      // Apply period filter
      if (filterPeriod === '24h') {
        query = query.gte('created_at', subDays(new Date(), 1).toISOString());
      } else if (filterPeriod === '7d') {
        query = query.gte('created_at', subDays(new Date(), 7).toISOString());
      } else if (filterPeriod === '30d') {
        query = query.gte('created_at', subDays(new Date(), 30).toISOString());
      }
      
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      
      if (filterTenant !== 'all') {
        query = query.eq('tenant_id', filterTenant);
      }
      
      if (filterDashboard !== 'all') {
        query = query.eq('dashboard_id', filterDashboard);
      }
      
      const { data: logsData } = await query;
      setLogs(logsData || []);
      
      // Fetch tenants for filter
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .order('name');
      setTenants(tenantsData || []);
      
      // Fetch dashboards
      const { data: dashboardsData } = await supabase
        .from('dashboards')
        .select('id, name')
        .order('name');
      setDashboards(dashboardsData || []);
      
      // Fetch profiles for user names
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name');
      setProfiles(profilesData || []);
      
    } catch (error) {
      console.error('Error fetching AI health data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, [filterTenant, filterDashboard, filterStatus, filterPeriod]);
  
  // Calculate metrics
  const metrics = useMemo(() => {
    const last24h = logs.filter(l => 
      new Date(l.created_at) > subDays(new Date(), 1)
    );
    
    const monthStart = startOfMonth(new Date());
    const thisMonth = logs.filter(l => new Date(l.created_at) >= monthStart);
    
    const requests24h = last24h.length;
    const errors24h = last24h.filter(l => l.status === 'error').length;
    const failRate24h = requests24h > 0 ? (errors24h / requests24h * 100) : 0;
    
    const latencies = last24h
      .filter(l => l.latency_ms !== null)
      .map(l => l.latency_ms!);
    const avgLatency = latencies.length > 0 
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
      : 0;
    
    const tokensToday = last24h.reduce((acc, l) => acc + (l.total_tokens || 0), 0);
    const tokensMonth = thisMonth.reduce((acc, l) => acc + (l.total_tokens || 0), 0);
    const costMonth = thisMonth.reduce((acc, l) => acc + Number(l.cost_estimated || 0), 0);
    
    return {
      requests24h,
      errors24h,
      failRate24h,
      avgLatency,
      tokensToday,
      tokensMonth,
      costMonth
    };
  }, [logs]);
  
  const getUserName = (userId: string | null) => {
    if (!userId) return 'Sistema';
    const profile = profiles.find(p => p.id === userId);
    return profile?.full_name || userId.slice(0, 8);
  };
  
  const getTenantName = (tenantId: string) => {
    const tenant = tenants.find(t => t.id === tenantId);
    return tenant?.name || tenantId.slice(0, 8);
  };
  
  const getDashboardName = (dashboardId: string | null) => {
    if (!dashboardId) return '-';
    const dashboard = dashboards.find(d => d.id === dashboardId);
    return dashboard?.name || dashboardId.slice(0, 8);
  };
  
  const getStatusBadge = (status: string, errorCode?: string | null) => {
    if (status === 'success') {
      return <Badge className="bg-green-500/20 text-green-700"><CheckCircle className="w-3 h-3 mr-1" />OK</Badge>;
    }
    return (
      <Badge variant="destructive" className="bg-red-500/20 text-red-700">
        <XCircle className="w-3 h-3 mr-1" />
        {errorCode || 'Erro'}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Health</h1>
          <p className="text-muted-foreground">Monitore uso, erros e latência das chamadas de IA</p>
        </div>
        <Button onClick={fetchData} variant="outline" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Requests 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.requests24h.toLocaleString('pt-BR')}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.errors24h} erros
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${metrics.failRate24h > 5 ? 'text-red-500' : 'text-yellow-500'}`} />
              Fail Rate 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.failRate24h > 5 ? 'text-red-500' : ''}`}>
              {metrics.failRate24h.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.failRate24h < 2 ? 'Saudável' : metrics.failRate24h < 5 ? 'Atenção' : 'Crítico'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              Latência Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(metrics.avgLatency).toLocaleString('pt-BR')}ms</div>
            <p className="text-xs text-muted-foreground">
              {metrics.avgLatency < 2000 ? 'Bom' : metrics.avgLatency < 5000 ? 'Lento' : 'Muito lento'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              Custo Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics.costMonth.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.tokensMonth.toLocaleString('pt-BR')} tokens
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Token Usage */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Tokens Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.tokensToday.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Tokens Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.tokensMonth.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Últimas Requisições
          </CardTitle>
          <CardDescription>
            Histórico detalhado de chamadas à IA
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 horas</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="all">Tudo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterTenant} onValueChange={setFilterTenant}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tenants</SelectItem>
                {tenants.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterDashboard} onValueChange={setFilterDashboard}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Dashboard" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os dashboards</SelectItem>
                {dashboards.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Dashboard</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Latência</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.slice(0, 50).map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-32 truncate">
                        {getTenantName(log.tenant_id)}
                      </TableCell>
                      <TableCell className="max-w-32 truncate">
                        {getUserName(log.user_id)}
                      </TableCell>
                      <TableCell className="max-w-32 truncate">
                        {getDashboardName(log.dashboard_id)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.request_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.model || '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {log.total_tokens?.toLocaleString('pt-BR') || '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {log.latency_ms ? `${log.latency_ms.toLocaleString('pt-BR')}ms` : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {log.cost_estimated ? `$${Number(log.cost_estimated).toFixed(4)}` : '-'}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(log.status, log.error_code)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Nenhum registro encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          
          {logs.length > 50 && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Mostrando 50 de {logs.length} registros
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
