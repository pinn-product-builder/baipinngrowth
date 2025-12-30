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
import { Users as UsersIcon, Plus, Search, MoreHorizontal, Power, Mail, Send, Clock, UserPlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';

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

    // Filter invites
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
      // Fetch tenants (admin sees all, manager sees only their own)
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

      // Fetch profiles with tenant info
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

      // Fetch user roles separately
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role');

      // Combine the data
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

      // Fetch pending invites
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
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load users.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim()) return;
    
    // Validate non-admin has tenant
    if (formData.role !== 'admin' && !formData.tenantId) {
      toast({ title: 'Tenant required', description: 'Non-admin users must be assigned to a tenant.', variant: 'destructive' });
      return;
    }

    // Managers cannot create admins
    if (isManager && formData.role === 'admin') {
      toast({ title: 'Permission denied', description: 'Managers cannot create admin users.', variant: 'destructive' });
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

      toast({ title: 'Invite sent', description: `Invitation sent to ${formData.email}` });
      setIsDialogOpen(false);
      setFormData({ email: '', fullName: '', tenantId: isManager ? currentUserTenantId || '' : '', role: 'viewer' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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

      toast({ title: 'Invite resent', description: `New invitation sent to ${invite.email}` });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleUserStatus = async (user: UserProfile) => {
    try {
      const newStatus = user.is_active ? 'disabled' : 'active';
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !user.is_active, status: newStatus })
        .eq('id', user.id);

      if (error) throw error;
      logActivity(user.is_active ? 'deactivate_user' : 'create_user', 'user', user.id, { name: user.full_name });
      toast({ 
        title: user.is_active ? 'User deactivated' : 'User activated',
        description: `Account is now ${user.is_active ? 'inactive' : 'active'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getStatusBadge = (user: UserProfile) => {
    if (!user.is_active) {
      return <StatusBadge variant="inactive">Disabled</StatusBadge>;
    }
    return <StatusBadge variant="active">Active</StatusBadge>;
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
    return <LoadingPage message="Loading users..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Users" 
        description="Manage user accounts and invitations"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Invite User</DialogTitle>
                  <DialogDescription>Send an invitation to join the platform.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="user@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name (optional)</Label>
                    <Input
                      id="fullName"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="User's full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select 
                      value={formData.role} 
                      onValueChange={(v) => setFormData({ ...formData, role: v as AppRole })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                        <SelectItem value="manager">Manager (tenant admin)</SelectItem>
                        {isAdmin && <SelectItem value="admin">Admin (global)</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.role !== 'admin' && (
                    <div className="space-y-2">
                      <Label htmlFor="tenant">Tenant (required for non-admin)</Label>
                      <Select 
                        value={formData.tenantId} 
                        onValueChange={(v) => setFormData({ ...formData, tenantId: v })}
                        disabled={isManager}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select tenant" />
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
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    <Send className="mr-2 h-4 w-4" />
                    {isSubmitting ? 'Sending...' : 'Send Invite'}
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
            placeholder="Search users or invites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && (
          <Select value={filterTenant} onValueChange={setFilterTenant}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by tenant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tenants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <UsersIcon className="h-4 w-4" />
            Users ({filteredUsers.length})
          </TabsTrigger>
          <TabsTrigger value="invites" className="gap-2">
            <Mail className="h-4 w-4" />
            Pending Invites ({filteredInvites.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          {filteredUsers.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="h-6 w-6 text-muted-foreground" />}
              title={searchQuery || filterTenant !== 'all' ? 'No users found' : 'No users yet'}
              description={searchQuery || filterTenant !== 'all' ? 'Try adjusting your filters.' : 'Invite your first user to get started.'}
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name || 'No name'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.tenant_name || '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                          {user.role || 'No role'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(user)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(user.created_at), 'dd MMM yyyy')}
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
                              {user.is_active ? 'Disable' : 'Enable'}
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
              title={searchQuery || filterTenant !== 'all' ? 'No invites found' : 'No pending invites'}
              description={searchQuery || filterTenant !== 'all' ? 'Try adjusting your filters.' : 'All invitations have been accepted or expired.'}
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Sent</TableHead>
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
                          {invite.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(invite.expires_at), 'dd MMM HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(invite.created_at), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => resendInvite(invite)}>
                          <Send className="mr-1 h-3.5 w-3.5" />
                          Resend
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
