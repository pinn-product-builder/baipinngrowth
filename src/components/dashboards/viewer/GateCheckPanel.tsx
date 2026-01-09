// ============================================================
// GATE CHECK PANEL
// Shows smoke test and render test results before saving dashboard
// Blocks saving if gate check fails
// ============================================================

import { CheckCircle2, XCircle, AlertTriangle, Loader2, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { GateCheckResult, SmokeTestResult } from '@/lib/dashboard/types';

interface GateCheckPanelProps {
  /** Gate check result */
  result: GateCheckResult | null;
  /** Whether gate check is running */
  isRunning: boolean;
  /** Handler to run gate check */
  onRunCheck: () => void;
  /** Handler to proceed (only if passed) */
  onProceed: () => void;
  /** Handler to go back and fix issues */
  onGoBack: () => void;
  /** Additional className */
  className?: string;
}

/**
 * Gate Check Panel
 * Shows results of smoke and render tests
 * Blocks saving if tests fail
 */
export default function GateCheckPanel({
  result,
  isRunning,
  onRunCheck,
  onProceed,
  onGoBack,
  className,
}: GateCheckPanelProps) {
  if (!result && !isRunning) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">Gate Check</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Valide o dashboard antes de salvar para garantir que ele renderiza corretamente.
          </p>
          <Button onClick={onRunCheck}>
            Executar Validação
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isRunning) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
          <h3 className="text-lg font-medium mb-2">Validando Dashboard...</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Executando smoke tests e verificação de render
          </p>
          <Progress value={50} className="w-64 mx-auto" />
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  const { passed, smokeTest, renderTest, blockReasons, canProceed } = result;

  return (
    <Card className={cn(
      'border-2',
      passed ? 'border-green-500/50' : 'border-destructive/50',
      className
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            {passed ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            Gate Check {passed ? 'Aprovado' : 'Reprovado'}
          </CardTitle>
          <Badge variant={passed ? 'default' : 'destructive'}>
            {smokeTest.traceId}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Smoke Test Results */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            Smoke Test
            {smokeTest.passed ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="p-2 rounded bg-muted/50">
              <span className="text-muted-foreground">KPIs:</span>
              <span className="ml-2 font-medium">{smokeTest.kpisCount}</span>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <span className="text-muted-foreground">Linhas:</span>
              <span className="ml-2 font-medium">{smokeTest.rowsCount.toLocaleString()}</span>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <span className="text-muted-foreground">Aggregate:</span>
              {smokeTest.aggregateOk ? (
                <CheckCircle2 className="ml-2 h-4 w-4 inline text-green-500" />
              ) : (
                <XCircle className="ml-2 h-4 w-4 inline text-destructive" />
              )}
            </div>
            <div className="p-2 rounded bg-muted/50">
              <span className="text-muted-foreground">Details:</span>
              {smokeTest.detailsOk ? (
                <CheckCircle2 className="ml-2 h-4 w-4 inline text-green-500" />
              ) : (
                <XCircle className="ml-2 h-4 w-4 inline text-destructive" />
              )}
            </div>
          </div>
          
          {/* Errors */}
          {smokeTest.errors.length > 0 && (
            <div className="mt-2 p-2 rounded bg-destructive/10 text-sm">
              <p className="font-medium text-destructive mb-1">Erros:</p>
              <ul className="list-disc list-inside space-y-1">
                {smokeTest.errors.map((err, i) => (
                  <li key={i} className="text-destructive">{err}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Warnings */}
          {smokeTest.warnings.length > 0 && (
            <div className="mt-2 p-2 rounded bg-warning/10 text-sm">
              <p className="font-medium text-warning mb-1">Avisos:</p>
              <ul className="list-disc list-inside space-y-1">
                {smokeTest.warnings.map((warn, i) => (
                  <li key={i} className="text-warning">{warn}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        {/* Render Test Results */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            Render Test
            {renderTest.passed ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </h4>
          {renderTest.error && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {renderTest.error}
            </p>
          )}
        </div>
        
        {/* Block Reasons */}
        {blockReasons.length > 0 && (
          <div className="p-3 rounded bg-destructive/10 border border-destructive/20">
            <p className="text-sm font-medium text-destructive mb-2">
              ❌ Dashboard bloqueado por:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {blockReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {canProceed ? (
            <Button onClick={onProceed} className="flex-1">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Salvar Dashboard
            </Button>
          ) : (
            <Button onClick={onGoBack} variant="outline" className="flex-1">
              Voltar e Corrigir
            </Button>
          )}
          <Button onClick={onRunCheck} variant="ghost" size="icon">
            <Loader2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
