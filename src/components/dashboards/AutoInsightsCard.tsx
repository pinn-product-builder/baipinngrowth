import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Calendar, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface AutoInsight {
  id: string;
  dashboard_id: string;
  date: string;
  summary: string;
  highlights: Record<string, number | null>;
  alerts: Array<{ type: string; severity: string; message: string }>;
  dashboards?: { name: string };
}

export default function AutoInsightsCard() {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<AutoInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    fetchInsights();
  }, []);
  
  const fetchInsights = async () => {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const { data, error } = await supabase
        .from('ai_auto_insights')
        .select('*, dashboards(name)')
        .gte('date', yesterday.toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(5);
      
      if (!error && data) {
        setInsights(data as any);
      }
    } catch (err) {
      console.error('Error fetching auto-insights:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  if (insights.length === 0) {
    return null; // Don't show card if no insights
  }
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Insights Automáticos</CardTitle>
              <CardDescription className="text-xs">
                Resumos gerados pela AI
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            Hoje
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight) => (
          <div 
            key={insight.id}
            onClick={() => navigate(`/dashboards/${insight.dashboard_id}`)}
            className="p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {(insight.dashboards as any)?.name || 'Dashboard'}
              </span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{format(parseISO(insight.date), 'dd/MM', { locale: ptBR })}</span>
                <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
            
            {/* Summary preview */}
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {insight.summary.split('\n')[0]}
            </p>
            
            {/* Alerts badges */}
            {insight.alerts && insight.alerts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {insight.alerts.slice(0, 2).map((alert, i) => (
                  <Badge 
                    key={i} 
                    variant={alert.severity === 'high' ? 'destructive' : 'secondary'}
                    className="text-[10px] py-0"
                  >
                    <AlertTriangle className="h-2 w-2 mr-1" />
                    {alert.type.replace(/_/g, ' ')}
                  </Badge>
                ))}
                {insight.alerts.length > 2 && (
                  <Badge variant="outline" className="text-[10px] py-0">
                    +{insight.alerts.length - 2}
                  </Badge>
                )}
              </div>
            )}
            
            {/* Highlights */}
            {insight.highlights && (
              <div className="flex gap-3 mt-2 text-xs">
                {insight.highlights.custo_total !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Custo:</span>{' '}
                    <span className="font-medium">
                      R$ {Number(insight.highlights.custo_total).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
                {insight.highlights.leads_total !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Leads:</span>{' '}
                    <span className="font-medium">{insight.highlights.leads_total}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
