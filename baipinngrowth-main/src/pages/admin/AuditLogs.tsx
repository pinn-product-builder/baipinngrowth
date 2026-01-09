import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  FileText, 
  Search, 
  User, 
  Calendar, 
  ArrowRight,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AuditLog {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  before_data: Record<string, any> | null;
  after_data: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-success text-success-foreground',
  update: 'bg-primary text-primary-foreground',
  delete: 'bg-destructive text-destructive-foreground',
  publish: 'bg-warning text-warning-foreground',
  unpublish: 'bg-muted text-muted-foreground',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (filterAction && filterAction !== 'all') {
        query = query.eq('action', filterAction);
      }
      if (filterEntity && filterEntity !== 'all') {
        query = query.eq('entity_type', filterEntity);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs((data || []).map(l => ({
        ...l,
        before_data: l.before_data as Record<string, any> | null,
        after_data: l.after_data as Record<string, any> | null,
      })));
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterAction, filterEntity]);

  // Get unique actions and entities for filters
  const uniqueActions = [...new Set(logs.map(l => l.action))];
  const uniqueEntities = [...new Set(logs.map(l => l.entity_type))];

  // Filter by search
  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      log.entity_name?.toLowerCase().includes(search) ||
      log.entity_type.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search) ||
      log.actor_user_id?.toLowerCase().includes(search)
    );
  });

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Histórico completo de ações do sistema"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, tipo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ações</SelectItem>
            {uniqueActions.map(action => (
              <SelectItem key={action} value={action}>{action}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Entidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas entidades</SelectItem>
            {uniqueEntities.map(entity => (
              <SelectItem key={entity} value={entity}>{entity}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Logs List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Registros ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-2">
              {filteredLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum registro encontrado
                </p>
              ) : (
                filteredLogs.map(log => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Badge className={ACTION_COLORS[log.action] || 'bg-muted'}>
                        {log.action}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {log.entity_name || log.entity_id || log.entity_type}
                          </span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {log.entity_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span className="truncate">{log.actor_user_id?.slice(0, 8)}...</span>
                          <Calendar className="h-3 w-3 ml-2" />
                          <span>{formatDate(log.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge className={ACTION_COLORS[selectedLog?.action || ''] || 'bg-muted'}>
                {selectedLog?.action}
              </Badge>
              {selectedLog?.entity_type}
            </DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Entidade</p>
                  <p className="font-medium">{selectedLog.entity_name || selectedLog.entity_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Data/Hora</p>
                  <p className="font-medium">{formatDate(selectedLog.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Usuário</p>
                  <p className="font-mono text-xs">{selectedLog.actor_user_id}</p>
                </div>
                {selectedLog.ip_address && (
                  <div>
                    <p className="text-muted-foreground">IP</p>
                    <p className="font-mono text-xs">{selectedLog.ip_address}</p>
                  </div>
                )}
              </div>
              
              {(selectedLog.before_data || selectedLog.after_data) && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground font-medium">Alterações</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    {selectedLog.before_data && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Antes</p>
                        <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[200px]">
                          {JSON.stringify(selectedLog.before_data, null, 2)}
                        </pre>
                      </div>
                    )}
                    {selectedLog.after_data && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Depois</p>
                        <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[200px]">
                          {JSON.stringify(selectedLog.after_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {selectedLog.user_agent && (
                <div>
                  <p className="text-sm text-muted-foreground">User Agent</p>
                  <p className="text-xs font-mono bg-muted p-2 rounded">{selectedLog.user_agent}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
