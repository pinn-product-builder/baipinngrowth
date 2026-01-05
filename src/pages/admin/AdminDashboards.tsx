import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useActivityLogger } from '@/hooks/useActivityLogger';
import { BarChart3, Plus, Search, MoreHorizontal, Pencil, Power, ExternalLink, CheckCircle, XCircle, Loader2, ArrowUp, ArrowDown, Copy, Database, Wand2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface Tenant {
  id: string;
  name: string;
}

interface DataSource {
  id: string;
  name: string;
  project_url: string;
  allowed_views: string[];
  tenant_id: string;
}

interface Dashboard {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  webhook_url: string | null;
  display_type: 'auto' | 'iframe' | 'html' | 'json';
  source_kind: 'webhook' | 'supabase_view';
  data_source_id: string | null;
  view_name: string | null;
  default_filters: Record<string, any> | null;
  cache_ttl_seconds: number | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  last_health_status: string | null;
  last_health_check_at: string | null;
  tenants?: { name: string } | null;
  tenant_data_sources?: { name: string } | null;
  template_kind?: string | null;
  dashboard_spec?: Record<string, any> | null;
  detected_columns?: any[] | null;
}

type HealthStatus = 'idle' | 'checking' | 'success' | 'error';

export default function AdminDashboards() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [filteredDashboards, setFilteredDashboards] = useState<Dashboard[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<Dashboard | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tenantId: '',
    sourceKind: 'webhook' as 'webhook' | 'supabase_view',
    webhookUrl: '',
    displayType: 'auto' as 'auto' | 'iframe' | 'html' | 'json',
    dataSourceId: '',
    viewName: '',
    defaultFilters: '{}',
    cacheTtlSeconds: 300,
    displayOrder: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [healthChecks, setHealthChecks] = useState<Record<string, HealthStatus>>({});
  const [detectingTemplate, setDetectingTemplate] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = dashboards;
    
    if (searchQuery) {
      filtered = filtered.filter(d => 
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterTenant !== 'all') {
      filtered = filtered.filter(d => d.tenant_id === filterTenant);
    }
    
    setFilteredDashboards(filtered);
  }, [dashboards, searchQuery, filterTenant]);

  const fetchData = async () => {
    try {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      setTenants(tenantsData || []);

      const { data: dsData } = await supabase
        .from('tenant_data_sources')
        .select('id, name, project_url, allowed_views, tenant_id')
        .eq('is_active', true)
        .order('name');
      
      setDataSources((dsData as any) || []);

      const { data: dashboardsData, error } = await supabase
        .from('dashboards')
        .select(`
          *,
          tenants (name),
          tenant_data_sources (name)
        `)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setDashboards((dashboardsData as any) || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar dashboards.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação condicional
    if (!formData.name.trim() || !formData.tenantId) return;
    if (formData.sourceKind === 'webhook' && !formData.webhookUrl.trim()) return;
    if (formData.sourceKind === 'supabase_view' && (!formData.dataSourceId || !formData.viewName)) return;

    setIsSubmitting(true);
    try {
      let defaultFilters = {};
      try {
        defaultFilters = JSON.parse(formData.defaultFilters || '{}');
      } catch (e) {
        // ignore parse error
      }

      const payload: any = {
        tenant_id: formData.tenantId,
        name: formData.name,
        description: formData.description || null,
        source_kind: formData.sourceKind,
        display_order: formData.displayOrder
      };

      if (formData.sourceKind === 'webhook') {
        payload.webhook_url = formData.webhookUrl;
        payload.display_type = formData.displayType;
        payload.data_source_id = null;
        payload.view_name = null;
      } else {
        payload.data_source_id = formData.dataSourceId;
        payload.view_name = formData.viewName;
        payload.default_filters = defaultFilters;
        payload.cache_ttl_seconds = formData.cacheTtlSeconds;
        payload.webhook_url = null;
      }

      if (editingDashboard) {
        const { error } = await supabase
          .from('dashboards')
          .update(payload)
          .eq('id', editingDashboard.id);

        if (error) throw error;
        logActivity('update_dashboard', 'dashboard', editingDashboard.id, { name: formData.name });
        toast({ title: 'Dashboard atualizado', description: 'Alterações salvas com sucesso.' });
      } else {
        const { data, error } = await supabase
          .from('dashboards')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        logActivity('create_dashboard', 'dashboard', data.id, { name: formData.name });
        toast({ title: 'Dashboard criado', description: 'Novo dashboard adicionado com sucesso.' });
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
      description: '',
      tenantId: '',
      sourceKind: 'webhook',
      webhookUrl: '',
      displayType: 'auto',
      dataSourceId: '',
      viewName: '',
      defaultFilters: '{}',
      cacheTtlSeconds: 300,
      displayOrder: 0
    });
    setEditingDashboard(null);
  };

  const openEditDialog = (dashboard: Dashboard) => {
    setEditingDashboard(dashboard);
    setFormData({
      name: dashboard.name,
      description: dashboard.description || '',
      tenantId: dashboard.tenant_id,
      sourceKind: dashboard.source_kind || 'webhook',
      webhookUrl: dashboard.webhook_url || '',
      displayType: dashboard.display_type,
      dataSourceId: dashboard.data_source_id || '',
      viewName: dashboard.view_name || '',
      defaultFilters: JSON.stringify(dashboard.default_filters || {}),
      cacheTtlSeconds: dashboard.cache_ttl_seconds || 300,
      displayOrder: dashboard.display_order
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const toggleDashboardStatus = async (dashboard: Dashboard) => {
    try {
      const { error } = await supabase
        .from('dashboards')
        .update({ is_active: !dashboard.is_active })
        .eq('id', dashboard.id);

      if (error) throw error;
      logActivity(dashboard.is_active ? 'deactivate_dashboard' : 'activate_dashboard', 'dashboard', dashboard.id, { name: dashboard.name });
      toast({ 
        title: dashboard.is_active ? 'Dashboard desativado' : 'Dashboard ativado',
        description: `${dashboard.name} está agora ${dashboard.is_active ? 'inativo' : 'ativo'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const duplicateDashboard = async (dashboard: Dashboard) => {
    try {
      const { data, error } = await supabase
        .from('dashboards')
        .insert({
          tenant_id: dashboard.tenant_id,
          name: `${dashboard.name} (Cópia)`,
          description: dashboard.description,
          webhook_url: dashboard.webhook_url,
          display_type: dashboard.display_type,
          source_kind: dashboard.source_kind,
          data_source_id: dashboard.data_source_id,
          view_name: dashboard.view_name,
          default_filters: dashboard.default_filters,
          cache_ttl_seconds: dashboard.cache_ttl_seconds,
          display_order: dashboard.display_order + 1,
          is_active: false
        })
        .select()
        .single();

      if (error) throw error;
      logActivity('create_dashboard', 'dashboard', data.id, { name: data.name, duplicated_from: dashboard.id });
      toast({ title: 'Dashboard duplicado', description: 'Cópia criada com sucesso. Edite e ative quando pronto.' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const checkHealth = async (dashboard: Dashboard) => {
    if (dashboard.source_kind === 'supabase_view') {
      // Para supabase_view, testar via edge function
      setHealthChecks(prev => ({ ...prev, [dashboard.id]: 'checking' }));
      
      try {
        const response = await supabase.functions.invoke('test-data-source', {
          body: { 
            data_source_id: dashboard.data_source_id,
            view_name: dashboard.view_name 
          }
        });

        const status = response.data?.success ? 'ok' : 'error';
        
        await supabase
          .from('dashboards')
          .update({ 
            last_health_status: status,
            last_health_check_at: new Date().toISOString()
          })
          .eq('id', dashboard.id);

        setHealthChecks(prev => ({ ...prev, [dashboard.id]: status === 'ok' ? 'success' : 'error' }));
        fetchData();
      } catch (error) {
        setHealthChecks(prev => ({ ...prev, [dashboard.id]: 'error' }));
      }

      setTimeout(() => {
        setHealthChecks(prev => ({ ...prev, [dashboard.id]: 'idle' }));
      }, 3000);
      return;
    }

    // Para webhook
    setHealthChecks(prev => ({ ...prev, [dashboard.id]: 'checking' }));
    
    let status: 'ok' | 'error' = 'error';
    
    try {
      const response = await fetch(dashboard.webhook_url!, { method: 'HEAD' });
      status = response.ok ? 'ok' : 'error';
    } catch {
      try {
        const response = await fetch(dashboard.webhook_url!);
        status = response.ok ? 'ok' : 'error';
      } catch {
        status = 'error';
      }
    }

    await supabase
      .from('dashboards')
      .update({ 
        last_health_status: status,
        last_health_check_at: new Date().toISOString()
      })
      .eq('id', dashboard.id);

    setHealthChecks(prev => ({ ...prev, [dashboard.id]: status === 'ok' ? 'success' : 'error' }));
    fetchData();

    setTimeout(() => {
      setHealthChecks(prev => ({ ...prev, [dashboard.id]: 'idle' }));
    }, 3000);
  };

  const moveOrder = async (dashboard: Dashboard, direction: 'up' | 'down') => {
    const currentIndex = filteredDashboards.findIndex(d => d.id === dashboard.id);
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === filteredDashboards.length - 1) return;

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const swapDashboard = filteredDashboards[swapIndex];

    try {
      await supabase.from('dashboards').update({ display_order: swapDashboard.display_order }).eq('id', dashboard.id);
      await supabase.from('dashboards').update({ display_order: dashboard.display_order }).eq('id', swapDashboard.id);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const detectTemplate = async (dashboard: Dashboard) => {
    if (dashboard.source_kind !== 'supabase_view' || !dashboard.data_source_id || !dashboard.view_name) {
      toast({ title: 'Erro', description: 'Este dashboard não é do tipo supabase_view.', variant: 'destructive' });
      return;
    }

    setDetectingTemplate(prev => ({ ...prev, [dashboard.id]: true }));

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Não autenticado');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/detect-template`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data_source_id: dashboard.data_source_id,
          view_name: dashboard.view_name,
          dashboard_id: dashboard.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao detectar template');
      }

      const result = await response.json();
      
      toast({ 
        title: 'Template detectado', 
        description: `Template: ${result.template_kind} (Confiança: ${result.confidence}%)` 
      });
      
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setDetectingTemplate(prev => ({ ...prev, [dashboard.id]: false }));
    }
  };

  // Data sources filtrados pelo tenant selecionado
  const filteredDataSources = dataSources.filter(ds => ds.tenant_id === formData.tenantId);
  const selectedDataSource = dataSources.find(ds => ds.id === formData.dataSourceId);

  if (isLoading) {
    return <LoadingPage message="Carregando dashboards..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Gerenciar Dashboards" 
        description="Configure e gerencie dashboards de clientes"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Dashboard
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingDashboard ? 'Editar Dashboard' : 'Criar Dashboard'}</DialogTitle>
                  <DialogDescription>
                    {editingDashboard ? 'Atualize a configuração do dashboard.' : 'Adicione um novo dashboard para um cliente.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    <Label htmlFor="tenant">Tenant</Label>
                    <Select 
                      value={formData.tenantId} 
                      onValueChange={(v) => setFormData({ ...formData, tenantId: v, dataSourceId: '', viewName: '' })}
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

                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Dashboard</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Custos x Funil por Dia"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição (opcional)</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Breve descrição do dashboard"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo de Fonte</Label>
                    <Select 
                      value={formData.sourceKind} 
                      onValueChange={(v) => setFormData({ ...formData, sourceKind: v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="webhook">Webhook (iframe/HTML)</SelectItem>
                        <SelectItem value="supabase_view">Supabase View</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.sourceKind === 'webhook' ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="webhookUrl">URL do Webhook</Label>
                        <Input
                          id="webhookUrl"
                          value={formData.webhookUrl}
                          onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                          placeholder="https://n8n.example.com/webhook/..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="displayType">Tipo de Exibição</Label>
                        <Select 
                          value={formData.displayType} 
                          onValueChange={(v) => setFormData({ ...formData, displayType: v as any })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto-detectar</SelectItem>
                            <SelectItem value="iframe">iFrame</SelectItem>
                            <SelectItem value="html">HTML</SelectItem>
                            <SelectItem value="json">JSON</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Data Source</Label>
                        <Select 
                          value={formData.dataSourceId} 
                          onValueChange={(v) => setFormData({ ...formData, dataSourceId: v, viewName: '' })}
                          disabled={!formData.tenantId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={formData.tenantId ? "Selecione o data source" : "Selecione um tenant primeiro"} />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredDataSources.map((ds) => (
                              <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.dataSourceId && (
                        <div className="space-y-2">
                          <Label>View</Label>
                          <Select 
                            value={formData.viewName} 
                            onValueChange={(v) => setFormData({ ...formData, viewName: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a view" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedDataSource?.allowed_views.map((view) => (
                                <SelectItem key={view} value={view}>{view}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="cacheTtl">Cache TTL (segundos)</Label>
                          <Input
                            id="cacheTtl"
                            type="number"
                            value={formData.cacheTtlSeconds}
                            onChange={(e) => setFormData({ ...formData, cacheTtlSeconds: parseInt(e.target.value) || 300 })}
                            min={0}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="defaultFilters">Filtros Padrão (JSON)</Label>
                          <Input
                            id="defaultFilters"
                            value={formData.defaultFilters}
                            onChange={(e) => setFormData({ ...formData, defaultFilters: e.target.value })}
                            placeholder='{"range": "last_60_days"}'
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="displayOrder">Ordem de Exibição</Label>
                    <Input
                      id="displayOrder"
                      type="number"
                      value={formData.displayOrder}
                      onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                      min={0}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : (editingDashboard ? 'Salvar Alterações' : 'Criar Dashboard')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar dashboards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
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
      </div>

      {filteredDashboards.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6 text-muted-foreground" />}
          title={searchQuery || filterTenant !== 'all' ? 'Nenhum dashboard encontrado' : 'Nenhum dashboard'}
          description={searchQuery || filterTenant !== 'all' ? 'Tente ajustar os filtros.' : 'Crie seu primeiro dashboard para começar.'}
          action={!searchQuery && filterTenant === 'all' && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Dashboard
            </Button>
          )}
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Ordem</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDashboards.map((dashboard, index) => (
                <TableRow key={dashboard.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{dashboard.name}</p>
                      {dashboard.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{dashboard.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{dashboard.tenants?.name || '-'}</TableCell>
                  <TableCell>
                    {dashboard.source_kind === 'supabase_view' ? (
                      <Badge variant="outline" className="gap-1">
                        <Database className="h-3 w-3" />
                        View
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{dashboard.display_type}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {dashboard.source_kind === 'supabase_view' ? (
                      <span className="text-xs text-muted-foreground">
                        {dashboard.view_name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground truncate max-w-[150px] block">
                        {dashboard.webhook_url}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={dashboard.is_active ? 'active' : 'inactive'}>
                      {dashboard.is_active ? 'Ativo' : 'Inativo'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => checkHealth(dashboard)}
                      disabled={healthChecks[dashboard.id] === 'checking'}
                    >
                      {healthChecks[dashboard.id] === 'checking' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : healthChecks[dashboard.id] === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : healthChecks[dashboard.id] === 'error' ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : dashboard.last_health_status === 'ok' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : dashboard.last_health_status === 'error' ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="text-sm">{dashboard.display_order}</span>
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => moveOrder(dashboard, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => moveOrder(dashboard, 'down')}
                          disabled={index === filteredDashboards.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(dashboard)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        {dashboard.source_kind === 'webhook' && dashboard.webhook_url && (
                          <DropdownMenuItem onClick={() => window.open(dashboard.webhook_url!, '_blank')}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Abrir URL
                          </DropdownMenuItem>
                        )}
                        {dashboard.source_kind === 'supabase_view' && (
                          <DropdownMenuItem 
                            onClick={() => detectTemplate(dashboard)}
                            disabled={detectingTemplate[dashboard.id]}
                          >
                            <Wand2 className="mr-2 h-4 w-4" />
                            {detectingTemplate[dashboard.id] ? 'Detectando...' : 'Detectar Template'}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => duplicateDashboard(dashboard)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleDashboardStatus(dashboard)}>
                          <Power className="mr-2 h-4 w-4" />
                          {dashboard.is_active ? 'Desativar' : 'Ativar'}
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
