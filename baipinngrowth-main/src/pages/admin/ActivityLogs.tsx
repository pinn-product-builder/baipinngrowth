import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Activity, Search } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Tenant {
  id: string;
  name: string;
}

interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: unknown;
  created_at: string;
  user_name?: string;
}

type PeriodFilter = 'all' | '7' | '30' | '90';

const actionLabels: Record<string, string> = {
  'view_dashboard': 'visualizar dashboard',
  'create_dashboard': 'criar dashboard',
  'update_dashboard': 'atualizar dashboard',
  'deactivate_dashboard': 'desativar dashboard',
  'create_user': 'criar usuário',
  'deactivate_user': 'desativar usuário',
  'invite_sent': 'convite enviado',
  'invite_accepted': 'convite aceito',
  'dashboard_load_error': 'erro ao carregar dashboard'
};

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ActivityLog[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>('30');

  useEffect(() => {
    fetchData();
  }, [filterPeriod]);

  useEffect(() => {
    let filtered = logs;
    
    if (searchQuery) {
      filtered = filtered.filter(log => 
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.entity_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.user_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterAction !== 'all') {
      filtered = filtered.filter(log => log.action === filterAction);
    }
    
    setFilteredLogs(filtered);
  }, [logs, searchQuery, filterAction]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .order('name');
      
      setTenants(tenantsData || []);

      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      // Aplicar filtro de período
      if (filterPeriod !== 'all') {
        const daysAgo = subDays(new Date(), parseInt(filterPeriod));
        query = query.gte('created_at', daysAgo.toISOString());
      }

      const { data: logsData, error } = await query;

      if (error) throw error;

      // Buscar nomes dos usuários
      const userIds = [...new Set((logsData || []).map(l => l.user_id).filter(Boolean))];
      let userNames: Record<string, string> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        userNames = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || 'Desconhecido';
          return acc;
        }, {} as Record<string, string>);
      }

      const enrichedLogs = (logsData || []).map(log => ({
        ...log,
        user_name: log.user_id ? userNames[log.user_id] || 'Desconhecido' : 'Sistema'
      }));

      setLogs(enrichedLogs);
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const formatDetails = (details: unknown) => {
    if (!details || typeof details !== 'object') return '-';
    const entries = Object.entries(details as Record<string, unknown>).slice(0, 3);
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
  };

  const formatAction = (action: string) => {
    return actionLabels[action] || action.replace(/_/g, ' ');
  };

  if (isLoading) {
    return <LoadingPage message="Carregando logs de atividade..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Logs de Atividade" 
        description="Monitore a atividade do sistema e ações dos usuários"
      />

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Ações</SelectItem>
            {uniqueActions.map((action) => (
              <SelectItem key={action} value={action}>{formatAction(action)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as PeriodFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="all">Todo o período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredLogs.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-6 w-6 text-muted-foreground" />}
          title="Nenhum log de atividade"
          description="As atividades aparecerão aqui conforme os usuários interagem com o sistema."
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format(new Date(log.created_at), 'dd MMM yyyy HH:mm:ss', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{log.user_name}</TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                      {formatAction(log.action)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.entity_type ? `${log.entity_type}` : '-'}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                    {formatDetails(log.details)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}