import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface InsightsPanelProps {
  data: any[];
  previousPeriodData?: any[];
  dashboardId: string;
}

interface Insight {
  type: 'positive' | 'negative' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation?: string;
}

export default function InsightsPanel({ data, previousPeriodData, dashboardId }: InsightsPanelProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateInsights = async () => {
    if (data.length === 0) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Não autenticado');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-insights`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentData: data,
          previousData: previousPeriodData || [],
          dashboardId,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Limite de requisições atingido. Tente novamente em alguns minutos.');
        }
        throw new Error(`Erro ${res.status}`);
      }

      const result = await res.json();
      setInsights(result.insights || []);
    } catch (err: any) {
      console.error('Error generating insights:', err);
      setError(err.message || 'Erro ao gerar insights');
      // Fallback to local insights
      setInsights(generateLocalInsights(data, previousPeriodData));
    } finally {
      setIsLoading(false);
    }
  };

  // Local fallback insights when AI is not available
  const generateLocalInsights = (currentData: any[], prevData?: any[]): Insight[] => {
    const results: Insight[] = [];
    if (currentData.length === 0) return results;

    // Aggregate current period
    const current = currentData.reduce((acc, row) => {
      Object.keys(row).forEach(key => {
        if (typeof row[key] === 'number') {
          acc[key] = (acc[key] || 0) + row[key];
        }
      });
      return acc;
    }, {} as Record<string, number>);

    // Calculate CPL and CAC
    if (current.custo_total && current.leads_total) {
      current.cpl = current.custo_total / current.leads_total;
    }
    if (current.custo_total && current.venda_total) {
      current.cac = current.custo_total / current.venda_total;
    }

    // Aggregate previous period
    let prev: Record<string, number> = {};
    if (prevData && prevData.length > 0) {
      prev = prevData.reduce((acc, row) => {
        Object.keys(row).forEach(key => {
          if (typeof row[key] === 'number') {
            acc[key] = (acc[key] || 0) + row[key];
          }
        });
        return acc;
      }, {} as Record<string, number>);

      if (prev.custo_total && prev.leads_total) {
        prev.cpl = prev.custo_total / prev.leads_total;
      }
      if (prev.custo_total && prev.venda_total) {
        prev.cac = prev.custo_total / prev.venda_total;
      }
    }

    // Generate insights based on data
    if (prev.cpl && current.cpl) {
      const cplChange = ((current.cpl - prev.cpl) / prev.cpl) * 100;
      if (Math.abs(cplChange) > 10) {
        results.push({
          type: cplChange > 0 ? 'negative' : 'positive',
          title: `CPL ${cplChange > 0 ? 'aumentou' : 'reduziu'} ${Math.abs(cplChange).toFixed(1)}%`,
          description: cplChange > 0 
            ? 'O custo por lead está mais alto que no período anterior.'
            : 'O custo por lead está mais baixo que no período anterior.',
          recommendation: cplChange > 0 
            ? 'Revisar segmentação de anúncios e qualidade dos criativos.'
            : 'Continue com a estratégia atual, está funcionando bem.'
        });
      }
    }

    if (prev.cac && current.cac) {
      const cacChange = ((current.cac - prev.cac) / prev.cac) * 100;
      if (Math.abs(cacChange) > 15) {
        results.push({
          type: cacChange > 0 ? 'warning' : 'positive',
          title: `CAC ${cacChange > 0 ? 'subiu' : 'caiu'} ${Math.abs(cacChange).toFixed(1)}%`,
          description: cacChange > 0 
            ? 'O custo de aquisição de clientes aumentou significativamente.'
            : 'O custo de aquisição de clientes está mais eficiente.',
          recommendation: cacChange > 0 
            ? 'Analisar taxas de conversão em cada etapa do funil.'
            : 'Otimização do funil está trazendo resultados.'
        });
      }
    }

    // Conversion rate analysis
    if (current.leads_total && current.venda_total && prev.leads_total && prev.venda_total) {
      const currentRate = current.venda_total / current.leads_total;
      const prevRate = prev.venda_total / prev.leads_total;
      const rateChange = ((currentRate - prevRate) / prevRate) * 100;

      if (Math.abs(rateChange) > 10) {
        results.push({
          type: rateChange > 0 ? 'positive' : 'negative',
          title: `Taxa de conversão ${rateChange > 0 ? 'melhorou' : 'piorou'} ${Math.abs(rateChange).toFixed(1)}%`,
          description: `A taxa de conversão de leads para vendas ${rateChange > 0 ? 'aumentou' : 'diminuiu'}.`,
          recommendation: rateChange < 0 
            ? 'Verificar qualidade dos leads e processo de vendas.'
            : undefined
        });
      }
    }

    // No-show analysis
    if (current.falta_total && current.reuniao_agendada_total) {
      const noShowRate = current.falta_total / current.reuniao_agendada_total;
      if (noShowRate > 0.2) {
        results.push({
          type: 'warning',
          title: `Taxa de faltas alta: ${(noShowRate * 100).toFixed(1)}%`,
          description: 'Muitos leads não comparecem às reuniões agendadas.',
          recommendation: 'Implementar lembretes automáticos e confirmação de presença.'
        });
      }
    }

    if (results.length === 0) {
      results.push({
        type: 'info',
        title: 'Métricas estáveis',
        description: 'Não foram detectadas variações significativas no período.',
      });
    }

    return results;
  };

  useEffect(() => {
    if (data.length > 0) {
      generateInsights();
    }
  }, [data, previousPeriodData, dashboardId]);

  const getInsightIcon = (type: Insight['type']) => {
    switch (type) {
      case 'positive': return <TrendingUp className="h-4 w-4" />;
      case 'negative': return <TrendingDown className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const getInsightColor = (type: Insight['type']) => {
    switch (type) {
      case 'positive': return 'bg-success/10 text-success border-success/20';
      case 'negative': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'warning': return 'bg-warning/10 text-warning border-warning/20';
      default: return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Insights & Recomendações
        </CardTitle>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={generateInsights}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && insights.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Analisando dados...
          </div>
        ) : error && insights.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "p-3 rounded-lg border transition-all hover:shadow-sm",
                  getInsightColor(insight.type)
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {getInsightIcon(insight.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{insight.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                    {insight.recommendation && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs font-normal">
                          💡 {insight.recommendation}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
