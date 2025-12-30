import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Building2, Plus, Search, MoreHorizontal, Pencil, Power } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    const filtered = tenants.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredTenants(filtered);
  }, [tenants, searchQuery]);

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar clientes.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (name: string) => {
    setFormData({
      name,
      slug: editingTenant ? formData.slug : generateSlug(name)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.slug.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingTenant) {
        const { error } = await supabase
          .from('tenants')
          .update({ name: formData.name, slug: formData.slug })
          .eq('id', editingTenant.id);

        if (error) throw error;
        toast({ title: 'Cliente atualizado', description: 'Alterações salvas com sucesso.' });
      } else {
        const { error } = await supabase
          .from('tenants')
          .insert({ name: formData.name, slug: formData.slug });

        if (error) {
          if (error.code === '23505') {
            toast({ title: 'Slug já existe', description: 'Este slug já está em uso.', variant: 'destructive' });
            return;
          }
          throw error;
        }
        toast({ title: 'Cliente criado', description: 'Novo cliente adicionado com sucesso.' });
      }
      
      setIsDialogOpen(false);
      setFormData({ name: '', slug: '' });
      setEditingTenant(null);
      fetchTenants();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTenantStatus = async (tenant: Tenant) => {
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ is_active: !tenant.is_active })
        .eq('id', tenant.id);

      if (error) throw error;
      toast({ 
        title: tenant.is_active ? 'Cliente desativado' : 'Cliente ativado',
        description: `${tenant.name} agora está ${tenant.is_active ? 'inativo' : 'ativo'}.`
      });
      fetchTenants();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const openEditDialog = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setFormData({ name: tenant.name, slug: tenant.slug });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTenant(null);
    setFormData({ name: '', slug: '' });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return <LoadingPage message="Carregando clientes..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Clientes" 
        description="Gerencie as organizações clientes"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingTenant ? 'Editar Cliente' : 'Criar Cliente'}</DialogTitle>
                  <DialogDescription>
                    {editingTenant ? 'Atualize os dados do cliente.' : 'Adicione uma nova organização cliente.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Nome do Cliente"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug (identificador)</Label>
                    <Input
                      id="slug"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      placeholder="nome-do-cliente"
                    />
                    <p className="text-xs text-muted-foreground">Usado como identificador único. Minúsculas, sem espaços.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : (editingTenant ? 'Salvar Alterações' : 'Criar Cliente')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar clientes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredTenants.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6 text-muted-foreground" />}
          title={searchQuery ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
          description={searchQuery ? 'Tente ajustar sua busca.' : 'Crie seu primeiro cliente para começar.'}
          action={!searchQuery && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Cliente
            </Button>
          )}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{tenant.slug}</TableCell>
                  <TableCell>
                    <StatusBadge variant={tenant.is_active ? 'active' : 'inactive'}>
                      {tenant.is_active ? 'Ativo' : 'Inativo'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(tenant.created_at), 'dd MMM yyyy', { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(tenant)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleTenantStatus(tenant)}>
                          <Power className="mr-2 h-4 w-4" />
                          {tenant.is_active ? 'Desativar' : 'Ativar'}
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