import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  RefreshCw, 
  BarChart3, 
  Target, 
  DollarSign, 
  Table as TableIcon,
  Download,
  FileSpreadsheet,
  ArrowLeftRight
} from 'lucide-react';
import { format, subDays, differenceInDays } from 'date-fns';
import ExecutiveView from './templates/ExecutiveView';
import FunnelView from './templates/FunnelView';
import CostEfficiencyView from './templates/CostEfficiencyView';
import DataTableView from './templates/DataTableView';

interface CostsFunnelDashboardProps {
  dashboardId: string;
  templateKind?: string;
  dashboardSpec?: Record<string, any>;
  dashboardName?: string;
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
  dashboardSpec = {},
  dashboardName = 'Dashboard'
}: CostsFunnelDashboardProps) {
  const [data, setData] = useState<any[]>([]);
  const [previousData, setPreviousData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [preset, setPreset] = useState('30');
  const [activeTab, setActiveTab] = useState('executive');
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const { toast } = useToast();

  const [errorDetails, setErrorDetails] = useState<{ type?: string; details?: string } | null>(null);

  const fetchData = async (fetchPrevious = false) => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);

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

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorType = result.error_type || 'generic';
        const errorMsg = result.error || `Erro ${res.status}`;
        const errorDetailsText = result.details || '';
        
        setErrorDetails({ type: errorType, details: errorDetailsText });
        throw new Error(errorMsg);
      }

      setData(result.data || []);

      if (fetchPrevious && comparisonEnabled) {
        const periodDays = differenceInDays(new Date(endDate), new Date(startDate));
        const prevEnd = format(subDays(new Date(startDate), 1), 'yyyy-MM-dd');
        const prevStart = format(subDays(new Date(prevEnd), periodDays), 'yyyy-MM-dd');

        const prevUrl = new URL(`${supabaseUrl}/functions/v1/dashboard-data`);
        prevUrl.searchParams.set('dashboard_id', dashboardId);
        prevUrl.searchParams.set('start', prevStart);
        prevUrl.searchParams.set('end', prevEnd);

        const prevRes = await fetch(prevUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (prevRes.ok) {
          const prevResult = await prevRes.json();
          setPreviousData(prevResult.data || []);
        }
      } else {
        setPreviousData([]);
      }

      if (result.cached) {
        toast({ title: 'Dados do cache', description: 'Exibindo dados em cache.', duration: 2000 });
      }
    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(comparisonEnabled);
  }, [dashboardId, startDate, endDate, comparisonEnabled]);

  const handlePresetChange = (days: string) => {
    setPreset(days);
    const daysNum = parseInt(days);
    setStartDate(format(subDays(new Date(), daysNum), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const exportCSV = () => {
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${dashboardName}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    
    toast({ title: 'Exportado!', description: 'CSV baixado.' });
  };

  const getErrorInfo = () => {
    switch (errorDetails?.type) {
      case 'timeout':
        return { title: 'Tempo esgotado', description: 'O servidor demorou muito para responder.' };
      case 'network':
        return { title: 'Erro de rede', description: 'Não foi possível conectar ao servidor.' };
      case 'proxy_error':
        return { title: 'Erro do proxy', description: errorDetails?.details || 'O proxy retornou um erro.' };
      case 'supabase_error':
        return { title: 'Erro do Supabase', description: errorDetails?.details || 'Erro ao consultar o banco de dados.' };
      default:
        return { title: 'Falha ao obter dados', description: error || 'Erro desconhecido' };
    }
  };

  if (error) {
    const errorInfo = getErrorInfo();
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-card">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <RefreshCw className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="text-lg font-medium mb-1">{errorInfo.title}</h3>
        <p className="text-muted-foreground text-sm max-w-md mb-2">{errorInfo.description}</p>
        {errorDetails?.details && errorDetails.details !== errorInfo.description && (
          <p className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded mb-4 max-w-md truncate">
            {errorDetails.details}
          </p>
        )}
        <Button onClick={() => fetchData(comparisonEnabled)} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="dashboard-content">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-end gap-3 bg-muted/30 p-4 rounded-xl border border-border/50">
        <div className="space-y-1">
          <Label className="text-xs">Período</Label>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-[160px] h-9">
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
          <Label className="text-xs">Início</Label>
          <Input 
            type="date" 
            value={startDate} 
            onChange={(e) => {
              setStartDate(e.target.value);
              setPreset('');
            }}
            className="w-[140px] h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fim</Label>
          <Input 
            type="date" 
            value={endDate} 
            onChange={(e) => {
              setEndDate(e.target.value);
              setPreset('');
            }}
            className="w-[140px] h-9"
          />
        </div>
        
        <div className="flex items-center gap-2 ml-auto">
          {/* Comparison Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="comparison" className="text-sm cursor-pointer">Comparar</Label>
            <Switch id="comparison" checked={comparisonEnabled} onCheckedChange={setComparisonEnabled} />
          </div>
          
          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCSV}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={() => fetchData(comparisonEnabled)} variant="outline" size="sm" disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Sem dados no período</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Não encontramos dados para o período selecionado. Tente expandir o intervalo.
          </p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="executive" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Executivo</span>
            </TabsTrigger>
            <TabsTrigger value="funnel" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Funil</span>
            </TabsTrigger>
            <TabsTrigger value="efficiency" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Eficiência</span>
            </TabsTrigger>
            <TabsTrigger value="table" className="flex items-center gap-2">
              <TableIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Tabela</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="executive" className="mt-0">
            <ExecutiveView 
              data={data} 
              spec={dashboardSpec} 
              previousData={previousData}
              comparisonEnabled={comparisonEnabled}
            />
          </TabsContent>

          <TabsContent value="funnel" className="mt-0">
            <FunnelView 
              data={data} 
              spec={dashboardSpec}
              previousData={previousData}
              comparisonEnabled={comparisonEnabled}
            />
          </TabsContent>

          <TabsContent value="efficiency" className="mt-0">
            <CostEfficiencyView data={data} spec={dashboardSpec} />
          </TabsContent>

          <TabsContent value="table" className="mt-0">
            <DataTableView data={data} spec={dashboardSpec} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
