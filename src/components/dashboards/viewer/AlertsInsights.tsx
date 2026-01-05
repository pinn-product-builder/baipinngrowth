import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, TrendingUp, Lightbulb, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Goal {
  metric: string;
  operator: '<=' | '>=' | '==' | '<' | '>';
  value: number;
  label?: string;
}

interface AlertsInsightsProps {
  data: Record<string, number>;
  previousData?: Record<string, number>;
  goals?: Goal[];
  className?: string;
}

interface Alert {
  type: 'warning' | 'error' | 'success';
  message: string;
  metric: string;
}

interface Insight {
  message: string;
  type: 'positive' | 'negative' | 'neutral';
}

const METRIC_LABELS: Record<string, string> = {
  cpl: 'CPL',
  cac: 'CAC',
  custo_total: 'Custo Total',
  leads_total: 'Leads',
  entrada_total: 'Entradas',
  venda_total: 'Vendas',
  taxa_entrada: 'Taxa de Entrada',
  taxa_venda_total: 'Taxa de Conversão',
  taxa_comparecimento: 'Taxa de Comparecimento',
};

const formatValue = (value: number, metric: string): string => {
  if (metric.includes('taxa_')) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (metric.includes('custo') || metric === 'cpl' || metric === 'cac') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
  return value.toLocaleString('pt-BR');
};

export default function AlertsInsights({
  data,
  previousData,
  goals = [],
  className,
}: AlertsInsightsProps) {
  // Generate alerts based on goals
  const alerts = useMemo(() => {
    const result: Alert[] = [];
    
    goals.forEach(goal => {
      const value = data[goal.metric];
      if (value === undefined) return;
      
      let violated = false;
      switch (goal.operator) {
        case '<=':
          violated = value > goal.value;
          break;
        case '>=':
          violated = value < goal.value;
          break;
        case '<':
          violated = value >= goal.value;
          break;
        case '>':
          violated = value <= goal.value;
          break;
        case '==':
          violated = value !== goal.value;
          break;
      }
      
      const label = goal.label || METRIC_LABELS[goal.metric] || goal.metric;
      
      if (violated) {
        result.push({
          type: 'warning',
          message: `${label} está ${goal.operator === '<=' || goal.operator === '<' ? 'acima' : 'abaixo'} da meta (${formatValue(value, goal.metric)} vs ${formatValue(goal.value, goal.metric)})`,
          metric: goal.metric,
        });
      } else {
        result.push({
          type: 'success',
          message: `${label} dentro da meta (${formatValue(value, goal.metric)})`,
          metric: goal.metric,
        });
      }
    });
    
    return result;
  }, [data, goals]);

  // Generate deterministic insights based on data comparison
  const insights = useMemo(() => {
    const result: Insight[] = [];
    
    if (!previousData || Object.keys(previousData).length === 0) {
      return result;
    }
    
    // Cost vs Leads analysis
    const costChange = previousData.custo_total 
      ? ((data.custo_total - previousData.custo_total) / previousData.custo_total) * 100 
      : null;
    const leadsChange = previousData.leads_total 
      ? ((data.leads_total - previousData.leads_total) / previousData.leads_total) * 100 
      : null;
    
    if (costChange !== null && leadsChange !== null) {
      if (costChange > 10 && leadsChange < -10) {
        result.push({
          message: `Custo aumentou ${costChange.toFixed(0)}% mas leads caíram ${Math.abs(leadsChange).toFixed(0)}%. Revisar campanhas urgentemente.`,
          type: 'negative',
        });
      } else if (costChange < -10 && leadsChange > 10) {
        result.push({
          message: `Excelente: custo reduziu ${Math.abs(costChange).toFixed(0)}% e leads aumentaram ${leadsChange.toFixed(0)}%. Manter estratégia atual.`,
          type: 'positive',
        });
      } else if (costChange > 20 && leadsChange > 0 && leadsChange < costChange * 0.5) {
        result.push({
          message: `Custo cresceu ${costChange.toFixed(0)}% mas leads só ${leadsChange.toFixed(0)}%. CPL está subindo.`,
          type: 'negative',
        });
      }
    }
    
    // CPL/CAC analysis
    const cplChange = previousData.cpl 
      ? ((data.cpl - previousData.cpl) / previousData.cpl) * 100 
      : null;
    const cacChange = previousData.cac 
      ? ((data.cac - previousData.cac) / previousData.cac) * 100 
      : null;
    
    if (cplChange !== null && cplChange > 15) {
      result.push({
        message: `CPL subiu ${cplChange.toFixed(0)}% vs período anterior. Verificar qualidade dos anúncios.`,
        type: 'negative',
      });
    } else if (cplChange !== null && cplChange < -15) {
      result.push({
        message: `CPL caiu ${Math.abs(cplChange).toFixed(0)}%. Eficiência de aquisição melhorou.`,
        type: 'positive',
      });
    }
    
    if (cacChange !== null && cacChange > 20) {
      result.push({
        message: `CAC subiu ${cacChange.toFixed(0)}%. Custo por venda está aumentando.`,
        type: 'negative',
      });
    }
    
    // Conversion rate analysis
    const taxaEntradaChange = previousData.taxa_entrada 
      ? ((data.taxa_entrada - previousData.taxa_entrada) / previousData.taxa_entrada) * 100 
      : null;
    const taxaVendaChange = previousData.taxa_venda_total 
      ? ((data.taxa_venda_total - previousData.taxa_venda_total) / previousData.taxa_venda_total) * 100 
      : null;
    
    if (taxaEntradaChange !== null && taxaEntradaChange < -20) {
      result.push({
        message: `Taxa de entrada caiu ${Math.abs(taxaEntradaChange).toFixed(0)}%. Revisar qualificação de leads.`,
        type: 'negative',
      });
    }
    
    if (taxaVendaChange !== null && taxaVendaChange > 15) {
      result.push({
        message: `Taxa de conversão total melhorou ${taxaVendaChange.toFixed(0)}%. Time comercial performando bem.`,
        type: 'positive',
      });
    }
    
    // Limit to 4 insights
    return result.slice(0, 4);
  }, [data, previousData]);

  const warningAlerts = alerts.filter(a => a.type === 'warning');
  const successAlerts = alerts.filter(a => a.type === 'success');

  if (alerts.length === 0 && insights.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
      {/* Alerts Card */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Status das Metas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {warningAlerts.map((alert, i) => (
              <div 
                key={i} 
                className="flex items-start gap-3 p-3 rounded-lg bg-warning/5 border border-warning/10"
              >
                <XCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <p className="text-sm">{alert.message}</p>
              </div>
            ))}
            {successAlerts.map((alert, i) => (
              <div 
                key={i} 
                className="flex items-start gap-3 p-3 rounded-lg bg-success/5 border border-success/10"
              >
                <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <p className="text-sm">{alert.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      
      {/* Insights Card */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-accent" />
              Insights do Período
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.map((insight, i) => (
              <div 
                key={i} 
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  insight.type === 'positive' && "bg-success/5 border-success/10",
                  insight.type === 'negative' && "bg-destructive/5 border-destructive/10",
                  insight.type === 'neutral' && "bg-muted/50 border-border"
                )}
              >
                {insight.type === 'positive' ? (
                  <TrendingUp className="h-4 w-4 text-success shrink-0 mt-0.5" />
                ) : insight.type === 'negative' ? (
                  <TrendingDown className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <p className="text-sm">{insight.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
