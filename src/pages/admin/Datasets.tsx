import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Database, 
  Plus, 
  Search, 
  MoreHorizontal, 
  Pencil, 
  Power, 
  Trash2, 
  RefreshCw, 
  Table as TableIcon,
  Eye,
  Sparkles,
  CheckCircle,
  XCircle,
  Loader2,
  Columns,
  Clock,
  Wand2,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import DashboardAutoBuilder from '@/components/dashboards/wizard/DashboardAutoBuilder';

interface Dataset {
  id: string;
  tenant_id: string;
  datasource_id: string;
  name: string;
  kind: 'table' | 'view' | 'sql';
  schema_name: string;
  object_name: string | null;
  sql_query: string | null;
  primary_time_column: string | null;
  grain_hint: string | null;
  row_limit_default: number;
  refresh_policy: string;
  is_active: boolean;
  last_introspected_at: string | null;
  created_at: string;
  tenant_data_sources?: { name: string; project_url: string } | null;
  tenants?: { name: string } | null;
  _column_count?: number;
}

interface DataSource {
  id: string;
  name: string;
  project_url: string;
  tenant_id: string;
}

interface ViewInfo {
  name: string;
  schema: string;
  type: 'view' | 'table';
}

interface ColumnInfo {
  column_name: string;
  db_type: string;
  semantic_type: string | null;
  role_hint: string | null;
  format: string | null;
  display_label: string;
  aggregator_default: string;
}

