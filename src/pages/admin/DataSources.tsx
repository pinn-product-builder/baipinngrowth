import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Database, Plus, Search, MoreHorizontal, Pencil, Power, CheckCircle, XCircle, Loader2, Trash2, Key, Eye, RefreshCw, Lock, Unlock } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Tenant {
  id: string;
  name: string;
}

interface DataSource {
  id: string;
  tenant_id: string;
  type: string;
  name: string;
  project_ref: string;
  project_url: string;
  anon_key_present: boolean;
  service_role_key_present: boolean;
  allowed_views: string[];
  is_active: boolean;
  created_at: string;
  tenants?: { name: string } | null;
}

interface ViewInfo {
  name: string;
  schema: string;
  type: 'view' | 'table';
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export default function DataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [filteredDataSources, setFilteredDataSources] = useState<DataSource[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isKeysDialogOpen, setIsKeysDialogOpen] = useState(false);
  const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(null);
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    tenantId: '',
    projectRef: '',
    projectUrl: '',
    allowedViews: [] as string[]
  });
  const [keyFormData, setKeyFormData] = useState({
    anonKey: '',
    serviceRoleKey: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  
  // Introspection state
  const [isIntrospecting, setIsIntrospecting] = useState(false);
  const [availableViews, setAvailableViews] = useState<ViewInfo[]>([]);
  const [availableTables, setAvailableTables] = useState<ViewInfo[]>([]);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = dataSources;
    
    if (searchQuery) {
      filtered = filtered.filter(ds => 
        ds.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ds.project_ref.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterTenant !== 'all') {
      filtered = filtered.filter(ds => ds.tenant_id === filterTenant);
    }
    
    setFilteredDataSources(filtered);
  }, [dataSources, searchQuery, filterTenant]);

  const fetchData = async () => {
    try {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      setTenants(tenantsData || []);

      const { data: dsData, error } = await supabase
        .from('tenant_data_sources')
        .select(`
          *,
          tenants (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDataSources((dsData as any) || []);
    } catch (error) {
      console.error('Erro ao carregar data sources:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar data sources.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.tenantId || !formData.projectRef.trim() || !formData.projectUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        tenant_id: formData.tenantId,
        name: formData.name,
        project_ref: formData.projectRef,
        project_url: formData.projectUrl,
        allowed_views: formData.allowedViews
      };

      if (editingDataSource) {
        const { error } = await supabase
          .from('tenant_data_sources')
          .update(payload)
          .eq('id', editingDataSource.id);

        if (error) throw error;
        toast({ title: 'Data Source atualizado', description: 'Alterações salvas com sucesso.' });
      } else {
        const { error } = await supabase
          .from('tenant_data_sources')
          .insert(payload);

        if (error) throw error;
        toast({ title: 'Data Source criado', description: 'Novo data source adicionado. Configure as credenciais.' });
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
      tenantId: '',
      projectRef: '',
      projectUrl: '',
      allowedViews: []
    });
    setEditingDataSource(null);
    setAvailableViews([]);
    setAvailableTables([]);
  };

  const openEditDialog = (ds: DataSource) => {
    setEditingDataSource(ds);
    setFormData({
      name: ds.name,
      tenantId: ds.tenant_id,
      projectRef: ds.project_ref,
      projectUrl: ds.project_url,
      allowedViews: ds.allowed_views
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openKeysDialog = (ds: DataSource) => {
    setSelectedDataSource(ds);
    setKeyFormData({ anonKey: '', serviceRoleKey: '' });
    setIsKeysDialogOpen(true);
  };

  const toggleStatus = async (ds: DataSource) => {
    try {
      const { error } = await supabase
        .from('tenant_data_sources')
        .update({ is_active: !ds.is_active })
        .eq('id', ds.id);

      if (error) throw error;
      toast({ 
        title: ds.is_active ? 'Data Source desativado' : 'Data Source ativado',
        description: `${ds.name} está agora ${ds.is_active ? 'inativo' : 'ativo'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const testConnection = async (ds: DataSource) => {
    setTestStatus(prev => ({ ...prev, [ds.id]: 'testing' }));
    setTestResults(prev => ({ ...prev, [ds.id]: '' }));

    try {
      const response = await supabase.functions.invoke('test-data-source', {
        body: { data_source_id: ds.id }
      });

      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      
      if (result.success) {
        setTestStatus(prev => ({ ...prev, [ds.id]: 'success' }));
        setTestResults(prev => ({ ...prev, [ds.id]: result.message }));
        toast({ title: 'Conexão OK', description: result.message });
      } else {
        setTestStatus(prev => ({ ...prev, [ds.id]: 'error' }));
        setTestResults(prev => ({ ...prev, [ds.id]: result.error }));
        toast({ title: 'Falha na conexão', description: result.error, variant: 'destructive' });
      }
    } catch (error: any) {
      setTestStatus(prev => ({ ...prev, [ds.id]: 'error' }));
      setTestResults(prev => ({ ...prev, [ds.id]: error.message }));
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }

    setTimeout(() => {
      setTestStatus(prev => ({ ...prev, [ds.id]: 'idle' }));
    }, 5000);
  };

  const introspectDataSource = async (dsId?: string) => {
    const targetId = dsId || editingDataSource?.id;
    if (!targetId) return;

    setIsIntrospecting(true);
    try {
      const response = await supabase.functions.invoke('introspect-datasource', {
        body: { data_source_id: targetId, schema: 'public' }
      });

      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      
      if (result.error) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      } else {
        setAvailableViews(result.views || []);
        setAvailableTables(result.tables || []);
        toast({ 
          title: 'Introspecção concluída', 
          description: `Encontradas ${result.views?.length || 0} views e ${result.tables?.length || 0} tabelas.` 
        });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsIntrospecting(false);
    }
  };

  const saveKeys = async () => {
    if (!selectedDataSource) return;

    setIsSavingKeys(true);
    try {
      const body: any = {
        data_source_id: selectedDataSource.id,
        action: 'set_keys'
      };

      if (keyFormData.anonKey.trim()) {
        body.anon_key = keyFormData.anonKey.trim();
      }
      if (keyFormData.serviceRoleKey.trim()) {
        body.service_role_key = keyFormData.serviceRoleKey.trim();
      }

      if (!body.anon_key && !body.service_role_key) {
        toast({ title: 'Erro', description: 'Informe pelo menos uma chave.', variant: 'destructive' });
        return;
      }

      const response = await supabase.functions.invoke('manage-datasource-keys', { body });

      if (response.error) throw new Error(response.error.message);
      if (response.data.error) throw new Error(response.data.error);

      toast({ title: 'Credenciais salvas', description: 'As chaves foram criptografadas e salvas.' });
      setIsKeysDialogOpen(false);
      setKeyFormData({ anonKey: '', serviceRoleKey: '' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingKeys(false);
    }
  };

  const deleteDataSource = async (ds: DataSource) => {
    if (!confirm(`Tem certeza que deseja excluir "${ds.name}"? Esta ação não pode ser desfeita.`)) return;

    try {
      const { error } = await supabase
        .from('tenant_data_sources')
        .delete()
        .eq('id', ds.id);

      if (error) throw error;
      toast({ title: 'Data Source excluído', description: `${ds.name} foi removido.` });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const toggleViewSelection = (viewName: string) => {
    setFormData(prev => ({
      ...prev,
      allowedViews: prev.allowedViews.includes(viewName)
        ? prev.allowedViews.filter(v => v !== viewName)
        : [...prev.allowedViews, viewName]
    }));
  };

  if (isLoading) {
    return <LoadingPage message="Carregando data sources..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Data Sources" 
        description="Gerencie conexões com bancos de dados Supabase externos"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Data Source
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingDataSource ? 'Editar Data Source' : 'Novo Data Source'}</DialogTitle>
                  <DialogDescription>
                    {editingDataSource ? 'Atualize a configuração.' : 'Configure uma nova conexão Supabase.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tenant">Tenant</Label>
                      <Select 
                        value={formData.tenantId} 
                        onValueChange={(v) => setFormData({ ...formData, tenantId: v })}
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
                      <Label htmlFor="name">Nome</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ex: Afonsina Supabase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="projectRef">Project Ref</Label>
                      <Input
                        id="projectRef"
                        value={formData.projectRef}
                        onChange={(e) => setFormData({ ...formData, projectRef: e.target.value })}
                        placeholder="mpbrjezmxmrdhgtvldvi"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="projectUrl">Project URL</Label>
                      <Input
                        id="projectUrl"
                        value={formData.projectUrl}
                        onChange={(e) => setFormData({ ...formData, projectUrl: e.target.value })}
                        placeholder="https://xxx.supabase.co"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Views Permitidas</Label>
                      {editingDataSource && (
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => introspectDataSource()}
                          disabled={isIntrospecting}
                        >
                          {isIntrospecting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Buscar Views
                        </Button>
                      )}
                    </div>
                    
                    {availableViews.length > 0 || availableTables.length > 0 ? (
                      <ScrollArea className="h-40 border rounded-lg p-3">
                        <div className="space-y-1">
                          {availableViews.length > 0 && (
                            <>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Views ({availableViews.length})</p>
                              {availableViews.map(v => (
                                <div key={v.name} className="flex items-center gap-2">
                                  <Checkbox 
                                    id={v.name}
                                    checked={formData.allowedViews.includes(v.name)}
                                    onCheckedChange={() => toggleViewSelection(v.name)}
                                  />
                                  <label htmlFor={v.name} className="text-sm cursor-pointer">{v.name}</label>
                                </div>
                              ))}
                            </>
                          )}
                          {availableTables.length > 0 && (
                            <>
                              <p className="text-xs font-medium text-muted-foreground mt-3 mb-2">Tabelas ({availableTables.length})</p>
                              {availableTables.map(t => (
                                <div key={t.name} className="flex items-center gap-2">
                                  <Checkbox 
                                    id={t.name}
                                    checked={formData.allowedViews.includes(t.name)}
                                    onCheckedChange={() => toggleViewSelection(t.name)}
                                  />
                                  <label htmlFor={t.name} className="text-sm cursor-pointer">{t.name}</label>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                        {editingDataSource ? (
                          <>Clique em "Buscar Views" para carregar a lista de views/tabelas.</>
                        ) : (
                          <>Salve o data source e configure as credenciais para buscar views.</>
                        )}
                      </div>
                    )}

                    {formData.allowedViews.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {formData.allowedViews.map(v => (
                          <Badge key={v} variant="secondary" className="text-xs">
                            {v}
                            <button 
                              type="button"
                              onClick={() => toggleViewSelection(v)}
                              className="ml-1 hover:text-destructive"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p className="font-medium mb-1 flex items-center gap-2">
                      <Key className="h-4 w-4" /> Chaves de API
                    </p>
                    <p className="text-muted-foreground">
                      As chaves são configuradas separadamente após criar o data source.
                      Elas são criptografadas e nunca são exibidas.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : (editingDataSource ? 'Salvar Alterações' : 'Criar Data Source')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Keys Dialog */}
      <Dialog open={isKeysDialogOpen} onOpenChange={setIsKeysDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Configurar Credenciais
            </DialogTitle>
            <DialogDescription>
              {selectedDataSource?.name} - As chaves serão criptografadas e nunca serão exibidas novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="anonKey" className="flex items-center gap-2">
                <Unlock className="h-4 w-4" />
                Anon Key (recomendado para leitura)
              </Label>
              <Input
                id="anonKey"
                type="password"
                value={keyFormData.anonKey}
                onChange={(e) => setKeyFormData({ ...keyFormData, anonKey: e.target.value })}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
              />
              {selectedDataSource?.anon_key_present && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Já configurada
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceRoleKey" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Service Role Key (avançado)
              </Label>
              <Input
                id="serviceRoleKey"
                type="password"
                value={keyFormData.serviceRoleKey}
                onChange={(e) => setKeyFormData({ ...keyFormData, serviceRoleKey: e.target.value })}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
              />
              {selectedDataSource?.service_role_key_present && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Já configurada
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Use apenas se precisar de acesso administrativo. A anon_key é preferível.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsKeysDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveKeys} disabled={isSavingKeys}>
              {isSavingKeys ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Credenciais'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar data sources..."
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

      {filteredDataSources.length === 0 ? (
        <EmptyState
          icon={<Database className="h-6 w-6 text-muted-foreground" />}
          title={searchQuery || filterTenant !== 'all' ? 'Nenhum data source encontrado' : 'Nenhum data source'}
          description={searchQuery || filterTenant !== 'all' ? 'Tente ajustar os filtros.' : 'Crie seu primeiro data source para começar.'}
          action={!searchQuery && filterTenant === 'all' && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Data Source
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
                <TableHead>Project</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Credenciais</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Teste</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDataSources.map((ds) => (
                <TableRow key={ds.id}>
                  <TableCell>
                    <p className="font-medium">{ds.name}</p>
                    <p className="text-xs text-muted-foreground">{ds.type}</p>
                  </TableCell>
                  <TableCell>{ds.tenants?.name || '-'}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{ds.project_ref}</code>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {ds.allowed_views.slice(0, 2).map((view, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{view}</Badge>
                      ))}
                      {ds.allowed_views.length > 2 && (
                        <Badge variant="outline" className="text-xs">+{ds.allowed_views.length - 2}</Badge>
                      )}
                      {ds.allowed_views.length === 0 && (
                        <span className="text-xs text-muted-foreground">Nenhuma</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {ds.anon_key_present && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Unlock className="h-3 w-3" /> anon
                        </Badge>
                      )}
                      {ds.service_role_key_present && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Lock className="h-3 w-3" /> service
                        </Badge>
                      )}
                      {!ds.anon_key_present && !ds.service_role_key_present && (
                        <span className="text-xs text-destructive">Não configuradas</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={ds.is_active ? 'active' : 'inactive'}>
                      {ds.is_active ? 'Ativo' : 'Inativo'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => testConnection(ds)}
                      disabled={testStatus[ds.id] === 'testing'}
                    >
                      {testStatus[ds.id] === 'testing' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : testStatus[ds.id] === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : testStatus[ds.id] === 'error' ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        'Testar'
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openKeysDialog(ds)}>
                          <Key className="mr-2 h-4 w-4" />
                          Configurar Credenciais
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(ds)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus(ds)}>
                          <Power className="mr-2 h-4 w-4" />
                          {ds.is_active ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteDataSource(ds)} className="text-destructive">
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
