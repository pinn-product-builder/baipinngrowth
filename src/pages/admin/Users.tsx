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
import { Users as UsersIcon, Plus, Search, MoreHorizontal, Power } from 'lucide-react';
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
  created_at: string;
  tenant_name?: string | null;
  role?: string | null;
}

export default function Users() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ 
    email: '', 
    password: '', 
    fullName: '', 
    tenantId: '', 
    role: 'client' as 'admin' | 'client' 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

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
  }, [users, searchQuery, filterTenant]);

  const fetchData = async () => {
    try {
      // Fetch tenants
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      setTenants(tenantsData || []);

      // Fetch profiles with tenant info
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          tenant_id,
          is_active,
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
          created_at: profile.created_at,
          tenant_name: profile.tenants?.name || null,
          role: userRole?.role || null
        };
      });

      setUsers(combinedUsers);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load users.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.password.trim()) return;

    setIsSubmitting(true);
    try {
      // Create user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { full_name: formData.fullName }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      const userId = authData.user.id;

      // Update profile with tenant_id
      if (formData.tenantId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ tenant_id: formData.tenantId, full_name: formData.fullName })
          .eq('id', userId);

        if (profileError) throw profileError;
      }

      // Add role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: formData.role });

      if (roleError) throw roleError;

      toast({ title: 'User created', description: 'New user has been added successfully.' });
      setIsDialogOpen(false);
      setFormData({ email: '', password: '', fullName: '', tenantId: '', role: 'client' });
      fetchData();
    } catch (error: any) {
      if (error.message?.includes('already registered')) {
        toast({ title: 'Email exists', description: 'This email is already registered.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUserStatus = async (user: UserProfile) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !user.is_active })
        .eq('id', user.id);

      if (error) throw error;
      toast({ 
        title: user.is_active ? 'User deactivated' : 'User activated',
        description: `Account is now ${user.is_active ? 'inactive' : 'active'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <LoadingPage message="Loading users..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Users" 
        description="Manage user accounts and access"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Create User</DialogTitle>
                  <DialogDescription>Add a new user account.</DialogDescription>
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
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Minimum 6 characters"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
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
                      onValueChange={(v) => setFormData({ ...formData, role: v as 'admin' | 'client' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.role === 'client' && (
                    <div className="space-y-2">
                      <Label htmlFor="tenant">Tenant</Label>
                      <Select 
                        value={formData.tenantId} 
                        onValueChange={(v) => setFormData({ ...formData, tenantId: v })}
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
                    {isSubmitting ? 'Creating...' : 'Create User'}
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
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
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
      </div>

      {filteredUsers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-6 w-6 text-muted-foreground" />}
          title={searchQuery || filterTenant !== 'all' ? 'No users found' : 'No users yet'}
          description={searchQuery || filterTenant !== 'all' ? 'Try adjusting your filters.' : 'Create your first user to get started.'}
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
                    <span className="capitalize">
                      {user.role || 'No role'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={user.is_active ? 'active' : 'inactive'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </StatusBadge>
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
                          {user.is_active ? 'Deactivate' : 'Activate'}
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
