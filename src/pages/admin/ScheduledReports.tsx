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
import { useToast } from '@/hooks/use-toast';
import { useActivityLogger } from '@/hooks/useActivityLogger';
import { Calendar, Plus, MoreHorizontal, Pencil, Power, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';

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
  tenant_id: string;
  name: string;
  frequency: 'weekly' | 'monthly';
  emails: string[];
  dashboard_ids: string[];
  is_active: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  created_at: string;
  tenants?: { name: string } | null;
}

export default function ScheduledReports() {
  const { isAdmin, tenantId: userTenantId } = useAuth();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    tenantId: '',
    frequency: 'weekly' as 'weekly' | 'monthly',
    emails: '',
    dashboardIds: [] as string[]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch tenants (admin sees all, manager sees own)
      let tenantsQuery = supabase.from('tenants').select('id, name').eq('is_active', true).order('name');
      if (!isAdmin && userTenantId) {
        tenantsQuery = tenantsQuery.eq('id', userTenantId);
      }
      const { data: tenantsData } = await tenantsQuery;
      setTenants(tenantsData || []);

      // Fetch dashboards
      let dashboardsQuery = supabase.from('dashboards').select('id, name, tenant_id').eq('is_active', true).order('name');
      if (!isAdmin && userTenantId) {
        dashboardsQuery = dashboardsQuery.eq('tenant_id', userTenantId);
      }
      const { data: dashboardsData } = await dashboardsQuery;
      setDashboards(dashboardsData || []);

      // Fetch scheduled reports
      let reportsQuery = supabase.from('scheduled_reports').select('*, tenants (name)').order('created_at', { ascending: false });
      if (!isAdmin && userTenantId) {
        reportsQuery = reportsQuery.eq('tenant_id', userTenantId);
      }
      const { data: reportsData, error } = await reportsQuery;

      if (error) throw error;
      // Type assertion for frequency field
      setReports((reportsData || []).map(r => ({
        ...r,
        frequency: r.frequency as 'weekly' | 'monthly'
      })));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load scheduled reports.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.tenantId || !formData.emails.trim() || formData.dashboardIds.length === 0) {
      toast({ title: 'Missing fields', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    const emailList = formData.emails.split(',').map(e => e.trim()).filter(e => e);
    
    // Calculate next send time
    const now = new Date();
    let nextSend = new Date();
    if (formData.frequency === 'weekly') {
      nextSend.setDate(now.getDate() + (7 - now.getDay())); // Next Sunday
      nextSend.setHours(9, 0, 0, 0);
    } else {
      nextSend.setMonth(now.getMonth() + 1, 1); // First of next month
      nextSend.setHours(9, 0, 0, 0);
    }

    setIsSubmitting(true);
    try {
      const payload = {
        tenant_id: formData.tenantId,
        name: formData.name,
        frequency: formData.frequency,
        emails: emailList,
        dashboard_ids: formData.dashboardIds,
        next_send_at: nextSend.toISOString()
      };

      if (editingReport) {
        const { error } = await supabase
          .from('scheduled_reports')
          .update(payload)
          .eq('id', editingReport.id);

        if (error) throw error;
        logActivity('update_scheduled_report', 'scheduled_report', editingReport.id, { name: formData.name });
        toast({ title: 'Report updated', description: 'Scheduled report updated successfully.' });
      } else {
        const { data, error } = await supabase
          .from('scheduled_reports')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        logActivity('create_scheduled_report', 'scheduled_report', data.id, { name: formData.name });
        toast({ title: 'Report created', description: 'Scheduled report created successfully.' });
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
      tenantId: !isAdmin && userTenantId ? userTenantId : '',
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

  const toggleReportStatus = async (report: ScheduledReport) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ is_active: !report.is_active })
        .eq('id', report.id);

      if (error) throw error;
      toast({ 
        title: report.is_active ? 'Report paused' : 'Report activated',
        description: `${report.name} is now ${report.is_active ? 'paused' : 'active'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const deleteReport = async (report: ScheduledReport) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', report.id);

      if (error) throw error;
      logActivity('delete_scheduled_report', 'scheduled_report', report.id, { name: report.name });
      toast({ title: 'Report deleted', description: 'Scheduled report has been deleted.' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const filteredDashboards = dashboards.filter(d => d.tenant_id === formData.tenantId);

  const toggleDashboard = (dashboardId: string) => {
    setFormData(prev => ({
      ...prev,
      dashboardIds: prev.dashboardIds.includes(dashboardId)
        ? prev.dashboardIds.filter(id => id !== dashboardId)
        : [...prev.dashboardIds, dashboardId]
    }));
  };

  if (isLoading) {
    return <LoadingPage message="Loading scheduled reports..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Scheduled Reports" 
        description="Configure automated report delivery"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingReport ? 'Edit Report' : 'Create Scheduled Report'}</DialogTitle>
                  <DialogDescription>
                    Configure automated email delivery of dashboard links.
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
                  <div className="space-y-2">
                    <Label htmlFor="name">Report Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Weekly Sales Report"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequency">Frequency</Label>
                    <Select 
                      value={formData.frequency} 
                      onValueChange={(v) => setFormData({ ...formData, frequency: v as 'weekly' | 'monthly' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly (Sundays)</SelectItem>
                        <SelectItem value="monthly">Monthly (1st)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emails">Recipients (comma-separated)</Label>
                    <Input
                      id="emails"
                      value={formData.emails}
                      onChange={(e) => setFormData({ ...formData, emails: e.target.value })}
                      placeholder="user1@example.com, user2@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dashboards to Include</Label>
                    {filteredDashboards.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Select a tenant first to see available dashboards.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                        {filteredDashboards.map((dashboard) => (
                          <div key={dashboard.id} className="flex items-center gap-2">
                            <Checkbox
                              id={dashboard.id}
                              checked={formData.dashboardIds.includes(dashboard.id)}
                              onCheckedChange={() => toggleDashboard(dashboard.id)}
                            />
                            <label htmlFor={dashboard.id} className="text-sm cursor-pointer">
                              {dashboard.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : (editingReport ? 'Save Changes' : 'Create Report')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {reports.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6 text-muted-foreground" />}
          title="No scheduled reports yet"
          description="Create your first scheduled report to automate dashboard delivery."
          action={
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Report
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {isAdmin && <TableHead>Tenant</TableHead>}
                <TableHead>Frequency</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Dashboards</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next Send</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.name}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-muted-foreground">
                      {report.tenants?.name || '-'}
                    </TableCell>
                  )}
                  <TableCell className="capitalize">{report.frequency}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {report.emails.length} recipient{report.emails.length !== 1 ? 's' : ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {report.dashboard_ids.length} dashboard{report.dashboard_ids.length !== 1 ? 's' : ''}
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={report.is_active ? 'active' : 'inactive'}>
                      {report.is_active ? 'Active' : 'Paused'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {report.next_send_at 
                      ? format(new Date(report.next_send_at), 'dd MMM yyyy')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(report)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleReportStatus(report)}>
                          <Power className="mr-2 h-4 w-4" />
                          {report.is_active ? 'Pause' : 'Activate'}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => deleteReport(report)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
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
