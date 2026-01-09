// ============================================================
// SCHEMA CHANGE ALERT
// Shows warning when dataset schema has changed
// Part of Binding Lock feature
// ============================================================

import { AlertTriangle, RefreshCw, Table, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SchemaChangeAlertProps {
  /** Whether schema has changed */
  changed: boolean;
  /** Added columns */
  addedColumns: string[];
  /** Removed columns */
  removedColumns: string[];
  /** Handler to re-map columns */
  onRemap: () => void;
  /** Handler to continue in compatibility mode */
  onContinueCompatibility: () => void;
  /** Additional className */
  className?: string;
}

/**
 * Schema Change Alert
 * Shows when dataset schema has changed since dashboard was created
 */
export default function SchemaChangeAlert({
  changed,
  addedColumns,
  removedColumns,
  onRemap,
  onContinueCompatibility,
  className,
}: SchemaChangeAlertProps) {
  if (!changed) return null;

  const hasAdditions = addedColumns.length > 0;
  const hasRemovals = removedColumns.length > 0;

  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-5 w-5" />
      <AlertTitle className="flex items-center gap-2">
        Dataset Modificado
        <Badge variant="outline" className="text-xs">
          Binding Lock
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p>
          O schema do dataset mudou desde que este dashboard foi criado. 
          Isso pode causar erros ou dados faltantes.
        </p>
        
        {hasRemovals && (
          <div className="flex items-start gap-2">
            <Badge variant="destructive" className="shrink-0">Removidas</Badge>
            <div className="flex flex-wrap gap-1">
              {removedColumns.map(col => (
                <code key={col} className="text-xs bg-destructive/10 px-1.5 py-0.5 rounded">
                  {col}
                </code>
              ))}
            </div>
          </div>
        )}
        
        {hasAdditions && (
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="shrink-0 text-green-600 border-green-600">Adicionadas</Badge>
            <div className="flex flex-wrap gap-1">
              {addedColumns.map(col => (
                <code key={col} className="text-xs bg-green-500/10 px-1.5 py-0.5 rounded">
                  {col}
                </code>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex gap-2 pt-2">
          <Button onClick={onRemap} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Re-mapear Colunas
          </Button>
          <Button onClick={onContinueCompatibility} variant="outline" size="sm">
            <Table className="h-4 w-4 mr-2" />
            Modo Compatibilidade
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
