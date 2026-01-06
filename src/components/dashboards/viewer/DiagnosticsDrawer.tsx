import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Copy, Bug, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { NormalizedDataset, NormalizedColumn } from './datasetNormalizer';
import { DashboardSpec } from './types/dashboardSpec';

interface DiagnosticsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  normalizedDataset: NormalizedDataset | null;
  dashboardSpec: DashboardSpec | null;
  rawDataSample?: any;
  templateConfig?: any;
}

export default function DiagnosticsDrawer({
  open,
  onOpenChange,
  normalizedDataset,
  dashboardSpec,
  rawDataSample,
  templateConfig,
}: DiagnosticsDrawerProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  
  const handleCopyDiagnostics = async () => {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      normalizedDataset: normalizedDataset ? {
        columnsCount: normalizedDataset.columns.length,
        rowsCount: normalizedDataset.rows.length,
        columns: normalizedDataset.columns,
        warnings: normalizedDataset.warnings,
        stats: normalizedDataset.stats,
        firstRow: normalizedDataset.rows[0] ? Object.keys(normalizedDataset.rows[0]) : [],
      } : null,
      dashboardSpec: dashboardSpec ? {
        version: dashboardSpec.version,
        hasKpis: !!dashboardSpec.kpis?.length,
        hasFunnel: !!dashboardSpec.funnel,
        hasCharts: !!dashboardSpec.charts?.length,
        tabs: dashboardSpec.ui?.tabs,
      } : null,
      templateConfig: templateConfig ? {
        enabledTabs: templateConfig.enabledTabs,
        kpisCount: templateConfig.kpis?.length,
        dateColumn: templateConfig.dateColumn,
      } : null,
    };
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setCopied(true);
      toast({ title: 'Diagnóstico copiado!' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };
  
  const getWarningIcon = (code: string) => {
    if (code.includes('ERROR') || code.includes('INVALID')) {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    if (code.includes('WARN') || code.includes('RANGE')) {
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    }
    return <Info className="h-4 w-4 text-muted-foreground" />;
  };
  
  const getTypeBadgeColor = (type: NormalizedColumn['type']) => {
    switch (type) {
      case 'date': return 'bg-blue-500/10 text-blue-600';
      case 'currency': return 'bg-green-500/10 text-green-600';
      case 'percent': return 'bg-purple-500/10 text-purple-600';
      case 'number': return 'bg-amber-500/10 text-amber-600';
      case 'boolean': return 'bg-pink-500/10 text-pink-600';
      case 'string': return 'bg-slate-500/10 text-slate-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Diagnóstico do Dashboard
          </SheetTitle>
          <SheetDescription>
            Informações técnicas para depuração
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-180px)] pr-4 mt-6">
          <div className="space-y-6">
            {/* Summary */}
            <section>
              <h3 className="text-sm font-medium mb-3">Resumo</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Colunas</p>
                  <p className="text-lg font-semibold">
                    {normalizedDataset?.columns.length || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Linhas</p>
                  <p className="text-lg font-semibold">
                    {normalizedDataset?.rows.length || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Warnings</p>
                  <p className="text-lg font-semibold">
                    {normalizedDataset?.warnings.length || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Spec</p>
                  <p className="text-lg font-semibold">
                    {dashboardSpec ? 'Ativo' : 'Auto'}
                  </p>
                </div>
              </div>
            </section>
            
            <Separator />
            
            {/* Columns */}
            <section>
              <h3 className="text-sm font-medium mb-3">Colunas Detectadas</h3>
              <div className="space-y-2">
                {normalizedDataset?.columns.map((col, i) => (
                  <div 
                    key={i}
                    className="flex items-center justify-between p-2 rounded bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-xs">{col.name}</code>
                      {col.scale && (
                        <span className="text-[10px] text-muted-foreground">
                          ({col.scale})
                        </span>
                      )}
                    </div>
                    <Badge className={getTypeBadgeColor(col.type)} variant="secondary">
                      {col.type}
                    </Badge>
                  </div>
                ))}
                
                {(!normalizedDataset?.columns || normalizedDataset.columns.length === 0) && (
                  <p className="text-sm text-muted-foreground">Nenhuma coluna detectada</p>
                )}
              </div>
            </section>
            
            <Separator />
            
            {/* Warnings */}
            <section>
              <h3 className="text-sm font-medium mb-3">Warnings</h3>
              {normalizedDataset?.warnings && normalizedDataset.warnings.length > 0 ? (
                <div className="space-y-2">
                  {normalizedDataset.warnings.slice(0, 20).map((warning, i) => (
                    <div 
                      key={i}
                      className="flex items-start gap-2 p-2 rounded bg-muted/30"
                    >
                      {getWarningIcon(warning.code)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{warning.code}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {warning.message}
                          {warning.column && ` (${warning.column})`}
                        </p>
                      </div>
                    </div>
                  ))}
                  {normalizedDataset.warnings.length > 20 && (
                    <p className="text-xs text-muted-foreground">
                      +{normalizedDataset.warnings.length - 20} warnings...
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Nenhum warning
                </div>
              )}
            </section>
            
            <Separator />
            
            {/* Stats */}
            {normalizedDataset?.stats && Object.keys(normalizedDataset.stats).length > 0 && (
              <>
                <section>
                  <h3 className="text-sm font-medium mb-3">Estatísticas</h3>
                  <div className="space-y-2">
                    {Object.entries(normalizedDataset.stats).slice(0, 10).map(([col, stat]) => (
                      <div key={col} className="p-2 rounded bg-muted/30">
                        <p className="text-xs font-medium mb-1">{col}</p>
                        <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                          <div>
                            <span className="block">Min</span>
                            <span className="text-foreground">
                              {stat.min?.toFixed(2) || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="block">Max</span>
                            <span className="text-foreground">
                              {stat.max?.toFixed(2) || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="block">Avg</span>
                            <span className="text-foreground">
                              {stat.avg?.toFixed(2) || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="block">Nulls</span>
                            <span className="text-foreground">{stat.nulls || 0}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <Separator />
              </>
            )}
            
            {/* First Row Sample */}
            {normalizedDataset?.rows[0] && (
              <section>
                <h3 className="text-sm font-medium mb-3">Primeira Linha (normalizada)</h3>
                <pre className="p-3 rounded bg-muted/50 text-xs overflow-auto max-h-48">
                  {JSON.stringify(normalizedDataset.rows[0], (key, value) => {
                    if (value instanceof Date) return value.toISOString();
                    return value;
                  }, 2)}
                </pre>
              </section>
            )}
            
            <Separator />
            
            {/* Template Config */}
            {templateConfig && (
              <section>
                <h3 className="text-sm font-medium mb-3">Template Config</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tabs habilitados:</span>
                    <span>{templateConfig.enabledTabs?.join(', ') || 'nenhum'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coluna de data:</span>
                    <span>{templateConfig.dateColumn || 'não definida'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">KPIs:</span>
                    <span>{templateConfig.kpis?.length || 0}</span>
                  </div>
                </div>
              </section>
            )}
            
            {/* Dashboard Spec */}
            {dashboardSpec && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-medium mb-3">Dashboard Spec (v{dashboardSpec.version})</h3>
                  <div className="space-y-2 text-xs">
                    {dashboardSpec.title && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Título:</span>
                        <span>{dashboardSpec.title}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">KPIs definidos:</span>
                      <span>{dashboardSpec.kpis?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Funil:</span>
                      <span>{dashboardSpec.funnel ? `${dashboardSpec.funnel.steps.length} etapas` : 'não'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gráficos:</span>
                      <span>{dashboardSpec.charts?.length || 0}</span>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
        
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
          <Button 
            onClick={handleCopyDiagnostics}
            className="w-full"
            variant={copied ? "secondary" : "default"}
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? 'Copiado!' : 'Copiar diagnóstico'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
