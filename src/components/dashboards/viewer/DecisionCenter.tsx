import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Lightbulb, 
  Target, 
  CheckCircle,
  XCircle,
  Activity,
  ChevronRight,
  Eye,
  EyeOff,
  BarChart3,
  AlertCircle,
  Zap
} from 'lucide-react';
import { generateInsights, Insight, DataQualityIssue, EngineResult } from '@/lib/insightsEngine';

interface DecisionCenterProps {
  data: Record<string, any>[];
  previousPeriodData?: Record<string, any>[];
  dateColumn?: string;
  onViewDetails?: () => void;
}

const priorityColors = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

const priorityLabels = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
};

const typeIcons = {
  problem: XCircle,
  opportunity: TrendingUp,
  action: Lightbulb,
  anomaly: Activity,
  bottleneck: AlertTriangle,
};

const typeLabels = {
  problem: 'Problema',
  opportunity: 'Oportunidade',
  action: 'Ação',
  anomaly: 'Anomalia',
  bottleneck: 'Gargalo',
};

function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss?: () => void }) {
  const Icon = typeIcons[insight.type];
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className={`p-2 rounded-lg ${
        insight.type === 'problem' || insight.type === 'bottleneck' 
          ? 'bg-red-500/10 text-red-500'
          : insight.type === 'opportunity'
          ? 'bg-green-500/10 text-green-500'
          : 'bg-primary/10 text-primary'
      }`}>
        <Icon className="h-5 w-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge className={`${priorityColors[insight.priority]} text-white text-xs`}>
            {priorityLabels[insight.priority]}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {typeLabels[insight.type]}
          </Badge>
        </div>
        
        <h4 className="font-medium text-sm">{insight.title}</h4>
        <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
        
        {insight.changePercent !== undefined && (
          <div className="flex items-center gap-2 mt-2">
            {insight.changePercent > 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            <span className={`text-sm font-medium ${
              insight.changePercent > 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {insight.changePercent > 0 ? '+' : ''}{insight.changePercent.toFixed(1)}%
            </span>
            {insight.currentValue !== undefined && insight.comparisonValue !== undefined && (
              <span className="text-xs text-muted-foreground">
                ({insight.comparisonValue.toLocaleString('pt-BR')} → {insight.currentValue.toLocaleString('pt-BR')})
              </span>
            )}
          </div>
        )}
        
        {insight.suggestedAction && (
          <div className="mt-3 p-2 rounded bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">💡 Sugestão:</p>
            <p className="text-sm">{insight.suggestedAction}</p>
          </div>
        )}
        
        {insight.impactEstimate && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {insight.impactEstimate}
          </p>
        )}
      </div>
    </div>
  );
}

function DataQualityCard({ issues, healthScore }: { issues: DataQualityIssue[]; healthScore: number }) {
  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Saúde dos Dados
          </CardTitle>
          <span className={`text-2xl font-bold ${getHealthColor(healthScore)}`}>
            {healthScore}%
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <Progress 
          value={healthScore} 
          className="h-2 mb-4"
        />
        
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Nenhum problema de qualidade detectado</span>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                {issue.severity === 'critical' ? (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">{issue.title}</p>
                  <p className="text-muted-foreground text-xs">{issue.description}</p>
                  {issue.affectedDates && issue.affectedDates.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Datas: {issue.affectedDates.slice(0, 3).join(', ')}
                      {issue.affectedDates.length > 3 && ` e mais ${issue.affectedDates.length - 3}...`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelAnalysisCard({ stages }: { stages: { key: string; label: string; value: number; conversionRate?: number; dropoff?: number }[] }) {
  if (stages.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Análise do Funil
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stages.map((stage, idx) => (
            <div key={stage.key} className="relative">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{stage.label}</span>
                <span className="text-muted-foreground">
                  {stage.value.toLocaleString('pt-BR')}
                </span>
              </div>
              
              <div className="h-6 bg-muted rounded overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    idx === 0 ? 'bg-primary' : 
                    (stage.conversionRate || 0) > 50 ? 'bg-primary/80' :
                    (stage.conversionRate || 0) > 30 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ 
                    width: `${idx === 0 ? 100 : Math.max(5, (stage.value / stages[0].value) * 100)}%` 
                  }}
                />
              </div>
              
              {stage.conversionRate !== undefined && (
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>Taxa: {stage.conversionRate.toFixed(1)}%</span>
                  {stage.dropoff !== undefined && stage.dropoff > 30 && (
                    <span className="text-red-500">↓ {stage.dropoff.toFixed(0)}% perdido</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DecisionCenter({ 
  data, 
  previousPeriodData, 
  dateColumn = 'dia',
  onViewDetails 
}: DecisionCenterProps) {
  const result = useMemo(() => {
    return generateInsights(data, previousPeriodData, dateColumn);
  }, [data, previousPeriodData, dateColumn]);

  const { insights, dataQuality, healthScore, funnelAnalysis } = result;

  const problems = insights.filter(i => i.type === 'problem' || i.type === 'bottleneck');
  const opportunities = insights.filter(i => i.type === 'opportunity');
  const actions = insights.filter(i => i.type === 'action');
  const anomalies = insights.filter(i => i.type === 'anomaly');

  if (insights.length === 0 && dataQuality.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
          <h3 className="font-medium text-lg">Tudo certo!</h3>
          <p className="text-muted-foreground text-center max-w-md mt-1">
            Nenhum problema ou anomalia detectado nos seus dados. 
            Continue monitorando para identificar oportunidades.
          </p>
          {onViewDetails && (
            <Button variant="outline" className="mt-4" onClick={onViewDetails}>
              Ver dados detalhados
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className={problems.length > 0 ? 'border-red-500/50' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{problems.length}</p>
              <p className="text-xs text-muted-foreground">Problemas</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className={opportunities.length > 0 ? 'border-green-500/50' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{opportunities.length}</p>
              <p className="text-xs text-muted-foreground">Oportunidades</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{actions.length}</p>
              <p className="text-xs text-muted-foreground">Ações sugeridas</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Activity className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{anomalies.length}</p>
              <p className="text-xs text-muted-foreground">Anomalias</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Insights Column */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue={problems.length > 0 ? 'problems' : 'opportunities'}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="problems" className="relative">
                Problemas
                {problems.length > 0 && (
                  <Badge className="ml-1 h-5 w-5 p-0 justify-center bg-red-500">{problems.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="opportunities">
                Oportunidades
                {opportunities.length > 0 && (
                  <Badge className="ml-1 h-5 w-5 p-0 justify-center bg-green-500">{opportunities.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="actions">Ações</TabsTrigger>
              <TabsTrigger value="anomalies">Anomalias</TabsTrigger>
            </TabsList>
            
            <TabsContent value="problems" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {problems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                    <p>Nenhum problema detectado</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {problems.map(insight => (
                      <InsightCard key={insight.id} insight={insight} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="opportunities" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {opportunities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <TrendingUp className="h-8 w-8 mb-2" />
                    <p>Nenhuma oportunidade identificada ainda</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {opportunities.map(insight => (
                      <InsightCard key={insight.id} insight={insight} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="actions" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {actions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <Lightbulb className="h-8 w-8 mb-2" />
                    <p>Nenhuma ação sugerida no momento</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actions.map(insight => (
                      <InsightCard key={insight.id} insight={insight} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="anomalies" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {anomalies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <Activity className="h-8 w-8 mb-2" />
                    <p>Nenhuma anomalia detectada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {anomalies.map(insight => (
                      <InsightCard key={insight.id} insight={insight} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Side Column */}
        <div className="space-y-4">
          <DataQualityCard issues={dataQuality} healthScore={healthScore} />
          
          {funnelAnalysis && funnelAnalysis.length > 1 && (
            <FunnelAnalysisCard stages={funnelAnalysis} />
          )}
          
          {onViewDetails && (
            <Button variant="outline" className="w-full" onClick={onViewDetails}>
              <Eye className="h-4 w-4 mr-2" />
              Ver dados detalhados
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
