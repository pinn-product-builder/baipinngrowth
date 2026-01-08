import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Bug, ChevronDown, ChevronRight, RefreshCw, CheckCircle2, 
  XCircle, AlertTriangle, Copy, ExternalLink, Play 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DebugPanelProps {
  dashboardId: string;
  dashboardName?: string;
  dateRange: { start: Date; end: Date };
  isAdminOrManager: boolean;
}

interface DiagnosticResult {
  // Dashboard binding
  dashboard_id: string;
  tenant_id?: string;
  data_source_id?: string;
  data_source_name?: string;
  dataset_ref?: string;
  view_name?: string;
  
  // Spec info
  spec_present: boolean;
  spec_version?: number;
  spec_kpis_count?: number;
  spec_funnel_stages?: number;
  spec_charts_count?: number;
  
  // Call status
  endpoint_called: boolean;
  http_status?: number;
  response_ok?: boolean;
  rows_returned?: number;
  kpis_count?: number;
  charts_count?: number;
  funnel_count?: number;
  trace_id?: string;
  
  // Data range
  data_min_date?: string;
  data_max_date?: string;
  
  // Errors/warnings
  errors: string[];
  warnings: string[];
}

export default function DebugPanel({ 
  dashboardId, 
  dashboardName,
  dateRange,
  isAdminOrManager 
}: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const { toast } = useToast();

  // Don't render for non-admins
  if (!isAdminOrManager) return null;

  const runDiagnostic = async () => {
    setIsRunning(true);
    
    const diagnostic: DiagnosticResult = {
      dashboard_id: dashboardId,
      endpoint_called: false,
      spec_present: false,
      errors: [],
      warnings: []
    };

    try {
      // 1. Check dashboard exists and get binding info
      const { data: dashboard, error: dashError } = await supabase
        .from('dashboards')
        .select(`
          id, name, tenant_id, data_source_id, view_name,
          dashboard_spec, detected_columns,
          tenant_data_sources!data_source_id (
            id, name, project_url
          )
        `)
        .eq('id', dashboardId)
        .single();

      if (dashError || !dashboard) {
        diagnostic.errors.push(`Dashboard não encontrado: ${dashError?.message || 'ID inválido'}`);
        setResult(diagnostic);
        setIsRunning(false);
        return;
      }

      diagnostic.tenant_id = dashboard.tenant_id;
      diagnostic.data_source_id = dashboard.data_source_id || undefined;
      diagnostic.view_name = dashboard.view_name || undefined;
      diagnostic.dataset_ref = dashboard.view_name ? `public.${dashboard.view_name}` : undefined;
      
      // Data source info
      const ds = dashboard.tenant_data_sources as any;
      if (ds) {
        diagnostic.data_source_name = ds.name;
      }

      // Check for missing bindings
      if (!dashboard.data_source_id) {
        diagnostic.errors.push('Dashboard não tem data_source_id configurado');
      }
      if (!dashboard.view_name) {
        diagnostic.errors.push('Dashboard não tem view_name configurado');
      }

      // Check spec
      const spec = dashboard.dashboard_spec as any;
      diagnostic.spec_present = !!spec && Object.keys(spec).length > 0;
      
      if (spec) {
        diagnostic.spec_version = spec.version;
        diagnostic.spec_kpis_count = spec.kpis?.length || 0;
        diagnostic.spec_funnel_stages = spec.funnel?.stages?.length || spec.funnel?.steps?.length || 0;
        diagnostic.spec_charts_count = spec.charts?.length || 0;
        
        if (diagnostic.spec_kpis_count === 0 && diagnostic.spec_funnel_stages === 0) {
          diagnostic.warnings.push('Spec não define KPIs nem funil');
        }
      } else {
        diagnostic.warnings.push('Dashboard não possui spec (dashboard_spec)');
      }

      // 2. Call the edge function
      const startStr = dateRange.start.toISOString().split('T')[0];
      const endStr = dateRange.end.toISOString().split('T')[0];

      diagnostic.endpoint_called = true;

      const { data: v2Result, error: v2Error } = await supabase.functions.invoke('dashboard-data-v2', {
        body: {
          dashboard_id: dashboardId,
          start: startStr,
          end: endStr,
        },
      });

      if (v2Error) {
        diagnostic.http_status = 500;
        diagnostic.response_ok = false;
        diagnostic.errors.push(`Edge function error: ${v2Error.message}`);
      } else if (v2Result) {
        diagnostic.response_ok = v2Result.ok === true;
        diagnostic.trace_id = v2Result.trace_id || v2Result.meta?.trace_id;
        
        if (!v2Result.ok && v2Result.error) {
          diagnostic.errors.push(`[${v2Result.error.code}] ${v2Result.error.message}`);
          if (v2Result.error.details) {
            diagnostic.errors.push(v2Result.error.details);
          }
        } else if (v2Result.ok) {
          diagnostic.rows_returned = v2Result.meta?.rows_fetched || v2Result.rows?.length || 0;
          diagnostic.kpis_count = Object.keys(v2Result.aggregations?.kpis || {}).length;
          diagnostic.funnel_count = v2Result.aggregations?.funnel?.length || 0;
          diagnostic.charts_count = Object.keys(v2Result.aggregations?.series || {}).length;
          
          // Date range
          diagnostic.data_min_date = v2Result.meta?.date_range?.min;
          diagnostic.data_max_date = v2Result.meta?.date_range?.max;
          
          if (diagnostic.rows_returned === 0) {
            diagnostic.warnings.push('Endpoint retornou 0 linhas');
            if (diagnostic.data_min_date && diagnostic.data_max_date) {
              diagnostic.warnings.push(`Dados disponíveis: ${diagnostic.data_min_date} → ${diagnostic.data_max_date}`);
            }
          }
          
          if (diagnostic.kpis_count === 0 && diagnostic.funnel_count === 0) {
            diagnostic.warnings.push('Nenhum KPI ou funil calculado');
          }
        }
      }

    } catch (err: any) {
      diagnostic.errors.push(`Exceção: ${err.message}`);
    }

    setResult(diagnostic);
    setIsRunning(false);
  };

  const copyDiagnostic = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast({ title: 'Diagnóstico copiado!' });
  };

  const StatusIcon = ({ ok }: { ok: boolean | undefined }) => {
    if (ok === undefined) return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    return ok 
      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
      : <XCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm font-medium">Debug Panel (Admin)</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {result && (
                  <Badge 
                    variant={result.errors.length > 0 ? "destructive" : result.warnings.length > 0 ? "secondary" : "default"}
                    className="text-xs"
                  >
                    {result.errors.length > 0 
                      ? `${result.errors.length} erro(s)` 
                      : result.warnings.length > 0 
                        ? `${result.warnings.length} aviso(s)` 
                        : 'OK'}
                  </Badge>
                )}
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={runDiagnostic}
                disabled={isRunning}
              >
                {isRunning ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Executar Diagnóstico
              </Button>
              {result && (
                <Button size="sm" variant="ghost" onClick={copyDiagnostic}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar JSON
                </Button>
              )}
            </div>

            {result && (
              <div className="space-y-4 text-sm">
                {/* Binding Info */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-muted-foreground">Binding</h4>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs bg-background rounded p-3">
                    <div>
                      <span className="text-muted-foreground">dashboard_id:</span>
                      <span className="ml-2 text-foreground">{result.dashboard_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">tenant_id:</span>
                      <span className="ml-2 text-foreground">{result.tenant_id || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">data_source:</span>
                      <span className="ml-2">{result.data_source_name || result.data_source_id || '⚠️ não configurado'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">dataset_ref:</span>
                      <span className="ml-2">{result.dataset_ref || '⚠️ não configurado'}</span>
                    </div>
                  </div>
                </div>

                {/* Spec Info */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-muted-foreground">Spec</h4>
                  <div className="grid grid-cols-4 gap-2 font-mono text-xs bg-background rounded p-3">
                    <div className="flex items-center gap-1">
                      <StatusIcon ok={result.spec_present} />
                      <span>spec_present</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">version:</span>
                      <span className="ml-1">{result.spec_version || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">kpis:</span>
                      <span className="ml-1">{result.spec_kpis_count ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">funnel:</span>
                      <span className="ml-1">{result.spec_funnel_stages ?? '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Call Status */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-muted-foreground">Status da Chamada</h4>
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs bg-background rounded p-3">
                    <div className="flex items-center gap-1">
                      <StatusIcon ok={result.endpoint_called} />
                      <span>endpoint_called</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <StatusIcon ok={result.response_ok} />
                      <span>response_ok</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">rows:</span>
                      <span className="ml-1">{result.rows_returned ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">kpis:</span>
                      <span className="ml-1">{result.kpis_count ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">funnel:</span>
                      <span className="ml-1">{result.funnel_count ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">trace_id:</span>
                      <span className="ml-1 text-amber-600">{result.trace_id || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Data Range */}
                {(result.data_min_date || result.data_max_date) && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs uppercase text-muted-foreground">Range de Dados</h4>
                    <div className="flex items-center gap-4 font-mono text-xs bg-background rounded p-3">
                      <div>
                        <span className="text-muted-foreground">min:</span>
                        <span className="ml-1">{result.data_min_date}</span>
                      </div>
                      <span className="text-muted-foreground">→</span>
                      <div>
                        <span className="text-muted-foreground">max:</span>
                        <span className="ml-1">{result.data_max_date}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Errors */}
                {result.errors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs uppercase text-destructive">Erros</h4>
                    <div className="space-y-1">
                      {result.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs p-2 bg-destructive/10 text-destructive rounded">
                          <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs uppercase text-amber-600">Avisos</h4>
                    <div className="space-y-1">
                      {result.warnings.map((warn, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <span>{warn}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
