import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, RotateCcw, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DashboardSpecEditorProps {
  dashboardId: string;
  currentSpec: Record<string, any>;
  detectedColumns: any[] | null;
  onSave: (newSpec: Record<string, any>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMAT_OPTIONS = [
  { value: 'auto', label: 'Automático' },
  { value: 'currency', label: 'Moeda (R$)' },
  { value: 'percent', label: 'Percentual (%)' },
  { value: 'integer', label: 'Número Inteiro' },
  { value: 'decimal', label: 'Decimal' },
];

const COLUMN_LABELS: Record<string, string> = {
  dia: 'Dia',
  custo_total: 'Custo Total',
  leads_total: 'Leads',
  entrada_total: 'Entradas',
  reuniao_agendada_total: 'Reuniões Agendadas',
  reuniao_realizada_total: 'Reuniões Realizadas',
  venda_total: 'Vendas',
  falta_total: 'Faltas',
  desmarque_total: 'Desmarques',
  cpl: 'CPL',
  cac: 'CAC',
  taxa_entrada: 'Taxa Entrada',
  taxa_reuniao_agendada: 'Taxa Agendamento',
  taxa_comparecimento: 'Taxa Comparecimento',
  taxa_venda_pos_reuniao: 'Taxa Venda (pós-reunião)',
  taxa_venda_total: 'Taxa Conversão Total',
};

export default function DashboardSpecEditor({
  dashboardId,
  currentSpec,
  detectedColumns,
  onSave,
  open,
  onOpenChange
}: DashboardSpecEditorProps) {
  const [spec, setSpec] = useState<Record<string, any>>(currentSpec || {});
  const [isLoading, setIsLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setSpec(currentSpec || {});
  }, [currentSpec, open]);

  const columns = detectedColumns || [];
  const columnNames = columns.map((c: any) => c.name || c);

  const handleKpiToggle = (kpi: string, checked: boolean) => {
    const currentKpis = spec.kpis || [];
    const newKpis = checked 
      ? [...currentKpis, kpi]
      : currentKpis.filter((k: string) => k !== kpi);
    setSpec({ ...spec, kpis: newKpis });
  };

  const handleTableColumnToggle = (col: string, checked: boolean) => {
    const currentCols = spec.tableColumns || columnNames;
    const newCols = checked
      ? [...currentCols, col]
      : currentCols.filter((c: string) => c !== col);
    setSpec({ ...spec, tableColumns: newCols });
  };

  const handleFormatChange = (col: string, format: string) => {
    const currentFormatting = spec.formatting || {};
    const newFormatting = { ...currentFormatting, [col]: format === 'auto' ? undefined : format };
    if (format === 'auto') delete newFormatting[col];
    setSpec({ ...spec, formatting: newFormatting });
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('dashboards')
        .update({ dashboard_spec: spec })
        .eq('id', dashboardId);

      if (error) throw error;

      toast({ title: 'Configuração salva', description: 'Layout do dashboard atualizado.' });
      onSave(spec);
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedetect = async () => {
    setIsDetecting(true);
    try {
      const { data: dashboard } = await supabase
        .from('dashboards')
        .select('data_source_id, view_name')
        .eq('id', dashboardId)
        .single();

      if (!dashboard) throw new Error('Dashboard não encontrado');

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Não autenticado');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/detect-template`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data_source_id: dashboard.data_source_id,
          view_name: dashboard.view_name,
          dashboard_id: dashboardId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao detectar template');
      }

      const result = await response.json();
      setSpec(result.suggested_spec || {});
      toast({ 
        title: 'Template re-detectado', 
        description: `Confiança: ${result.confidence}%`
      });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsDetecting(false);
    }
  };

  const handleReset = () => {
    setSpec(currentSpec || {});
  };

  const kpiOptions = columnNames.filter((col: string) => 
    col.endsWith('_total') || col === 'cpl' || col === 'cac'
  );

  const selectedKpis = spec.kpis || [];
  const selectedTableColumns = spec.tableColumns || columnNames;
  const formatting = spec.formatting || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Editar Layout do Dashboard
          </DialogTitle>
          <DialogDescription>
            Personalize quais KPIs, gráficos e colunas serão exibidos.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            {/* KPIs Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">KPIs Exibidos</Label>
              <p className="text-sm text-muted-foreground">
                Selecione quais métricas aparecem nos cards da visão executiva.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {kpiOptions.map((kpi: string) => (
                  <div key={kpi} className="flex items-center space-x-2">
                    <Checkbox
                      id={`kpi-${kpi}`}
                      checked={selectedKpis.includes(kpi)}
                      onCheckedChange={(checked) => handleKpiToggle(kpi, !!checked)}
                    />
                    <label htmlFor={`kpi-${kpi}`} className="text-sm cursor-pointer">
                      {COLUMN_LABELS[kpi] || kpi}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Table Columns Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Colunas da Tabela</Label>
              <p className="text-sm text-muted-foreground">
                Selecione quais colunas aparecem na tabela de dados.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {columnNames.map((col: string) => (
                  <div key={col} className="flex items-center space-x-2">
                    <Checkbox
                      id={`col-${col}`}
                      checked={selectedTableColumns.includes(col)}
                      onCheckedChange={(checked) => handleTableColumnToggle(col, !!checked)}
                    />
                    <label htmlFor={`col-${col}`} className="text-sm cursor-pointer">
                      {COLUMN_LABELS[col] || col}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Column Formatting */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Formatação de Colunas</Label>
              <p className="text-sm text-muted-foreground">
                Defina como cada coluna deve ser formatada.
              </p>
              <div className="space-y-2">
                {columnNames.filter((col: string) => col !== 'dia').map((col: string) => (
                  <div key={col} className="flex items-center justify-between gap-4">
                    <span className="text-sm min-w-[150px]">{COLUMN_LABELS[col] || col}</span>
                    <Select
                      value={formatting[col] || 'auto'}
                      onValueChange={(value) => handleFormatChange(col, value)}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMAT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleRedetect}
              disabled={isDetecting}
            >
              {isDetecting ? (
                <LoadingSpinner className="mr-2 h-4 w-4" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Re-detectar
            </Button>
            <Button variant="ghost" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Resetar
            </Button>
          </div>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <LoadingSpinner className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
