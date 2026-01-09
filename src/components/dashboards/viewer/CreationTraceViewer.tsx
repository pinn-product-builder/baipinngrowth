// ============================================================
// CREATION TRACE VIEWER
// Shows audit trail of dashboard creation steps
// For admin/debug purposes
// ============================================================

import { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  ChevronDown, 
  ChevronRight,
  Download,
  Copy,
  Loader2,
  SkipForward,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { CreationTrace, TraceStep, DiscardInfo } from '@/lib/dashboard/types';
import { formatTraceForExport } from '@/lib/dashboard';

interface CreationTraceViewerProps {
  /** The creation trace to display */
  trace: CreationTrace;
  /** Additional className */
  className?: string;
}

// Status icons
const STATUS_ICONS: Record<TraceStep['status'], React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
  skipped: <SkipForward className="h-4 w-4 text-muted-foreground" />,
};

// Status colors
const STATUS_COLORS: Record<TraceStep['status'], string> = {
  pending: 'border-muted-foreground/30',
  running: 'border-blue-500',
  done: 'border-green-500',
  error: 'border-destructive',
  skipped: 'border-muted-foreground/30',
};

/**
 * Creation Trace Viewer
 * Shows detailed audit trail of dashboard creation
 */
export default function CreationTraceViewer({
  trace,
  className,
}: CreationTraceViewerProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const toggleStep = (stepName: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepName)) {
        next.delete(stepName);
      } else {
        next.add(stepName);
      }
      return next;
    });
  };

  const handleCopyJson = async () => {
    try {
      const jsonObj = formatTraceForExport(trace);
      const jsonStr = typeof jsonObj === 'string' ? jsonObj : JSON.stringify(jsonObj, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const jsonObj = formatTraceForExport(trace);
    const jsonStr = typeof jsonObj === 'string' ? jsonObj : JSON.stringify(jsonObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace_${trace.traceId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Trace de Criação
            <Badge 
              variant={trace.status === 'success' ? 'default' : trace.status === 'failed' ? 'destructive' : 'secondary'}
            >
              {trace.status}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {trace.traceId}
            </code>
            <Button variant="ghost" size="icon" onClick={handleCopyJson}>
              {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-2 rounded bg-muted/50">
            <span className="text-muted-foreground">Tabs:</span>
            <span className="ml-2 font-medium">{trace.summary.tabsGenerated.length}</span>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <span className="text-muted-foreground">Widgets:</span>
            <span className="ml-2 font-medium">{trace.summary.widgetsGenerated}</span>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <span className="text-muted-foreground">Descartados:</span>
            <span className="ml-2 font-medium text-warning">
              {trace.summary.tabsDiscarded.length + trace.summary.widgetsDiscarded.length}
            </span>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <span className="text-muted-foreground">Avisos:</span>
            <span className="ml-2 font-medium text-warning">{trace.summary.warnings.length}</span>
          </div>
        </div>

        {/* Steps Timeline */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Etapas</h4>
          <div className="space-y-1">
            {trace.steps.map((step, index) => (
              <Collapsible 
                key={step.name}
                open={expandedSteps.has(step.name)}
                onOpenChange={() => toggleStep(step.name)}
              >
                <CollapsibleTrigger asChild>
                  <div className={cn(
                    "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50",
                    "border-l-2",
                    STATUS_COLORS[step.status]
                  )}>
                    {STATUS_ICONS[step.status]}
                    <span className="flex-1 text-sm font-medium">{step.name}</span>
                    {step.durationMs !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {step.durationMs}ms
                      </span>
                    )}
                    {(step.warnings?.length || 0) > 0 && (
                      <Badge variant="outline" className="text-xs text-warning">
                        {step.warnings?.length} avisos
                      </Badge>
                    )}
                    {(step.discards?.length || 0) > 0 && (
                      <Badge variant="outline" className="text-xs text-destructive">
                        {step.discards?.length} descartados
                      </Badge>
                    )}
                    {expandedSteps.has(step.name) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <StepDetails step={step} />
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>

        {/* Discards Summary */}
        {(trace.summary.tabsDiscarded.length > 0 || trace.summary.widgetsDiscarded.length > 0) && (
          <DiscardsSummary 
            tabsDiscarded={trace.summary.tabsDiscarded}
            widgetsDiscarded={trace.summary.widgetsDiscarded}
          />
        )}

        {/* Warnings Summary */}
        {trace.summary.warnings.length > 0 && (
          <div className="p-3 rounded bg-warning/10 border border-warning/20">
            <h4 className="text-sm font-medium text-warning mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Avisos ({trace.summary.warnings.length})
            </h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {trace.summary.warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Step details component
 */
function StepDetails({ step }: { step: TraceStep }) {
  return (
    <div className="ml-6 pl-4 py-2 border-l border-muted space-y-2 text-sm">
      {step.startedAt && (
        <p className="text-xs text-muted-foreground">
          Iniciado: {new Date(step.startedAt).toLocaleTimeString()}
          {step.completedAt && ` → ${new Date(step.completedAt).toLocaleTimeString()}`}
        </p>
      )}
      
      {step.error && (
        <div className="p-2 rounded bg-destructive/10 text-destructive">
          <strong>Erro:</strong> {step.error}
        </div>
      )}
      
      {step.inputs && Object.keys(step.inputs).length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Inputs:</p>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {JSON.stringify(step.inputs, null, 2)}
          </pre>
        </div>
      )}
      
      {step.outputs && Object.keys(step.outputs).length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Outputs:</p>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {JSON.stringify(step.outputs, null, 2)}
          </pre>
        </div>
      )}
      
      {step.warnings && step.warnings.length > 0 && (
        <div className="p-2 rounded bg-warning/10">
          <p className="text-xs font-medium text-warning mb-1">Avisos:</p>
          <ul className="list-disc list-inside">
            {step.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      
      {step.discards && step.discards.length > 0 && (
        <div className="p-2 rounded bg-destructive/10">
          <p className="text-xs font-medium text-destructive mb-1">Descartados:</p>
          <ul className="space-y-1">
            {step.discards.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{d.type}</Badge>
                <span className="font-medium">{d.item}:</span>
                <span>{d.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Discards summary component
 */
function DiscardsSummary({ 
  tabsDiscarded, 
  widgetsDiscarded 
}: { 
  tabsDiscarded: DiscardInfo[];
  widgetsDiscarded: DiscardInfo[];
}) {
  return (
    <div className="p-3 rounded bg-destructive/10 border border-destructive/20">
      <h4 className="text-sm font-medium text-destructive mb-2">
        Itens Descartados
      </h4>
      
      {tabsDiscarded.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium mb-1">Tabs:</p>
          <ul className="space-y-1 text-sm">
            {tabsDiscarded.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-medium">{d.item}:</span>
                <span className="text-muted-foreground">{d.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {widgetsDiscarded.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Widgets:</p>
          <ul className="space-y-1 text-sm">
            {widgetsDiscarded.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-medium">{d.item}:</span>
                <span className="text-muted-foreground">{d.reason}</span>
                {d.fallback && (
                  <Badge variant="outline" className="text-xs">→ {d.fallback}</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
