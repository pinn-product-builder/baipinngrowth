import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useActivityLogger } from '@/hooks/useActivityLogger';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Users as UsersIcon, Plus, Search, MoreHorizontal, Power, Mail, Send, Clock, UserPlus } from 'lucide-react';
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
}

interface UserProfile {
  id: string;
  full_name: string | null;
  tenant_id: string | null;
  is_active: boolean;
  status: string;
  created_at: string;
  tenant_name?: string | null;
  role?: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  tenant_id: string | null;
  tenant_name?: string | null;
  expires_at: string;
  created_at: string;
}

type AppRole = 'admin' | 'manager' | 'viewer';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  viewer: 'Visualizador'
};

export default function Users() {
  const { userRole, tenantId: currentUserTenantId } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [filteredInvites, setFilteredInvites] = useState<PendingInvite[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ 
    email: '', 
    fullName: '', 
    tenantId: '', 
    role: 'viewer' as AppRole
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('users');
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();
  const { logCreate, logUpdate } = useAuditLog();

  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = users;
    
    if (searchQuery) {
      filtered = filtered.filter(u => 
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterTenant !== 'all') {
      filtered = filtered.filter(u => u.tenant_id === filterTenant);
    }
    
    setFilteredUsers(filtered);

    // Filtrar convites
    let filteredInv = pendingInvites;
    if (searchQuery) {
      filteredInv = filteredInv.filter(i => 
        i.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (filterTenant !== 'all') {
      filteredInv = filteredInv.filter(i => i.tenant_id === filterTenant);
    }
    setFilteredInvites(filteredInv);
  }, [users, pendingInvites, searchQuery, filterTenant]);

  const fetchData = async () => {
    try {
      // Buscar clientes (admin vê todos, manager vê apenas o seu)
      let tenantsQuery = supabase
        .from('tenants')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      if (isManager && currentUserTenantId) {
        tenantsQuery = tenantsQuery.eq('id', currentUserTenantId);
      }
      
      const { data: tenantsData } = await tenantsQuery;
      setTenants(tenantsData || []);

      // Buscar perfis com info do cliente
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          tenant_id,
          is_active,
          status,
          created_at,
          tenants (name)
        `)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Buscar roles dos usuários separadamente
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role');

      // Combinar os dados
      const combinedUsers: UserProfile[] = (profilesData || []).map((profile: any) => {
        const userRole = rolesData?.find(r => r.user_id === profile.id);
        return {
          id: profile.id,
          full_name: profile.full_name,
          tenant_id: profile.tenant_id,
          is_active: profile.is_active,
          status: profile.status || 'active',
          created_at: profile.created_at,
          tenant_name: profile.tenants?.name || null,
          role: userRole?.role || null
        };
      });

      setUsers(combinedUsers);

      // Buscar convites pendentes
      const { data: invitesData } = await supabase
        .from('user_invites')
        .select(`
          id,
          email,
          role,
          tenant_id,
          expires_at,
          created_at,
          tenants (name)
        `)
        .eq('accepted', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      const formattedInvites: PendingInvite[] = (invitesData || []).map((invite: any) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        tenant_id: invite.tenant_id,
        tenant_name: invite.tenants?.name || null,
        expires_at: invite.expires_at,
        created_at: invite.created_at
      }));

      setPendingInvites(formattedInvites);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar usuários.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim()) return;
    
    // Validar se não-admin tem cliente
    if (formData.role !== 'admin' && !formData.tenantId) {
      toast({ title: 'Cliente obrigatório', description: 'Usuários não-admin devem ser atribuídos a um cliente.', variant: 'destructive' });
      return;
    }

    // Managers não podem criar admins
    if (isManager && formData.role === 'admin') {
      toast({ title: 'Permissão negada', description: 'Gestores não podem criar usuários administradores.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: {
          email: formData.email,
          fullName: formData.fullName || undefined,
          tenantId: formData.tenantId || undefined,
          role: formData.role
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      await logCreate('user_invite', data.invite_id || formData.email, formData.email, { email: formData.email, role: formData.role });
      toast({ title: 'Convite enviado', description: `Convite enviado para ${formData.email}` });
      setIsDialogOpen(false);
      setFormData({ email: '', fullName: '', tenantId: isManager ? currentUserTenantId || '' : '', role: 'viewer' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendInvite = async (invite: PendingInvite) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: {
          email: invite.email,
          tenantId: invite.tenant_id || undefined,
          role: invite.role
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ title: 'Convite reenviado', description: `Novo convite enviado para ${invite.email}` });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const toggleUserStatus = async (user: UserProfile) => {
    try {
      const newActive = !user.is_active;
      const newStatus = user.is_active ? 'disabled' : 'active';
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: newActive, status: newStatus })
        .eq('id', user.id);

      if (error) throw error;
      logActivity(user.is_active ? 'deactivate_user' : 'create_user', 'user', user.id, { name: user.full_name });
      await logUpdate('user', user.id, user.full_name || user.id, { is_active: user.is_active }, { is_active: newActive });
      toast({ 
        title: user.is_active ? 'Usuário desativado' : 'Usuário ativado',
        description: `A conta agora está ${user.is_active ? 'inativa' : 'ativa'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const getStatusBadge = (user: UserProfile) => {
    if (!user.is_active) {
      return <StatusBadge variant="inactive">Desativado</StatusBadge>;
    }
    return <StatusBadge variant="active">Ativo</StatusBadge>;
  };

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case 'admin': return 'bg-destructive/10 text-destructive';
      case 'manager': return 'bg-primary/10 text-primary';
      case 'viewer': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return <LoadingPage message="Carregando usuários..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Usuários" 
        description="Gerencie contas de usuários e convites"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Convidar Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Convidar Usuário</DialogTitle>
                  <DialogDescription>Envie um convite para ingressar na plataforma.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="usuario@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome Completo (opcional)</Label>
                    <Input
                      id="fullName"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="Nome completo do usuário"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Perfil</Label>
                    <Select 
                      value={formData.role} 
                      onValueChange={(v) => setFormData({ ...formData, role: v as AppRole })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Visualizador (somente leitura)</SelectItem>
                        <SelectItem value="manager">Gestor (admin do cliente)</SelectItem>
                        {isAdmin && <SelectItem value="admin">Administrador (global)</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.role !== 'admin' && (
                    <div className="space-y-2">
                      <Label htmlFor="tenant">Cliente (obrigatório para não-admin)</Label>
                      <Select 
                        value={formData.tenantId} 
                        onValueChange={(v) => setFormData({ ...formData, tenantId: v })}
                        disabled={isManager}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenants.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    <Send className="mr-2 h-4 w-4" />
                    {isSubmitting ? 'Enviando...' : 'Enviar Convite'}
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
            placeholder="Buscar usuários ou convites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && (
          <Select value={filterTenant} onValueChange={setFilterTenant}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Clientes</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Abas */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <UsersIcon className="h-4 w-4" />
            Usuários ({filteredUsers.length})
          </TabsTrigger>
          <TabsTrigger value="invites" className="gap-2">
            <Mail className="h-4 w-4" />
            Convites Pendentes ({filteredInvites.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          {filteredUsers.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="h-6 w-6 text-muted-foreground" />}
              title={searchQuery || filterTenant !== 'all' ? 'Nenhum usuário encontrado' : 'Nenhum usuário ainda'}
              description={searchQuery || filterTenant !== 'all' ? 'Tente ajustar seus filtros.' : 'Convide seu primeiro usuário para começar.'}
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name || 'Sem nome'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.tenant_name || '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                          {user.role ? roleLabels[user.role] || user.role : 'Sem perfil'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(user)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(user.created_at), 'dd MMM yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toggleUserStatus(user)}>
                              <Power className="mr-2 h-4 w-4" />
                              {user.is_active ? 'Desativar' : 'Ativar'}
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
        </TabsContent>

        <TabsContent value="invites" className="mt-4">
          {filteredInvites.length === 0 ? (
            <EmptyState
              icon={<Mail className="h-6 w-6 text-muted-foreground" />}
              title={searchQuery || filterTenant !== 'all' ? 'Nenhum convite encontrado' : 'Nenhum convite pendente'}
              description={searchQuery || filterTenant !== 'all' ? 'Tente ajustar seus filtros.' : 'Todos os convites foram aceitos ou expiraram.'}
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Expira</TableHead>
                    <TableHead>Enviado</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {invite.tenant_name || '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getRoleBadgeColor(invite.role)}`}>
                          {roleLabels[invite.role] || invite.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(invite.expires_at), 'dd MMM HH:mm', { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(invite.created_at), 'dd MMM yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => resendInvite(invite)}>
                          <Send className="mr-1 h-3.5 w-3.5" />
                          Reenviar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}