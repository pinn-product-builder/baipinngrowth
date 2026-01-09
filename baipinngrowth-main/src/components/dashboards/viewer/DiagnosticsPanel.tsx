import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle, 
  Database, 
  TrendingUp,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatColumnValue, getColumnLabel } from './labelMap';

interface DiagnosticAlert {
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  metric?: string;
  value?: number;
}

interface DiagnosticsPanelProps {
  data: Record<string, any>[];
  aggregatedData: Record<string, number>;
  goals?: Record<string, number>;
  className?: string;
}

export default function DiagnosticsPanel({
  data,
  aggregatedData,
  goals = {},
  className,
}: DiagnosticsPanelProps) {
  // Analyze data for issues
  const diagnostics = useMemo(() => {
    const alerts: DiagnosticAlert[] = [];
    
    // Helper to get date from row (supports both 'dia' and 'day')
    const getRowDate = (row: Record<string, any>): Date | null => {
      const dateVal = row.dia || row.day;
      if (!dateVal) return null;
      if (dateVal instanceof Date) return dateVal;
      try {
        return parseISO(dateVal);
      } catch {
        return null;
      }
    };
    
    // Check for days with cost but no leads (supports both schemas)
    const costNoLeads = data.filter(row => {
      const cost = row.custo_total ?? row.spend ?? 0;
      const leads = row.leads_total ?? row.leads_new ?? 0;
      return cost > 0 && leads === 0;
    });
    if (costNoLeads.length > 0) {
      const totalCost = costNoLeads.reduce((sum, r) => 
        sum + (r.custo_total ?? r.spend ?? 0), 0
      );
      alerts.push({
        type: 'critical',
        title: 'Dias com custo sem leads',
        description: `${costNoLeads.length} dia(s) com investimento mas nenhum lead gerado. Verifique a integração de dados ou a campanha.`,
        metric: 'custo_total',
        value: totalCost,
      });
    }
    
    // Check for CPL spikes (>2x average)
    const avgCPL = aggregatedData.cpl;
    if (avgCPL) {
      const cplSpikes = data.filter(row => 
        row.cpl && row.cpl > avgCPL * 2
      );
      if (cplSpikes.length > 0) {
        alerts.push({
          type: 'warning',
          title: 'Picos de CPL detectados',
          description: `${cplSpikes.length} dia(s) com CPL mais de 2x acima da média. Analise as campanhas nesses dias.`,
          metric: 'cpl',
        });
      }
    }
    
    // Check for CAC spikes
    const avgCAC = aggregatedData.cac;
    if (avgCAC) {
      const cacSpikes = data.filter(row => 
        row.cac && row.cac > avgCAC * 2
      );
      if (cacSpikes.length > 0) {
        alerts.push({
          type: 'warning',
          title: 'Picos de CAC detectados',
          description: `${cacSpikes.length} dia(s) com CAC mais de 2x acima da média.`,
          metric: 'cac',
        });
      }
    }
    
    // Check for date gaps - with safe date parsing
    if (data.length > 1) {
      const datesWithRows = data
        .map(row => ({ row, date: getRowDate(row) }))
        .filter(item => item.date !== null) as Array<{ row: any; date: Date }>;
      
      if (datesWithRows.length > 1) {
        const sortedData = datesWithRows.sort((a, b) => 
          a.date.getTime() - b.date.getTime()
        );
        
        let gaps = 0;
        for (let i = 1; i < sortedData.length; i++) {
          const diff = differenceInDays(sortedData[i].date, sortedData[i-1].date);
          if (diff > 1) gaps++;
        }
        
        if (gaps > 0) {
          alerts.push({
            type: 'info',
            title: 'Lacunas de data',
            description: `${gaps} lacuna(s) encontrada(s) nos dados. Alguns dias podem estar sem informação.`,
          });
        }
      }
    }
    
    // Check goal compliance
    if (goals.cpl && aggregatedData.cpl && aggregatedData.cpl > goals.cpl) {
      alerts.push({
        type: 'warning',
        title: 'CPL acima da meta',
        description: `CPL atual (${formatColumnValue(aggregatedData.cpl, 'cpl')}) está ${((aggregatedData.cpl / goals.cpl - 1) * 100).toFixed(0)}% acima da meta (${formatColumnValue(goals.cpl, 'cpl')}).`,
        metric: 'cpl',
        value: aggregatedData.cpl,
      });
    }
    
    if (goals.cac && aggregatedData.cac && aggregatedData.cac > goals.cac) {
      alerts.push({
        type: 'warning',
        title: 'CAC acima da meta',
        description: `CAC atual (${formatColumnValue(aggregatedData.cac, 'cac')}) está ${((aggregatedData.cac / goals.cac - 1) * 100).toFixed(0)}% acima da meta (${formatColumnValue(goals.cac, 'cac')}).`,
        metric: 'cac',
        value: aggregatedData.cac,
      });
    }
    
    // Data quality check - supports both schemas
    const totalRows = data.length;
    const rowsWithAllData = data.filter(row => {
      const hasCost = (row.custo_total ?? row.spend) !== undefined;
      const hasLeads = (row.leads_total ?? row.leads_new) !== undefined;
      return hasCost && hasLeads;
    }).length;
    
    const dataQuality = totalRows > 0 ? (rowsWithAllData / totalRows) * 100 : 0;
    if (dataQuality < 100) {
      alerts.push({
        type: dataQuality < 80 ? 'warning' : 'info',
        title: 'Qualidade dos dados',
        description: `${dataQuality.toFixed(0)}% das linhas possuem dados completos de custo e leads.`,
      });
    }
    
    return alerts;
  }, [data, aggregatedData, goals]);
  
  // Summary stats
  const summary = useMemo(() => {
    const critical = diagnostics.filter(d => d.type === 'critical').length;
    const warning = diagnostics.filter(d => d.type === 'warning').length;
    const info = diagnostics.filter(d => d.type === 'info').length;
    return { critical, warning, info, total: diagnostics.length };
  }, [diagnostics]);
  
  const getIcon = (type: string) => {
    switch (type) {
      case 'critical': return AlertCircle;
      case 'warning': return AlertTriangle;
      default: return CheckCircle;
    }
  };
  
  const getColors = (type: string) => {
    switch (type) {
      case 'critical': return {
        bg: 'bg-destructive/5',
        border: 'border-destructive/20',
        icon: 'text-destructive',
      };
      case 'warning': return {
        bg: 'bg-warning/5',
        border: 'border-warning/20',
        icon: 'text-warning',
      };
      default: return {
        bg: 'bg-muted/50',
        border: 'border-border',
        icon: 'text-muted-foreground',
      };
    }
  };
  
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Diagnóstico & Alertas
          </CardTitle>
          <div className="flex items-center gap-2">
            {summary.critical > 0 && (
              <Badge variant="destructive" className="text-xs">
                {summary.critical} crítico{summary.critical > 1 ? 's' : ''}
              </Badge>
            )}
            {summary.warning > 0 && (
              <Badge variant="outline" className="text-xs border-warning/30 text-warning">
                {summary.warning} aviso{summary.warning > 1 ? 's' : ''}
              </Badge>
            )}
            {summary.total === 0 && (
              <Badge variant="outline" className="text-xs border-success/30 text-success">
                <CheckCircle className="h-3 w-3 mr-1" />
                Tudo OK
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {diagnostics.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-success/5 border border-success/20">
            <CheckCircle className="h-5 w-5 text-success" />
            <div>
              <p className="font-medium text-success">Nenhum problema detectado</p>
              <p className="text-sm text-muted-foreground">
                Os dados parecem consistentes e dentro dos parâmetros esperados.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {diagnostics.map((alert, index) => {
              const Icon = getIcon(alert.type);
              const colors = getColors(alert.type);
              
              return (
                <div 
                  key={index}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border",
                    colors.bg,
                    colors.border
                  )}
                >
                  <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", colors.icon)} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {alert.description}
                    </p>
                    {alert.value !== undefined && alert.metric && (
                      <p className="text-sm font-medium mt-1">
                        Total: {formatColumnValue(alert.value, alert.metric)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
