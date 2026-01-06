import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  CheckCircle,
  Info,
  Calendar,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMetricValue } from './labelMaps';

interface Alert {
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  evidence?: Record<string, any>;
}

interface AlertsPanelProps {
  data: any[];
  aggregatedData: Record<string, number>;
  className?: string;
}

const SEVERITY_CONFIG = {
  high: {
    icon: AlertCircle,
    className: 'border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    iconClass: 'text-red-500',
  },
  medium: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    iconClass: 'text-amber-500',
  },
  low: {
    icon: Info,
    className: 'border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    iconClass: 'text-blue-500',
  },
};

export default function AlertsPanel({
  data,
  aggregatedData,
  className,
}: AlertsPanelProps) {
  const alerts = useMemo<Alert[]>(() => {
    const result: Alert[] = [];
    
    if (data.length < 2) return result;
    
    // Sort by date
    const sortedData = [...data].sort((a, b) => {
      const dateA = a.dia || a.date || '';
      const dateB = b.dia || b.date || '';
      return String(dateA).localeCompare(String(dateB));
    });
    
    const halfIndex = Math.floor(sortedData.length / 2);
    const firstHalf = sortedData.slice(0, halfIndex);
    const secondHalf = sortedData.slice(halfIndex);
    
    const sum = (arr: any[], key: string) => arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    const avg = (arr: any[], key: string) => {
      const values = arr.map(r => Number(r[key])).filter(v => isFinite(v));
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    };
    
    // 1. Cost up + leads down
    const firstCost = sum(firstHalf, 'custo_total');
    const secondCost = sum(secondHalf, 'custo_total');
    const firstLeads = sum(firstHalf, 'leads_total');
    const secondLeads = sum(secondHalf, 'leads_total');
    
    if (firstCost > 0 && secondCost > firstCost * 1.1 && secondLeads < firstLeads * 0.9) {
      const costDelta = ((secondCost - firstCost) / firstCost * 100);
      const leadsDelta = ((secondLeads - firstLeads) / firstLeads * 100);
      result.push({
        type: 'cost_up_leads_down',
        severity: 'high',
        title: 'Custo subindo, leads caindo',
        message: `Custo aumentou ${costDelta.toFixed(1)}% enquanto leads caíram ${Math.abs(leadsDelta).toFixed(1)}% na segunda metade do período.`,
        evidence: { costDelta, leadsDelta },
      });
    }
    
    // 2. CAC spike
    const firstCAC = avg(firstHalf, 'cac');
    const secondCAC = avg(secondHalf, 'cac');
    if (firstCAC > 0 && secondCAC > firstCAC * 1.3) {
      result.push({
        type: 'cac_spike',
        severity: 'medium',
        title: 'CAC em alta',
        message: `CAC médio aumentou ${((secondCAC - firstCAC) / firstCAC * 100).toFixed(1)}% na segunda metade do período.`,
        evidence: { firstCAC, secondCAC },
      });
    }
    
    // 3. CPL spike
    const firstCPL = avg(firstHalf, 'cpl');
    const secondCPL = avg(secondHalf, 'cpl');
    if (firstCPL > 0 && secondCPL > firstCPL * 1.3) {
      result.push({
        type: 'cpl_spike',
        severity: 'medium',
        title: 'CPL em alta',
        message: `CPL médio aumentou ${((secondCPL - firstCPL) / firstCPL * 100).toFixed(1)}% na segunda metade do período.`,
        evidence: { firstCPL, secondCPL },
      });
    }
    
    // 4. Zero leads with cost (tracking issue)
    const zeroLeadDays = data.filter(r => 
      (Number(r.leads_total) || 0) === 0 && 
      (Number(r.custo_total) || 0) > 0
    );
    if (zeroLeadDays.length > 0) {
      result.push({
        type: 'tracking_suspect',
        severity: zeroLeadDays.length > 3 ? 'high' : 'medium',
        title: 'Possível problema de tracking',
        message: `${zeroLeadDays.length} dia(s) com investimento mas zero leads registrados. Verifique a integração.`,
        evidence: { days: zeroLeadDays.slice(0, 5).map(d => d.dia) },
      });
    }
    
    // 5. Conversion drop
    const firstTaxa = avg(firstHalf, 'taxa_entrada');
    const secondTaxa = avg(secondHalf, 'taxa_entrada');
    if (firstTaxa > 0 && secondTaxa < firstTaxa * 0.7) {
      result.push({
        type: 'conversion_drop',
        severity: 'high',
        title: 'Queda na taxa de entrada',
        message: `Taxa de entrada caiu ${((firstTaxa - secondTaxa) / firstTaxa * 100).toFixed(1)}% na segunda metade do período.`,
        evidence: { firstTaxa, secondTaxa },
      });
    }
    
    // 6. Date gaps
    const dates = sortedData.map(r => r.dia).filter(Boolean);
    let gapCount = 0;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 1) gapCount += diffDays - 1;
    }
    if (gapCount > 0) {
      result.push({
        type: 'date_gaps',
        severity: 'low',
        title: 'Lacunas no período',
        message: `${gapCount} dia(s) sem dados no período selecionado. Isso pode afetar a análise.`,
        evidence: { gapCount },
      });
    }
    
    return result;
  }, [data]);

  // Check data quality
  const dataQuality = useMemo(() => {
    const totalRows = data.length;
    if (totalRows === 0) return null;
    
    const issues: string[] = [];
    
    // Check for nulls in key columns
    const keyColumns = ['custo_total', 'leads_total', 'cpl'];
    keyColumns.forEach(col => {
      const nullCount = data.filter(r => r[col] === null || r[col] === undefined).length;
      if (nullCount > totalRows * 0.1) {
        issues.push(`${col}: ${nullCount} valores vazios`);
      }
    });
    
    // Check for zeros
    const zeroLeadRows = data.filter(r => (Number(r.leads_total) || 0) === 0).length;
    if (zeroLeadRows > totalRows * 0.3) {
      issues.push(`${zeroLeadRows} dias com zero leads`);
    }
    
    return {
      score: Math.max(0, 100 - issues.length * 15),
      issues,
    };
  }, [data]);

  if (alerts.length === 0 && (!dataQuality || dataQuality.issues.length === 0)) {
    return (
      <Card className={cn("border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900", className)}>
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-300">Nenhum alerta detectado</p>
              <p className="text-sm text-green-600 dark:text-green-400">Os dados do período estão dentro do esperado.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            Sinais e Alertas
            {alerts.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>
          {dataQuality && (
            <Badge 
              variant="outline" 
              className={cn(
                "gap-1",
                dataQuality.score >= 80 ? "text-green-600 border-green-300" :
                dataQuality.score >= 50 ? "text-amber-600 border-amber-300" :
                "text-red-600 border-red-300"
              )}
            >
              Qualidade: {dataQuality.score}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert, index) => {
          const config = SEVERITY_CONFIG[alert.severity];
          const Icon = config.icon;
          
          return (
            <div 
              key={index}
              className={cn(
                "rounded-lg border p-4",
                config.className
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", config.iconClass)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{alert.title}</span>
                    <Badge className={cn("text-xs", config.badgeClass)}>
                      {alert.severity === 'high' ? 'Alto' : 
                       alert.severity === 'medium' ? 'Médio' : 'Baixo'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </div>
              </div>
            </div>
          );
        })}
        
        {dataQuality && dataQuality.issues.length > 0 && (
          <div className="rounded-lg border border-muted bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <span className="font-medium text-sm">Qualidade dos dados</span>
                <ul className="mt-1 text-sm text-muted-foreground list-disc list-inside">
                  {dataQuality.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
