import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { Input } from '@/components/ui/input';
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
import { Activity, Search } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface Tenant {
  id: string;
  name: string;
}

interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: unknown;
  created_at: string;
  user_name?: string;
}

type PeriodFilter = 'all' | '7' | '30' | '90';

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ActivityLog[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>('30');

  useEffect(() => {
    fetchData();
  }, [filterPeriod]);

  useEffect(() => {
    let filtered = logs;
    
    if (searchQuery) {
      filtered = filtered.filter(log => 
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.entity_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.user_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterAction !== 'all') {
      filtered = filtered.filter(log => log.action === filterAction);
    }
    
    setFilteredLogs(filtered);
  }, [logs, searchQuery, filterAction]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .order('name');
      
      setTenants(tenantsData || []);

      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      // Apply period filter
      if (filterPeriod !== 'all') {
        const daysAgo = subDays(new Date(), parseInt(filterPeriod));
        query = query.gte('created_at', daysAgo.toISOString());
      }

      const { data: logsData, error } = await query;

      if (error) throw error;

      // Fetch user names
      const userIds = [...new Set((logsData || []).map(l => l.user_id).filter(Boolean))];
      let userNames: Record<string, string> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        userNames = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || 'Unknown';
          return acc;
        }, {} as Record<string, string>);
      }

      const enrichedLogs = (logsData || []).map(log => ({
        ...log,
        user_name: log.user_id ? userNames[log.user_id] || 'Unknown' : 'System'
      }));

      setLogs(enrichedLogs);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const formatDetails = (details: unknown) => {
    if (!details || typeof details !== 'object') return '-';
    const entries = Object.entries(details as Record<string, unknown>).slice(0, 3);
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
  };

  if (isLoading) {
    return <LoadingPage message="Loading activity logs..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Activity Logs" 
        description="Monitor system activity and user actions"
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActions.map((action) => (
              <SelectItem key={action} value={action}>{action.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as PeriodFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredLogs.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-6 w-6 text-muted-foreground" />}
          title="No activity logs"
          description="Activity will appear here as users interact with the system."
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format(new Date(log.created_at), 'dd MMM yyyy HH:mm:ss')}
                  </TableCell>
                  <TableCell className="font-medium">{log.user_name}</TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.entity_type ? `${log.entity_type}` : '-'}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                    {formatDetails(log.details)}
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
