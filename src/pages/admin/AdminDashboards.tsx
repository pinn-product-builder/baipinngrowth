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
import { BarChart3, Plus, Search, MoreHorizontal, Pencil, Power, ExternalLink, CheckCircle, XCircle, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
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

interface Dashboard {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  webhook_url: string;
  display_type: 'auto' | 'iframe' | 'html' | 'json';
  is_active: boolean;
  display_order: number;
  created_at: string;
  last_health_status: string | null;
  last_health_check_at: string | null;
  tenants?: { name: string } | null;
}

type HealthStatus = 'idle' | 'checking' | 'success' | 'error';

export default function AdminDashboards() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [filteredDashboards, setFilteredDashboards] = useState<Dashboard[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<Dashboard | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tenantId: '',
    webhookUrl: '',
    displayType: 'auto' as 'auto' | 'iframe' | 'html' | 'json',
    displayOrder: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [healthChecks, setHealthChecks] = useState<Record<string, HealthStatus>>({});
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

      const { data: dashboardsData, error } = await supabase
        .from('dashboards')
        .select(`
          *,
          tenants (name)
        `)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setDashboards(dashboardsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load dashboards.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.tenantId || !formData.webhookUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        tenant_id: formData.tenantId,
        name: formData.name,
        description: formData.description || null,
        webhook_url: formData.webhookUrl,
        display_type: formData.displayType,
        display_order: formData.displayOrder
      };

      if (editingDashboard) {
        const { error } = await supabase
          .from('dashboards')
          .update(payload)
          .eq('id', editingDashboard.id);

        if (error) throw error;
        logActivity('update_dashboard', 'dashboard', editingDashboard.id, { name: formData.name });
        toast({ title: 'Dashboard updated', description: 'Changes saved successfully.' });
      } else {
        const { data, error } = await supabase
          .from('dashboards')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        logActivity('create_dashboard', 'dashboard', data.id, { name: formData.name });
        toast({ title: 'Dashboard created', description: 'New dashboard added successfully.' });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      tenantId: '',
      webhookUrl: '',
      displayType: 'auto',
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
      webhookUrl: dashboard.webhook_url,
      displayType: dashboard.display_type,
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
      logActivity(dashboard.is_active ? 'deactivate_dashboard' : 'create_dashboard', 'dashboard', dashboard.id, { name: dashboard.name });
      toast({ 
        title: dashboard.is_active ? 'Dashboard deactivated' : 'Dashboard activated',
        description: `${dashboard.name} is now ${dashboard.is_active ? 'inactive' : 'active'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const checkHealth = async (dashboard: Dashboard) => {
    setHealthChecks(prev => ({ ...prev, [dashboard.id]: 'checking' }));
    
    let status: 'ok' | 'error' = 'error';
    
    try {
      const response = await fetch(dashboard.webhook_url, { method: 'HEAD' });
      status = response.ok ? 'ok' : 'error';
    } catch {
      // Try GET as fallback
      try {
        const response = await fetch(dashboard.webhook_url);
        status = response.ok ? 'ok' : 'error';
      } catch {
        status = 'error';
      }
    }

    // Save health check result to database
    await supabase
      .from('dashboards')
      .update({ 
        last_health_status: status,
        last_health_check_at: new Date().toISOString()
      })
      .eq('id', dashboard.id);

    setHealthChecks(prev => ({ ...prev, [dashboard.id]: status === 'ok' ? 'success' : 'error' }));
    fetchData();

    // Reset visual after 3 seconds
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
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <LoadingPage message="Loading dashboards..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Manage Dashboards" 
        description="Configure and manage client dashboards"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Dashboard
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingDashboard ? 'Edit Dashboard' : 'Create Dashboard'}</DialogTitle>
                  <DialogDescription>
                    {editingDashboard ? 'Update dashboard configuration.' : 'Add a new dashboard for a client.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
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
                  <div className="space-y-2">
                    <Label htmlFor="name">Dashboard Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Funil de Vendas"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of the dashboard"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="webhookUrl">Webhook URL</Label>
                    <Input
                      id="webhookUrl"
                      value={formData.webhookUrl}
                      onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                      placeholder="https://n8n.example.com/webhook/..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="displayType">Display Type</Label>
                      <Select 
                        value={formData.displayType} 
                        onValueChange={(v) => setFormData({ ...formData, displayType: v as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect</SelectItem>
                          <SelectItem value="iframe">iFrame</SelectItem>
                          <SelectItem value="html">HTML</SelectItem>
                          <SelectItem value="json">JSON</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="displayOrder">Display Order</Label>
                      <Input
                        id="displayOrder"
                        type="number"
                        value={formData.displayOrder}
                        onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                        min={0}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : (editingDashboard ? 'Save Changes' : 'Create Dashboard')}
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
            placeholder="Search dashboards..."
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

      {filteredDashboards.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6 text-muted-foreground" />}
          title={searchQuery || filterTenant !== 'all' ? 'No dashboards found' : 'No dashboards yet'}
          description={searchQuery || filterTenant !== 'all' ? 'Try adjusting your filters.' : 'Create your first dashboard to get started.'}
          action={!searchQuery && filterTenant === 'all' && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Dashboard
            </Button>
          )}
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Order</TableHead>
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
                  <TableCell className="text-muted-foreground">
                    {dashboard.tenants?.name || '-'}
                  </TableCell>
                  <TableCell className="capitalize text-sm">{dashboard.display_type}</TableCell>
                  <TableCell>
                    <StatusBadge variant={dashboard.is_active ? 'active' : 'inactive'}>
                      {dashboard.is_active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => checkHealth(dashboard)}
                        disabled={healthChecks[dashboard.id] === 'checking'}
                      >
                        {healthChecks[dashboard.id] === 'checking' && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {healthChecks[dashboard.id] === 'success' && (
                          <CheckCircle className="h-4 w-4 text-success" />
                        )}
                        {healthChecks[dashboard.id] === 'error' && (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        {(!healthChecks[dashboard.id] || healthChecks[dashboard.id] === 'idle') && (
                          <>
                            {dashboard.last_health_status === 'ok' && <CheckCircle className="h-4 w-4 text-success" />}
                            {dashboard.last_health_status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                            {!dashboard.last_health_status && <span className="text-xs">Check</span>}
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">{dashboard.display_order}</span>
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
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(dashboard.webhook_url, '_blank')}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open URL
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleDashboardStatus(dashboard)}>
                          <Power className="mr-2 h-4 w-4" />
                          {dashboard.is_active ? 'Deactivate' : 'Activate'}
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
