import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Plus, Search, MoreHorizontal, Pencil, Power, Trash2, Send, Clock } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Tenant {
  id: string;
  name: string;
}

interface Dashboard {
  id: string;
  name: string;
  tenant_id: string;
}

interface ScheduledReport {
  id: string;
  name: string;
  tenant_id: string;
  dashboard_ids: string[];
  emails: string[];
  frequency: string;
  is_active: boolean;
  next_send_at: string | null;
  last_sent_at: string | null;
  created_at: string;
  tenants?: { name: string } | null;
}

export default function ScheduledReports() {
  const { userRole, tenantId: currentUserTenantId } = useAuth();
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';

  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<ScheduledReport[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    tenantId: '',
    frequency: 'weekly',
    emails: '',
    dashboardIds: [] as string[]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSending, setIsSending] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = reports;
    
    if (searchQuery) {
      filtered = filtered.filter(r => 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.emails.some(e => e.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    if (filterTenant !== 'all') {
      filtered = filtered.filter(r => r.tenant_id === filterTenant);
    }
    
    setFilteredReports(filtered);
  }, [reports, searchQuery, filterTenant]);

  const fetchData = async () => {
    try {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      setTenants(tenantsData || []);

      const { data: dashboardsData } = await supabase
        .from('dashboards')
        .select('id, name, tenant_id')
        .eq('is_active', true)
        .order('name');
      
      setDashboards(dashboardsData || []);

      const { data: reportsData, error } = await supabase
        .from('scheduled_reports')
        .select(`
          *,
          tenants (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports((reportsData as any) || []);
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar relatórios agendados.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const getNextSendDate = (frequency: string): string => {
    const next = new Date();
    
    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        next.setHours(8, 0, 0, 0);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        next.setHours(8, 0, 0, 0);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
        next.setHours(8, 0, 0, 0);
        break;
    }
    
    return next.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.tenantId || formData.dashboardIds.length === 0 || !formData.emails.trim()) return;

    setIsSubmitting(true);
    try {
      const emails = formData.emails.split(',').map(e => e.trim()).filter(e => e);
      
      const payload = {
        tenant_id: formData.tenantId,
        name: formData.name,
        frequency: formData.frequency,
        emails,
        dashboard_ids: formData.dashboardIds,
        next_send_at: getNextSendDate(formData.frequency)
      };

      if (editingReport) {
        const { error } = await supabase
          .from('scheduled_reports')
          .update(payload)
          .eq('id', editingReport.id);

        if (error) throw error;
        toast({ title: 'Relatório atualizado', description: 'Alterações salvas com sucesso.' });
      } else {
        const { error } = await supabase
          .from('scheduled_reports')
          .insert(payload);

        if (error) throw error;
        toast({ title: 'Relatório criado', description: 'Novo relatório agendado com sucesso.' });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      tenantId: isManager && currentUserTenantId ? currentUserTenantId : '',
      frequency: 'weekly',
      emails: '',
      dashboardIds: []
    });
    setEditingReport(null);
  };

  const openEditDialog = (report: ScheduledReport) => {
    setEditingReport(report);
    setFormData({
      name: report.name,
      tenantId: report.tenant_id,
      frequency: report.frequency,
      emails: report.emails.join(', '),
      dashboardIds: report.dashboard_ids
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const toggleStatus = async (report: ScheduledReport) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ is_active: !report.is_active })
        .eq('id', report.id);

      if (error) throw error;
      toast({ 
        title: report.is_active ? 'Relatório pausado' : 'Relatório ativado',
        description: `${report.name} está agora ${report.is_active ? 'pausado' : 'ativo'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const deleteReport = async (report: ScheduledReport) => {
    if (!confirm(`Tem certeza que deseja excluir "${report.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', report.id);

      if (error) throw error;
      toast({ title: 'Relatório excluído', description: `${report.name} foi removido.` });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const sendNow = async (report: ScheduledReport) => {
    setIsSending(report.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-scheduled-report', {
        body: { report_id: report.id }
      });

      if (error) throw error;
      
      if (data?.results?.[0]?.success) {
        toast({ title: 'Relatório enviado', description: `${report.name} foi enviado com sucesso.` });
        fetchData();
      } else {
        throw new Error(data?.results?.[0]?.error || 'Falha ao enviar');
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSending(null);
    }
  };

  const tenantDashboards = formData.tenantId 
    ? dashboards.filter(d => d.tenant_id === formData.tenantId)
    : [];

  const toggleDashboard = (dashboardId: string) => {
    setFormData(prev => ({
      ...prev,
      dashboardIds: prev.dashboardIds.includes(dashboardId)
        ? prev.dashboardIds.filter(id => id !== dashboardId)
        : [...prev.dashboardIds, dashboardId]
    }));
  };

  if (isLoading) {
    return <LoadingPage message="Carregando relatórios agendados..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Relatórios Agendados" 
        description="Configure envio automático de relatórios por email"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Relatório
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingReport ? 'Editar Relatório' : 'Novo Relatório Agendado'}</DialogTitle>
                  <DialogDescription>
                    {editingReport ? 'Atualize a configuração do relatório.' : 'Configure um novo envio automático.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label htmlFor="tenant">Tenant</Label>
                      <Select 
                        value={formData.tenantId} 
                        onValueChange={(v) => setFormData({ ...formData, tenantId: v, dashboardIds: [] })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tenant" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenants.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Relatório</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Relatório Semanal de Vendas"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequency">Frequência</Label>
                    <Select 
                      value={formData.frequency} 
                      onValueChange={(v) => setFormData({ ...formData, frequency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diário</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emails">Destinatários (separados por vírgula)</Label>
                    <Input
                      id="emails"
                      value={formData.emails}
                      onChange={(e) => setFormData({ ...formData, emails: e.target.value })}
                      placeholder="Ex: gestor@empresa.com, diretoria@empresa.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dashboards</Label>
                    {formData.tenantId ? (
                      <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                        {tenantDashboards.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum dashboard ativo para este tenant.</p>
                        ) : (
                          tenantDashboards.map(d => (
                            <div key={d.id} className="flex items-center gap-2">
                              <Checkbox 
                                id={d.id}
                                checked={formData.dashboardIds.includes(d.id)}
                                onCheckedChange={() => toggleDashboard(d.id)}
                              />
                              <label htmlFor={d.id} className="text-sm cursor-pointer">{d.name}</label>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Selecione um tenant primeiro.</p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : (editingReport ? 'Salvar Alterações' : 'Criar Relatório')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar relatórios..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && (
          <Select value={filterTenant} onValueChange={setFilterTenant}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por tenant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tenants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filteredReports.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6 text-muted-foreground" />}
          title={searchQuery || filterTenant !== 'all' ? 'Nenhum relatório encontrado' : 'Nenhum relatório agendado'}
          description={searchQuery || filterTenant !== 'all' ? 'Tente ajustar os filtros.' : 'Crie seu primeiro relatório agendado para começar.'}
          action={!searchQuery && filterTenant === 'all' && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Relatório
            </Button>
          )}
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                {isAdmin && <TableHead>Tenant</TableHead>}
                <TableHead>Frequência</TableHead>
                <TableHead>Destinatários</TableHead>
                <TableHead>Próximo Envio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <p className="font-medium">{report.name}</p>
                    <p className="text-xs text-muted-foreground">{report.dashboard_ids.length} dashboard(s)</p>
                  </TableCell>
                  {isAdmin && <TableCell>{report.tenants?.name || '-'}</TableCell>}
                  <TableCell>
                    <Badge variant="outline">
                      {report.frequency === 'daily' ? 'Diário' : report.frequency === 'weekly' ? 'Semanal' : 'Mensal'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {report.emails.slice(0, 2).map((email, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{email}</Badge>
                      ))}
                      {report.emails.length > 2 && (
                        <Badge variant="secondary" className="text-xs">+{report.emails.length - 2}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {report.next_send_at ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(report.next_send_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={report.is_active ? 'active' : 'inactive'}>
                      {report.is_active ? 'Ativo' : 'Pausado'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => sendNow(report)} disabled={isSending === report.id}>
                          <Send className="mr-2 h-4 w-4" />
                          {isSending === report.id ? 'Enviando...' : 'Enviar Agora'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(report)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus(report)}>
                          <Power className="mr-2 h-4 w-4" />
                          {report.is_active ? 'Pausar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteReport(report)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
