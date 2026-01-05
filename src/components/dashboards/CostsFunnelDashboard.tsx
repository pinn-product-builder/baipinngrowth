import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, BarChart3, Target, DollarSign, Table as TableIcon } from 'lucide-react';
import { format, subDays } from 'date-fns';
import ExecutiveView from './templates/ExecutiveView';
import FunnelView from './templates/FunnelView';
import CostEfficiencyView from './templates/CostEfficiencyView';
import DataTableView from './templates/DataTableView';

interface CostsFunnelDashboardProps {
  dashboardId: string;
  templateKind?: string;
  dashboardSpec?: Record<string, any>;
}

const datePresets = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 60 dias', days: 60 },
  { label: 'Últimos 90 dias', days: 90 },
];

export default function CostsFunnelDashboard({ 
  dashboardId, 
  templateKind = 'costs_funnel_daily',
  dashboardSpec = {}
}: CostsFunnelDashboardProps) {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 60), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [preset, setPreset] = useState('60');
  const [activeTab, setActiveTab] = useState('executive');
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Não autenticado');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const url = new URL(`${supabaseUrl}/functions/v1/dashboard-data`);
      url.searchParams.set('dashboard_id', dashboardId);
      url.searchParams.set('start', startDate);
      url.searchParams.set('end', endDate);

      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${res.status}`);
      }

      const result = await res.json();
      setData(result.data || []);

      if (result.cached) {
        toast({ 
          title: 'Dados do cache', 
          description: 'Exibindo dados em cache.',
          duration: 2000
        });
      }
    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError(err.message || 'Erro ao carregar dados');
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dashboardId, startDate, endDate]);

  const handlePresetChange = (days: string) => {
    setPreset(days);
    const daysNum = parseInt(days);
    setStartDate(format(subDays(new Date(), daysNum), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={fetchData} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 bg-muted/30 p-4 rounded-lg">
        <div className="space-y-1">
          <Label>Período</Label>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {datePresets.map((p) => (
                <SelectItem key={p.days} value={String(p.days)}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Data Início</Label>
          <Input 
            type="date" 
            value={startDate} 
            onChange={(e) => {
              setStartDate(e.target.value);
              setPreset('');
            }}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label>Data Fim</Label>
          <Input 
            type="date" 
            value={endDate} 
            onChange={(e) => {
              setEndDate(e.target.value);
              setPreset('');
            }}
            className="w-[150px]"
          />
        </div>
        <Button onClick={fetchData} variant="outline" disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="executive" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Visão Executiva</span>
              <span className="sm:hidden">Executivo</span>
            </TabsTrigger>
            <TabsTrigger value="funnel" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Funil & Conversões</span>
              <span className="sm:hidden">Funil</span>
            </TabsTrigger>
            <TabsTrigger value="efficiency" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Eficiência por Etapa</span>
              <span className="sm:hidden">Eficiência</span>
            </TabsTrigger>
            <TabsTrigger value="table" className="flex items-center gap-2">
              <TableIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Dados Completos</span>
              <span className="sm:hidden">Tabela</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="executive" className="mt-6">
            <ExecutiveView data={data} spec={dashboardSpec} />
          </TabsContent>

          <TabsContent value="funnel" className="mt-6">
            <FunnelView data={data} spec={dashboardSpec} />
          </TabsContent>

          <TabsContent value="efficiency" className="mt-6">
            <CostEfficiencyView data={data} spec={dashboardSpec} />
          </TabsContent>

          <TabsContent value="table" className="mt-6">
            <DataTableView data={data} spec={dashboardSpec} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
