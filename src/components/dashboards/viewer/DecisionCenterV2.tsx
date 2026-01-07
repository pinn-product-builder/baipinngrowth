/**
 * DecisionCenter V2 - Refactored with data integrity validation
 * Uses DashboardDataContext as single source of truth
 * Includes calculation traces for transparency
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  ChevronDown,
  Eye,
  BarChart3,
  AlertCircle,
  Zap,
  Calculator,
  FileText,
  Shield,
  Bug
} from 'lucide-react';
import { format } from 'date-fns';

import { useDashboardDataOptional } from '@/contexts/DashboardDataContext';
import { validateDataIntegrity, ValidationResult, formatValidationForLog } from '@/lib/dataIntegrityValidator';
import { runInsightRules, RuleResult, ruleResultToTrace } from '@/lib/insightRules';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ================== TYPES ==================

interface DecisionCenterProps {
  data: Record<string, any>[];
  previousPeriodData?: Record<string, any>[];
  dateColumn?: string;
  onViewDetails?: () => void;
  debugMode?: boolean;
}

// ================== CONSTANTS ==================

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

// ================== COMPONENTS ==================

/**
 * Calculation disclosure for "Ver cálculo" feature
 */
function CalculationDisclosure({ 
  calculation, 
  dateRange, 
  source 
}: { 
  calculation: RuleResult['calculation'];
  dateRange: string;
  source: string;
}) {
  const [open, setOpen] = useState(false);
  
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
          <Calculator className="h-3 w-3 mr-1" />
          Ver cálculo
          <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="text-xs bg-muted/50 rounded-lg p-3 space-y-2 border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span className="font-mono">{source}</span>
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span>{dateRange}</span>
          </div>
          
          <div className="pt-2 border-t">
            <p className="font-medium mb-1">Fórmula:</p>
            <code className="text-primary bg-primary/10 px-2 py-1 rounded text-xs">
              {calculation.formula}
            </code>
          </div>
          
          <div className="pt-2">
            <p className="font-medium mb-1">Valores de entrada:</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(calculation.inputs).map(([key, value]) => (
                <div key={key} className="flex justify-between font-mono">
                  <span className="text-muted-foreground">{key}:</span>
                  <span>{typeof value === 'number' ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : value}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="pt-2 border-t">
            <p className="font-medium mb-1">Resultado:</p>
            <span className="font-mono text-primary font-semibold">
              {calculation.unit === 'currency' 
                ? `R$ ${calculation.output.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : calculation.unit === 'percent' || calculation.unit === 'rate'
                ? `${calculation.output.toFixed(1)}%`
                : calculation.output.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Insight card with calculation disclosure
 */
function InsightCard({ 
  insight, 
  dateRange,
  source,
  onDismiss 
}: { 
  insight: RuleResult; 
  dateRange: string;
  source: string;
  onDismiss?: () => void;
}) {
  const Icon = typeIcons[insight.type];

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-start gap-3">
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
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className={`${priorityColors[insight.priority]} text-white text-xs`}>
              {priorityLabels[insight.priority]}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {typeLabels[insight.type]}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {insight.confidence === 'high' ? '✓ Alta confiança' : insight.confidence === 'medium' ? '~ Média' : '? Baixa'}
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
              {insight.previousValue !== undefined && insight.currentValue !== undefined && (
                <span className="text-xs text-muted-foreground">
                  ({insight.previousValue.toLocaleString('pt-BR')} → {insight.currentValue.toLocaleString('pt-BR')})
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
        </div>
      </div>
      
      {/* Calculation disclosure */}
      <div className="border-t pt-2 mt-1">
        <CalculationDisclosure 
          calculation={insight.calculation}
          dateRange={dateRange}
          source={source}
        />
      </div>
    </div>
  );
}

/**
 * Data validation status banner
 */
function ValidationBanner({ 
  validation, 
  onViewDetails 
}: { 
  validation: ValidationResult;
  onViewDetails?: () => void;
}) {
  if (validation.isValid && validation.warnings.length === 0) {
    return (
      <Alert className="border-green-500/50 bg-green-500/5">
        <Shield className="h-4 w-4 text-green-500" />
        <AlertTitle className="text-green-600">Dados validados</AlertTitle>
        <AlertDescription className="text-green-600/80">
          {validation.checksPerformed.length} verificações passaram. Os insights são confiáveis.
        </AlertDescription>
      </Alert>
    );
  }
  
  if (!validation.isValid) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Dados inconsistentes — insights desativados</AlertTitle>
        <AlertDescription>
          <p className="mb-2">{validation.summary}</p>
          <ul className="list-disc list-inside text-xs space-y-1">
            {validation.errors.slice(0, 3).map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
          {onViewDetails && (
            <Button variant="outline" size="sm" className="mt-2" onClick={onViewDetails}>
              Ver detalhes
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  
  // Has warnings but valid
  return (
    <Alert className="border-yellow-500/50 bg-yellow-500/5">
      <AlertCircle className="h-4 w-4 text-yellow-500" />
      <AlertTitle className="text-yellow-600">Dados validados com ressalvas</AlertTitle>
      <AlertDescription className="text-yellow-600/80">
        {validation.warnings.length} aviso(s): {validation.warnings.map(w => w.message).join('; ')}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Debug panel for admins
 */
function DebugPanel({ 
  data, 
  aggregated, 
  validation,
  insights,
  dateRange
}: { 
  data: Record<string, any>[];
  aggregated: Record<string, number>;
  validation: ValidationResult;
  insights: RuleResult[];
  dateRange: string;
}) {
  const [open, setOpen] = useState(false);
  
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Bug className="h-4 w-4 mr-2" />
          Modo Debug (Admin)
          <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <div className="space-y-4 text-xs">
          {/* Dataset summary */}
          <div className="bg-muted/50 rounded-lg p-3">
            <h4 className="font-medium mb-2">Dataset</h4>
            <div className="grid grid-cols-2 gap-2 font-mono">
              <span className="text-muted-foreground">Linhas:</span>
              <span>{data.length}</span>
              <span className="text-muted-foreground">Colunas:</span>
              <span>{data.length > 0 ? Object.keys(data[0]).length : 0}</span>
              <span className="text-muted-foreground">Período:</span>
              <span>{dateRange}</span>
            </div>
          </div>
          
          {/* Aggregated values */}
          <div className="bg-muted/50 rounded-lg p-3">
            <h4 className="font-medium mb-2">Valores Agregados</h4>
            <div className="grid grid-cols-2 gap-1 font-mono max-h-40 overflow-y-auto">
              {Object.entries(aggregated).slice(0, 20).map(([key, value]) => (
                <React.Fragment key={key}>
                  <span className="text-muted-foreground truncate">{key}:</span>
                  <span className={!isFinite(value) ? 'text-red-500' : ''}>
                    {isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'INVALID'}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
          
          {/* Validation results */}
          <div className="bg-muted/50 rounded-lg p-3">
            <h4 className="font-medium mb-2">Validação</h4>
            <div className="space-y-1">
              <p className={validation.isValid ? 'text-green-500' : 'text-red-500'}>
                Status: {validation.isValid ? 'Válido' : 'Inválido'}
              </p>
              <p>Checks: {validation.checksPerformed.join(', ')}</p>
              <p>Erros: {validation.errors.length}</p>
              <p>Avisos: {validation.warnings.length}</p>
            </div>
          </div>
          
          {/* Insights generated */}
          <div className="bg-muted/50 rounded-lg p-3">
            <h4 className="font-medium mb-2">Insights Gerados</h4>
            <div className="space-y-1">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge className={`${priorityColors[insight.priority]} text-white text-[10px]`}>
                    {insight.priority}
                  </Badge>
                  <span className="truncate">{insight.ruleId}: {insight.title}</span>
                </div>
              ))}
              {insights.length === 0 && <p className="text-muted-foreground">Nenhum insight gerado</p>}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ================== MAIN COMPONENT ==================

export default function DecisionCenter({ 
  data, 
  previousPeriodData = [],
  dateColumn = 'dia',
  onViewDetails,
  debugMode = false
}: DecisionCenterProps) {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'manager';
  const showDebug = debugMode || isAdmin;
  
  // Try to get context data (if available)
  const contextData = useDashboardDataOptional();
  
  // Use context data if available, otherwise fall back to props
  const workingData = contextData?.data || data;
  const workingPrevious = contextData?.previousData || previousPeriodData;
  
  // Calculate aggregated values
  const aggregated = useMemo(() => {
    if (contextData?.aggregated) return contextData.aggregated;
    
    const sums: Record<string, number> = {};
    workingData.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'number' && isFinite(value)) {
          sums[key] = (sums[key] || 0) + value;
        }
      });
    });
    
    // Calculate derived metrics
    const spend = sums.spend || sums.custo_total || 0;
    const leads = sums.leads_new || sums.leads_total || 0;
    const sales = sums.sales || sums.venda_total || 0;
    
    if (spend > 0 && leads > 0) sums.cpl = spend / leads;
    if (spend > 0 && sales > 0) sums.cac = spend / sales;
    
    return sums;
  }, [workingData, contextData?.aggregated]);
  
  const previousAggregated = useMemo(() => {
    if (contextData?.previousAggregated) return contextData.previousAggregated;
    
    const sums: Record<string, number> = {};
    workingPrevious.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'number' && isFinite(value)) {
          sums[key] = (sums[key] || 0) + value;
        }
      });
    });
    
    const spend = sums.spend || sums.custo_total || 0;
    const leads = sums.leads_new || sums.leads_total || 0;
    const sales = sums.sales || sums.venda_total || 0;
    
    if (spend > 0 && leads > 0) sums.cpl = spend / leads;
    if (spend > 0 && sales > 0) sums.cac = spend / sales;
    
    return sums;
  }, [workingPrevious, contextData?.previousAggregated]);
  
  // Date range string for display
  const dateRange = useMemo(() => {
    if (contextData?.metadata) {
      return `${format(contextData.metadata.dateRange.start, 'dd/MM')} - ${format(contextData.metadata.dateRange.end, 'dd/MM/yyyy')}`;
    }
    
    // Try to extract from data
    const dates = workingData
      .map(row => row[dateColumn] || row.day || row.date)
      .filter(Boolean)
      .sort();
    
    if (dates.length > 0) {
      return `${dates[0]} - ${dates[dates.length - 1]}`;
    }
    
    return 'Período atual';
  }, [contextData?.metadata, workingData, dateColumn]);
  
  const source = contextData?.metadata?.dashboardId 
    ? `Dashboard ${contextData.metadata.dashboardId.slice(0, 8)}...`
    : 'Dashboard';
  
  // 1. Validate data integrity
  const validation = useMemo((): ValidationResult => {
    return validateDataIntegrity(workingData, aggregated, {
      minRowsForInsights: 3,
      dateField: dateColumn,
    });
  }, [workingData, aggregated, dateColumn]);
  
  // Log validation errors
  const logValidationError = useCallback(async () => {
    if (!validation.isValid && validation.errors.length > 0) {
      try {
        await supabase.from('activity_logs').insert({
          action: 'insight_validation_failed',
          entity_type: 'dashboard',
          entity_id: contextData?.metadata?.dashboardId,
          details: formatValidationForLog(validation),
        });
      } catch (err) {
        console.warn('Failed to log validation error:', err);
      }
    }
  }, [validation, contextData?.metadata?.dashboardId]);
  
  // Log on validation failure (once)
  React.useEffect(() => {
    if (!validation.isValid) {
      logValidationError();
    }
  }, [validation.isValid, logValidationError]);
  
  // 2. Run insight rules (only if data is valid)
  const insights = useMemo((): RuleResult[] => {
    if (!validation.isValid) return [];
    
    return runInsightRules({
      current: aggregated,
      previous: workingPrevious.length > 0 ? previousAggregated : undefined,
      dailyData: workingData,
      previousDailyData: workingPrevious,
      dateRange: contextData?.metadata?.dateRange || { start: new Date(), end: new Date() },
    });
  }, [validation.isValid, aggregated, previousAggregated, workingData, workingPrevious, contextData?.metadata?.dateRange]);
  
  // Categorize insights
  const problems = insights.filter(i => i.type === 'problem' || i.type === 'bottleneck');
  const opportunities = insights.filter(i => i.type === 'opportunity');
  const actions = useMemo(() => {
    // Generate action from top problem
    if (problems.length > 0) {
      const topProblem = problems[0];
      return [{
        ...topProblem,
        ruleId: 'action_main',
        type: 'action' as const,
        title: 'Ação recomendada prioritária',
        description: topProblem.suggestedAction || 'Analise e corrija o problema identificado.',
      }];
    }
    return [];
  }, [problems]);
  const anomalies = insights.filter(i => i.type === 'anomaly');

  // Render validation error state
  if (!validation.isValid) {
    return (
      <div className="space-y-6">
        <ValidationBanner validation={validation} onViewDetails={onViewDetails} />
        
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
            <h3 className="font-medium text-lg">Insights indisponíveis</h3>
            <p className="text-muted-foreground text-center max-w-md mt-1">
              Detectamos inconsistências nos dados que impedem a geração de insights confiáveis.
              Verifique a qualidade dos dados no período selecionado.
            </p>
            {onViewDetails && (
              <Button variant="outline" className="mt-4" onClick={onViewDetails}>
                Ver dados detalhados
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
        
        {showDebug && (
          <DebugPanel 
            data={workingData}
            aggregated={aggregated}
            validation={validation}
            insights={[]}
            dateRange={dateRange}
          />
        )}
      </div>
    );
  }

  // Render empty state
  if (insights.length === 0) {
    return (
      <div className="space-y-6">
        <ValidationBanner validation={validation} />
        
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
        
        {showDebug && (
          <DebugPanel 
            data={workingData}
            aggregated={aggregated}
            validation={validation}
            insights={[]}
            dateRange={dateRange}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Validation banner */}
      <ValidationBanner validation={validation} onViewDetails={onViewDetails} />
      
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
                      <InsightCard 
                        key={insight.ruleId} 
                        insight={insight} 
                        dateRange={dateRange}
                        source={source}
                      />
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
                      <InsightCard 
                        key={insight.ruleId} 
                        insight={insight}
                        dateRange={dateRange}
                        source={source}
                      />
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
                      <InsightCard 
                        key={insight.ruleId} 
                        insight={insight}
                        dateRange={dateRange}
                        source={source}
                      />
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
                      <InsightCard 
                        key={insight.ruleId} 
                        insight={insight}
                        dateRange={dateRange}
                        source={source}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Side Column */}
        <div className="space-y-4">
          {/* Data Quality Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Qualidade dos Dados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1">
                  <Progress 
                    value={validation.isValid ? (100 - validation.warnings.length * 10) : 0} 
                    className="h-2"
                  />
                </div>
                <span className={`text-lg font-bold ${
                  validation.isValid ? 'text-green-500' : 'text-red-500'
                }`}>
                  {validation.isValid ? `${Math.max(60, 100 - validation.warnings.length * 10)}%` : '0%'}
                </span>
              </div>
              
              <div className="text-sm space-y-1">
                <p className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>{validation.checksPerformed.length} verificações</span>
                </p>
                {validation.warnings.length > 0 && (
                  <p className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span>{validation.warnings.length} aviso(s)</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* View details button */}
          {onViewDetails && (
            <Button variant="outline" className="w-full" onClick={onViewDetails}>
              <Eye className="h-4 w-4 mr-2" />
              Ver dados detalhados
            </Button>
          )}
          
          {/* Debug panel for admins */}
          {showDebug && (
            <DebugPanel 
              data={workingData}
              aggregated={aggregated}
              validation={validation}
              insights={insights}
              dateRange={dateRange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
