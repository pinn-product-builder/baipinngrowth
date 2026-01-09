import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowData: Record<string, any> | null;
  previousRowData?: Record<string, any> | null;
  dateColumn?: string;
}

const METRIC_LABELS: Record<string, string> = {
  custo_total: 'Custo Total',
  leads_total: 'Leads',
  entrada_total: 'Entradas',
  reuniao_agendada_total: 'Reuniões Agendadas',
  reuniao_realizada_total: 'Reuniões Realizadas',
  venda_total: 'Vendas',
  cpl: 'CPL',
  cac: 'CAC',
  taxa_entrada: 'Taxa de Entrada',
  taxa_venda_total: 'Taxa de Conversão',
  taxa_comparecimento: 'Taxa de Comparecimento',
  falta_total: 'Faltas',
  desmarque_total: 'Desmarques',
};

const formatValue = (value: number, key: string): string => {
  if (key.includes('taxa_')) {
    return `${((value || 0) * 100).toFixed(1)}%`;
  }
  if (key.includes('custo') || key === 'cpl' || key === 'cac') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  }
  return (value || 0).toLocaleString('pt-BR');
};

export default function DetailDrawer({
  open,
  onOpenChange,
  rowData,
  previousRowData,
  dateColumn = 'dia',
}: DetailDrawerProps) {
  if (!rowData) return null;

  const dateValue = rowData[dateColumn];
  const formattedDate = useMemo(() => {
    if (!dateValue) return 'Sem data';
    try {
      return format(parseISO(dateValue), "EEEE, dd 'de' MMMM", { locale: ptBR });
    } catch {
      return String(dateValue);
    }
  }, [dateValue]);

  // Calculate deltas
  const metrics = useMemo(() => {
    const result: Array<{
      key: string;
      label: string;
      value: number;
      delta: number | null;
      deltaPercent: number | null;
    }> = [];

    Object.entries(rowData).forEach(([key, value]) => {
      if (key === dateColumn || typeof value !== 'number') return;
      
      const prevValue = previousRowData?.[key];
      let delta = null;
      let deltaPercent = null;
      
      if (typeof prevValue === 'number' && prevValue !== 0) {
        delta = value - prevValue;
        deltaPercent = (delta / prevValue) * 100;
      }
      
      result.push({
        key,
        label: METRIC_LABELS[key] || key.replace(/_/g, ' '),
        value,
        delta,
        deltaPercent,
      });
    });

    return result;
  }, [rowData, previousRowData, dateColumn]);

  // Chart data for cost/leads
  const chartData = useMemo(() => {
    const data = [];
    
    if (rowData.custo_total !== undefined) {
      data.push({ name: 'Custo', value: rowData.custo_total, fill: 'hsl(var(--primary))' });
    }
    if (rowData.leads_total !== undefined) {
      data.push({ name: 'Leads', value: rowData.leads_total, fill: 'hsl(var(--accent))' });
    }
    if (rowData.entrada_total !== undefined) {
      data.push({ name: 'Entradas', value: rowData.entrada_total, fill: 'hsl(38, 92%, 50%)' });
    }
    if (rowData.venda_total !== undefined) {
      data.push({ name: 'Vendas', value: rowData.venda_total, fill: 'hsl(145, 65%, 40%)' });
    }
    
    return data;
  }, [rowData]);

  // Key metrics to show prominently
  const keyMetrics = metrics.filter(m => 
    ['custo_total', 'leads_total', 'cpl', 'cac', 'entrada_total', 'venda_total'].includes(m.key)
  );
  
  const otherMetrics = metrics.filter(m => 
    !['custo_total', 'leads_total', 'cpl', 'cac', 'entrada_total', 'venda_total'].includes(m.key)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {formattedDate}
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-3">
            {keyMetrics.map(metric => (
              <Card key={metric.key} className="overflow-hidden">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide truncate">
                    {metric.label}
                  </p>
                  <p className="text-xl font-bold mt-1 tabular-nums">
                    {formatValue(metric.value, metric.key)}
                  </p>
                  {metric.deltaPercent !== null && (
                    <div className={cn(
                      "flex items-center gap-1 text-xs mt-1",
                      metric.deltaPercent > 0 ? "text-success" :
                      metric.deltaPercent < 0 ? "text-destructive" :
                      "text-muted-foreground"
                    )}>
                      {metric.deltaPercent > 0 ? <TrendingUp className="h-3 w-3" /> : 
                       metric.deltaPercent < 0 ? <TrendingDown className="h-3 w-3" /> : 
                       <Minus className="h-3 w-3" />}
                      <span>{metric.deltaPercent > 0 ? '+' : ''}{metric.deltaPercent.toFixed(1)}% vs anterior</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Mini Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Resumo Visual</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        width={70} 
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string, props: any) => {
                          const key = props.payload.name.toLowerCase() + '_total';
                          return formatValue(value, key);
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Other Metrics */}
          {otherMetrics.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Outras Métricas</p>
              <div className="space-y-2">
                {otherMetrics.map(metric => (
                  <div 
                    key={metric.key}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                  >
                    <span className="text-sm text-muted-foreground">{metric.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        {formatValue(metric.value, metric.key)}
                      </span>
                      {metric.deltaPercent !== null && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs",
                            metric.deltaPercent > 0 ? "text-success border-success/30" :
                            metric.deltaPercent < 0 ? "text-destructive border-destructive/30" :
                            ""
                          )}
                        >
                          {metric.deltaPercent > 0 ? '+' : ''}{metric.deltaPercent.toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
