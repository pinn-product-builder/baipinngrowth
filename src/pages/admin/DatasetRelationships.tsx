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
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { 
  GitBranch, 
  Plus, 
  MoreHorizontal, 
  Pencil, 
  Power, 
  Trash2,
  ArrowRight,
  Link2
} from 'lucide-react';

interface Dataset {
  id: string;
  name: string;
  object_name: string | null;
  tenant_id: string;
}

interface DatasetColumn {
  column_name: string;
  display_label: string;
}

interface Relationship {
  id: string;
  tenant_id: string;
  left_dataset_id: string;
  right_dataset_id: string;
  join_type: 'left' | 'inner' | 'full';
  left_key: string;
  right_key: string;
  cardinality: string | null;
  enabled: boolean;
  created_at: string;
  left_dataset?: { name: string; object_name: string | null };
  right_dataset?: { name: string; object_name: string | null };
}

export default function DatasetRelationships() {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    leftDatasetId: '',
    rightDatasetId: '',
    joinType: 'left' as 'left' | 'inner' | 'full',
    leftKey: '',
    rightKey: '',
    cardinality: '1:N'
  });
  
  // Columns for selected datasets
  const [leftColumns, setLeftColumns] = useState<DatasetColumn[]>([]);
  const [rightColumns, setRightColumns] = useState<DatasetColumn[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch datasets
      const { data: dsData } = await supabase
        .from('datasets')
        .select('id, name, object_name, tenant_id')
        .eq('is_active', true)
        .order('name');
      
      setDatasets(dsData || []);

      // Fetch relationships
      const { data: relData, error } = await supabase
        .from('dataset_relationships')
        .select(`
          *,
          left_dataset:datasets!dataset_relationships_left_dataset_id_fkey (name, object_name),
          right_dataset:datasets!dataset_relationships_right_dataset_id_fkey (name, object_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRelationships((relData as any) || []);
    } catch (error) {
      console.error('Error loading relationships:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar relacionamentos.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchColumns = async (datasetId: string, side: 'left' | 'right') => {
    try {
      const { data } = await supabase
        .from('dataset_columns')
        .select('column_name, display_label')
        .eq('dataset_id', datasetId)
        .order('sort_priority');

      if (side === 'left') {
        setLeftColumns(data || []);
      } else {
        setRightColumns(data || []);
      }
    } catch (error) {
      console.error('Error fetching columns:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.leftDatasetId || !formData.rightDatasetId || !formData.leftKey || !formData.rightKey) return;

    setIsSubmitting(true);
    try {
      const leftDs = datasets.find(d => d.id === formData.leftDatasetId);
      
      const payload = {
        tenant_id: leftDs?.tenant_id,
        left_dataset_id: formData.leftDatasetId,
        right_dataset_id: formData.rightDatasetId,
        join_type: formData.joinType,
        left_key: formData.leftKey,
        right_key: formData.rightKey,
        cardinality: formData.cardinality
      };

      if (editingRelationship) {
        const { error } = await supabase
          .from('dataset_relationships')
          .update(payload)
          .eq('id', editingRelationship.id);

        if (error) throw error;
        toast({ title: 'Relacionamento atualizado' });
      } else {
        const { error } = await supabase
          .from('dataset_relationships')
          .insert(payload);

        if (error) throw error;
        toast({ title: 'Relacionamento criado' });
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
      leftDatasetId: '',
      rightDatasetId: '',
      joinType: 'left',
      leftKey: '',
      rightKey: '',
      cardinality: '1:N'
    });
    setEditingRelationship(null);
    setLeftColumns([]);
    setRightColumns([]);
  };

  const openEditDialog = (rel: Relationship) => {
    setEditingRelationship(rel);
    setFormData({
      leftDatasetId: rel.left_dataset_id,
      rightDatasetId: rel.right_dataset_id,
      joinType: rel.join_type,
      leftKey: rel.left_key,
      rightKey: rel.right_key,
      cardinality: rel.cardinality || '1:N'
    });
    fetchColumns(rel.left_dataset_id, 'left');
    fetchColumns(rel.right_dataset_id, 'right');
    setIsDialogOpen(true);
  };

  const toggleStatus = async (rel: Relationship) => {
    try {
      const { error } = await supabase
        .from('dataset_relationships')
        .update({ enabled: !rel.enabled })
        .eq('id', rel.id);

      if (error) throw error;
      toast({ title: rel.enabled ? 'Relacionamento desativado' : 'Relacionamento ativado' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const deleteRelationship = async (rel: Relationship) => {
    if (!confirm('Excluir este relacionamento?')) return;
    
    try {
      const { error } = await supabase
        .from('dataset_relationships')
        .delete()
        .eq('id', rel.id);

      if (error) throw error;
      toast({ title: 'Relacionamento excluído' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const getJoinTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      left: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      inner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      full: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    };
    return <Badge className={colors[type] || 'bg-muted'}>{type.toUpperCase()} JOIN</Badge>;
  };

  if (isLoading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relacionamentos"
        description="Configure joins entre datasets para consolidar dados."
        actions={
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Relacionamento
          </Button>
        }
      />

      {relationships.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="h-12 w-12" />}
          title="Nenhum relacionamento configurado"
          description="Crie relacionamentos para consolidar múltiplos datasets."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset Esquerdo</TableHead>
                <TableHead className="w-[100px] text-center">Join</TableHead>
                <TableHead>Dataset Direito</TableHead>
                <TableHead>Chaves</TableHead>
                <TableHead>Cardinalidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {relationships.map(rel => (
                <TableRow key={rel.id}>
                  <TableCell>
                    <div className="font-medium">{rel.left_dataset?.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {rel.left_dataset?.object_name}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      {getJoinTypeBadge(rel.join_type)}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{rel.right_dataset?.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {rel.right_dataset?.object_name}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-2">
                      <span>{rel.left_key}</span>
                      <Link2 className="h-3 w-3 text-muted-foreground" />
                      <span>{rel.right_key}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{rel.cardinality || 'N/A'}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={rel.enabled ? 'active' : 'inactive'}>
                      {rel.enabled ? 'Ativo' : 'Inativo'}
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
                        <DropdownMenuItem onClick={() => openEditDialog(rel)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus(rel)}>
                          <Power className="mr-2 h-4 w-4" />
                          {rel.enabled ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => deleteRelationship(rel)}
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

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingRelationship ? 'Editar Relacionamento' : 'Novo Relacionamento'}
            </DialogTitle>
            <DialogDescription>
              Configure um join entre dois datasets.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dataset Esquerdo</Label>
                <Select
                  value={formData.leftDatasetId}
                  onValueChange={val => {
                    setFormData(prev => ({ ...prev, leftDatasetId: val, leftKey: '' }));
                    fetchColumns(val, 'left');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map(ds => (
                      <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Dataset Direito</Label>
                <Select
                  value={formData.rightDatasetId}
                  onValueChange={val => {
                    setFormData(prev => ({ ...prev, rightDatasetId: val, rightKey: '' }));
                    fetchColumns(val, 'right');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.filter(d => d.id !== formData.leftDatasetId).map(ds => (
                      <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chave Esquerda</Label>
                <Select
                  value={formData.leftKey}
                  onValueChange={val => setFormData(prev => ({ ...prev, leftKey: val }))}
                  disabled={leftColumns.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leftColumns.map(col => (
                      <SelectItem key={col.column_name} value={col.column_name}>
                        {col.display_label} ({col.column_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Chave Direita</Label>
                <Select
                  value={formData.rightKey}
                  onValueChange={val => setFormData(prev => ({ ...prev, rightKey: val }))}
                  disabled={rightColumns.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rightColumns.map(col => (
                      <SelectItem key={col.column_name} value={col.column_name}>
                        {col.display_label} ({col.column_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Join</Label>
                <Select
                  value={formData.joinType}
                  onValueChange={(val: 'left' | 'inner' | 'full') => setFormData(prev => ({ ...prev, joinType: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">LEFT JOIN</SelectItem>
                    <SelectItem value="inner">INNER JOIN</SelectItem>
                    <SelectItem value="full">FULL JOIN</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cardinalidade</Label>
                <Select
                  value={formData.cardinality}
                  onValueChange={val => setFormData(prev => ({ ...prev, cardinality: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">1:1 (Um para Um)</SelectItem>
                    <SelectItem value="1:N">1:N (Um para Muitos)</SelectItem>
                    <SelectItem value="N:1">N:1 (Muitos para Um)</SelectItem>
                    <SelectItem value="N:N">N:N (Muitos para Muitos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                {editingRelationship ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