export default function Datasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isColumnsDialogOpen, setIsColumnsDialogOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  
  // Auto-builder wizard state
  const [isAutoBuilderOpen, setIsAutoBuilderOpen] = useState(false);
  const [autoBuilderTenantId, setAutoBuilderTenantId] = useState<string | undefined>();
  
  const navigate = useNavigate();
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    datasourceId: '',
    kind: 'view' as 'table' | 'view' | 'sql',
    objectName: '',
    sqlQuery: '',
    rowLimitDefault: 10000,
    refreshPolicy: 'live'
  });
  
  // Introspection state
  const [isIntrospecting, setIsIntrospecting] = useState(false);
  const [availableViews, setAvailableViews] = useState<ViewInfo[]>([]);
  const [availableTables, setAvailableTables] = useState<ViewInfo[]>([]);
  const [introspectionResult, setIntrospectionResult] = useState<any>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch data sources
      const { data: dsData } = await supabase
        .from('tenant_data_sources')
        .select('id, name, project_url, tenant_id')
        .eq('is_active', true)
        .order('name');
      
      setDataSources(dsData || []);

      // Fetch datasets with related info
      const { data: datasetsData, error } = await supabase
        .from('datasets')
        .select(`
          *,
          tenant_data_sources (name, project_url),
          tenants (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get column counts for each dataset
      const datasetsWithCounts = await Promise.all(
        (datasetsData || []).map(async (ds: any) => {
          const { count } = await supabase
            .from('dataset_columns')
            .select('*', { count: 'exact', head: true })
            .eq('dataset_id', ds.id);
          return { ...ds, _column_count: count || 0 };
        })
      );

      setDatasets(datasetsWithCounts);
    } catch (error) {
      console.error('Error loading datasets:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar datasets.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredDatasets = datasets.filter(ds => 
    ds.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ds.object_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const introspectDataSource = async (datasourceId: string) => {
    if (!datasourceId) return;
    
    setIsIntrospecting(true);
    setAvailableViews([]);
    setAvailableTables([]);
    
    try {
      const response = await supabase.functions.invoke('introspect-datasource', {
        body: { data_source_id: datasourceId, schema: 'public' }
      });

      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      
      if (result.ok) {
        setAvailableViews(result.views || []);
        setAvailableTables(result.tables || []);
        toast({ 
          title: 'Introspecção concluída', 
          description: `${result.views?.length || 0} views e ${result.tables?.length || 0} tabelas encontradas.`
        });
      } else {
        throw new Error(result.error?.message || 'Erro desconhecido');
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsIntrospecting(false);
    }
  };

  const introspectDataset = async (datasetId: string, saveColumns: boolean = false) => {
    setIsIntrospecting(true);
    setIntrospectionResult(null);
    
    try {
      const response = await supabase.functions.invoke('introspect-dataset', {
        body: { dataset_id: datasetId, save_columns: saveColumns }
      });

      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      
      if (result.ok) {
        setIntrospectionResult(result);
        if (saveColumns) {
          toast({ 
            title: 'Colunas salvas', 
            description: `${result.columns?.length || 0} colunas detectadas e salvas.`
          });
          fetchData(); // Refresh to update column count
        } else {
          toast({ 
            title: 'Análise concluída', 
            description: `${result.columns?.length || 0} colunas detectadas.`
          });
        }
      } else {
        throw new Error(result.error?.message || 'Erro desconhecido');
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsIntrospecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.datasourceId) return;
    if (formData.kind !== 'sql' && !formData.objectName) return;
    if (formData.kind === 'sql' && !formData.sqlQuery) return;

    setIsSubmitting(true);
    try {
      const selectedDs = dataSources.find(ds => ds.id === formData.datasourceId);
      
      const payload = {
        tenant_id: selectedDs?.tenant_id,
        datasource_id: formData.datasourceId,
        name: formData.name,
        kind: formData.kind,
        schema_name: 'public',
        object_name: formData.kind !== 'sql' ? formData.objectName : null,
        sql_query: formData.kind === 'sql' ? formData.sqlQuery : null,
        row_limit_default: formData.rowLimitDefault,
        refresh_policy: formData.refreshPolicy
      };

      if (editingDataset) {
        const { error } = await supabase
          .from('datasets')
          .update(payload)
          .eq('id', editingDataset.id);

        if (error) throw error;
        toast({ title: 'Dataset atualizado', description: 'Alterações salvas.' });
      } else {
        const { data, error } = await supabase
          .from('datasets')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        
        // Auto-introspect after creation
        if (data) {
          await introspectDataset(data.id, true);
        }
        
        toast({ title: 'Dataset criado', description: 'Novo dataset adicionado e analisado.' });
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
      datasourceId: '',
      kind: 'view',
      objectName: '',
      sqlQuery: '',
      rowLimitDefault: 10000,
      refreshPolicy: 'live'
    });
    setEditingDataset(null);
    setAvailableViews([]);
    setAvailableTables([]);
    setIntrospectionResult(null);
  };

  const openEditDialog = (ds: Dataset) => {
    setEditingDataset(ds);
    setFormData({
      name: ds.name,
      datasourceId: ds.datasource_id,
      kind: ds.kind,
      objectName: ds.object_name || '',
      sqlQuery: ds.sql_query || '',
      rowLimitDefault: ds.row_limit_default,
      refreshPolicy: ds.refresh_policy
    });
    setIsDialogOpen(true);
  };

  const openColumnsDialog = async (ds: Dataset) => {
    setSelectedDataset(ds);
    setIsColumnsDialogOpen(true);
    setIsLoadingColumns(true);
    
    try {
      const { data, error } = await supabase
        .from('dataset_columns')
        .select('*')
        .eq('dataset_id', ds.id)
        .order('sort_priority');

      if (error) throw error;
      setColumns(data || []);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoadingColumns(false);
    }
  };

  const toggleStatus = async (ds: Dataset) => {
    try {
      const { error } = await supabase
        .from('datasets')
        .update({ is_active: !ds.is_active })
        .eq('id', ds.id);

      if (error) throw error;
      toast({ 
        title: ds.is_active ? 'Dataset desativado' : 'Dataset ativado',
        description: `${ds.name} está agora ${ds.is_active ? 'inativo' : 'ativo'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const deleteDataset = async (ds: Dataset) => {
    if (!confirm(`Excluir dataset "${ds.name}"? Esta ação não pode ser desfeita.`)) return;
    
    try {
      const { error } = await supabase
        .from('datasets')
        .delete()
        .eq('id', ds.id);

      if (error) throw error;
      toast({ title: 'Dataset excluído', description: `${ds.name} foi removido.` });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const getSemanticBadge = (type: string | null) => {
    const colors: Record<string, string> = {
      time: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      currency: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      percent: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      count: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      dimension: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      metric: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    };
    if (!type) return null;
    return <Badge className={colors[type] || 'bg-muted'}>{type}</Badge>;
  };

  const openAutoBuilder = (ds?: Dataset) => {
    if (ds) {
      setAutoBuilderTenantId(ds.tenant_id);
    }
    setIsAutoBuilderOpen(true);
  };

  const handleAutoBuilderSuccess = (dashboardId: string) => {
    toast({
      title: 'Dashboard criado!',
      description: 'O dashboard foi gerado com sucesso.',
    });
    navigate(`/dashboards/${dashboardId}`);
  };

  if (isLoading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Datasets"
        description="Gerencie tabelas e views conectadas aos seus data sources."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => openAutoBuilder()}>
              <Wand2 className="mr-2 h-4 w-4" />
              Auto-gerar Dashboard
            </Button>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Dataset
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar datasets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filteredDatasets.length === 0 ? (
        <EmptyState
          icon={<Database className="h-12 w-12" />}
          title="Nenhum dataset cadastrado"
          description="Crie um dataset para começar a analisar seus dados."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Objeto</TableHead>
                <TableHead>Colunas</TableHead>
                <TableHead>Última Análise</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDatasets.map(ds => (
                <TableRow key={ds.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{ds.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ds.tenant_data_sources?.name}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {ds.kind === 'view' && <Eye className="mr-1 h-3 w-3" />}
                      {ds.kind === 'table' && <TableIcon className="mr-1 h-3 w-3" />}
                      {ds.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {ds.object_name || '(SQL)'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openColumnsDialog(ds)}
                      className="gap-1"
                    >
                      <Columns className="h-3 w-3" />
                      {ds._column_count || 0}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {ds.last_introspected_at ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(ds.last_introspected_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nunca</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={ds.is_active ? 'active' : 'inactive'}>
                      {ds.is_active ? 'Ativo' : 'Inativo'}
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
                        <DropdownMenuItem onClick={() => openAutoBuilder(ds)}>
                          <Wand2 className="mr-2 h-4 w-4" />
                          Auto-gerar Dashboard
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openEditDialog(ds)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openColumnsDialog(ds)}>
                          <Columns className="mr-2 h-4 w-4" />
                          Ver Colunas
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => introspectDataset(ds.id, true)}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Re-analisar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus(ds)}>
                          <Power className="mr-2 h-4 w-4" />
                          {ds.is_active ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => deleteDataset(ds)}
                          className="text-destructive"
                        >
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
        </Card>
      )}

      {/* Create/Edit Dataset Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingDataset ? 'Editar Dataset' : 'Novo Dataset'}
            </DialogTitle>
            <DialogDescription>
              Conecte uma tabela ou view do seu data source.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Dataset</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Custos x Funil (Dia)"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="datasource">Data Source</Label>
                <Select
                  value={formData.datasourceId}
                  onValueChange={val => {
                    setFormData(prev => ({ ...prev, datasourceId: val, objectName: '' }));
                    if (val) introspectDataSource(val);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {dataSources.map(ds => (
                      <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="kind">Tipo</Label>
                <Select
                  value={formData.kind}
                  onValueChange={(val: 'table' | 'view' | 'sql') => setFormData(prev => ({ ...prev, kind: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="table">Table</SelectItem>
                    <SelectItem value="sql">SQL Query</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refreshPolicy">Política de Cache</Label>
                <Select
                  value={formData.refreshPolicy}
                  onValueChange={val => setFormData(prev => ({ ...prev, refreshPolicy: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live (sem cache)</SelectItem>
                    <SelectItem value="cache_5m">Cache 5 min</SelectItem>
                    <SelectItem value="cache_1h">Cache 1 hora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.kind !== 'sql' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="objectName">
                    {formData.kind === 'view' ? 'View' : 'Tabela'}
                  </Label>
                  {isIntrospecting && <LoadingSpinner size="sm" />}
                </div>
                
                {(availableViews.length > 0 || availableTables.length > 0) ? (
                  <Select
                    value={formData.objectName}
                    onValueChange={val => setFormData(prev => ({ ...prev, objectName: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {formData.kind === 'view' && availableViews.map(v => (
                        <SelectItem key={v.name} value={v.name}>
                          <div className="flex items-center gap-2">
                            <Eye className="h-3 w-3" />
                            {v.name}
                          </div>
                        </SelectItem>
                      ))}
                      {formData.kind === 'table' && availableTables.map(t => (
                        <SelectItem key={t.name} value={t.name}>
                          <div className="flex items-center gap-2">
                            <TableIcon className="h-3 w-3" />
                            {t.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={formData.objectName}
                    onChange={e => setFormData(prev => ({ ...prev, objectName: e.target.value }))}
                    placeholder="Nome da view ou tabela"
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="sqlQuery">SQL Query</Label>
                <textarea
                  id="sqlQuery"
                  value={formData.sqlQuery}
                  onChange={e => setFormData(prev => ({ ...prev, sqlQuery: e.target.value }))}
                  placeholder="SELECT * FROM ..."
                  className="w-full h-32 px-3 py-2 rounded-md border bg-background font-mono text-sm"
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                {editingDataset ? 'Salvar' : 'Criar e Analisar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Columns Dialog */}
      <Dialog open={isColumnsDialogOpen} onOpenChange={setIsColumnsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5" />
              Colunas de {selectedDataset?.name}
            </DialogTitle>
            <DialogDescription>
              Metadados semânticos detectados automaticamente.
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingColumns ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : columns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhuma coluna detectada.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => selectedDataset && introspectDataset(selectedDataset.id, true)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Analisar Dataset
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coluna</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Tipo DB</TableHead>
                    <TableHead>Semântica</TableHead>
                    <TableHead>Formato</TableHead>
                    <TableHead>Agregador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columns.map((col: any) => (
                    <TableRow key={col.column_name}>
                      <TableCell className="font-mono text-sm">{col.column_name}</TableCell>
                      <TableCell>{col.display_label}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{col.db_type}</Badge>
                      </TableCell>
                      <TableCell>{getSemanticBadge(col.semantic_type)}</TableCell>
                      <TableCell>
                        {col.format && <Badge variant="secondary">{col.format}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {col.aggregator_default}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button 
              variant="outline"
              onClick={() => selectedDataset && introspectDataset(selectedDataset.id, true)}
              disabled={isIntrospecting}
            >
              {isIntrospecting ? <LoadingSpinner size="sm" className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Re-analisar
            </Button>
            <Button onClick={() => setIsColumnsDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Builder Wizard */}
      <DashboardAutoBuilder
        open={isAutoBuilderOpen}
        onOpenChange={setIsAutoBuilderOpen}
        onSuccess={handleAutoBuilderSuccess}
        tenantId={autoBuilderTenantId}
      />
    </div>
  );
}
