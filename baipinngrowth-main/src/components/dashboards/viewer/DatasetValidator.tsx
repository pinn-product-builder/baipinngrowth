import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, XCircle, AlertTriangle, Loader2, FileCheck } from 'lucide-react';

export type ValidationStatus = 'idle' | 'validating' | 'ok' | 'warning' | 'blocker';

export interface ValidationResult {
  status: ValidationStatus;
  issues: ValidationIssue[];
  summary: {
    totalRows: number;
    totalColumns: number;
    dateColumn: string | null;
    missingRequired: string[];
    typeIssues: number;
    nullRate: Record<string, number>;
    dateGaps: number;
    duplicates: number;
  };
}

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  column?: string;
  details?: string;
}

interface DatasetValidatorProps {
  data: any[];
  requiredColumns?: string[];
  timeColumn?: string;
  onValidate?: (result: ValidationResult) => void;
}

// Detect column types
function detectColumnType(values: any[]): 'date' | 'number' | 'currency' | 'percent' | 'string' | 'boolean' | 'mixed' {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'string';
  
  const sample = nonNull.slice(0, 100);
  
  let dateCount = 0;
  let numberCount = 0;
  let boolCount = 0;
  let currencyCount = 0;
  let percentCount = 0;
  
  for (const val of sample) {
    if (typeof val === 'boolean') {
      boolCount++;
      continue;
    }
    
    if (typeof val === 'number') {
      if (val >= 0 && val <= 1) percentCount++;
      numberCount++;
      continue;
    }
    
    const str = String(val);
    
    // Date patterns
    if (/^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{2}\/\d{2}\/\d{4}/.test(str)) {
      dateCount++;
      continue;
    }
    
    // Currency patterns (R$ or plain numbers with comma)
    if (/^R\$\s?[\d.,]+$/.test(str) || /^[\d.]+,\d{2}$/.test(str)) {
      currencyCount++;
      continue;
    }
    
    // Percent pattern
    if (/^[\d.,]+%$/.test(str)) {
      percentCount++;
      continue;
    }
    
    // Plain number
    if (/^-?[\d.,]+$/.test(str) && !isNaN(parseFloat(str.replace(',', '.')))) {
      numberCount++;
      continue;
    }
  }
  
  const total = sample.length;
  const threshold = 0.8;
  
  if (dateCount / total >= threshold) return 'date';
  if (currencyCount / total >= threshold) return 'currency';
  if (percentCount / total >= threshold) return 'percent';
  if (boolCount / total >= threshold) return 'boolean';
  if (numberCount / total >= threshold) return 'number';
  if ((dateCount + numberCount + boolCount + currencyCount + percentCount) / total < 0.5) return 'string';
  
  return 'mixed';
}

// Detect date gaps
function detectDateGaps(dates: Date[]): number {
  if (dates.length < 2) return 0;
  
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  let gaps = 0;
  
  for (let i = 1; i < sorted.length; i++) {
    const diff = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
    if (diff > 1.5) gaps++; // More than 1 day gap
  }
  
  return gaps;
}

// Detect duplicates
function detectDuplicates(rows: any[], keyColumn: string): number {
  const seen = new Set<string>();
  let duplicates = 0;
  
  for (const row of rows) {
    const key = String(row[keyColumn] ?? '');
    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
    }
  }
  
  return duplicates;
}

export function validateDataset(
  data: any[],
  requiredColumns: string[] = [],
  timeColumn?: string
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const summary = {
    totalRows: data.length,
    totalColumns: 0,
    dateColumn: null as string | null,
    missingRequired: [] as string[],
    typeIssues: 0,
    nullRate: {} as Record<string, number>,
    dateGaps: 0,
    duplicates: 0,
  };
  
  if (data.length === 0) {
    issues.push({
      type: 'error',
      code: 'NO_DATA',
      message: 'Dataset vazio - nenhuma linha retornada',
    });
    return { status: 'blocker', issues, summary };
  }
  
  const columns = Object.keys(data[0]);
  summary.totalColumns = columns.length;
  
  // Check required columns
  for (const required of requiredColumns) {
    if (!columns.includes(required)) {
      summary.missingRequired.push(required);
      issues.push({
        type: 'error',
        code: 'MISSING_COLUMN',
        message: `Coluna obrigatória ausente: ${required}`,
        column: required,
      });
    }
  }
  
  // Analyze each column
  for (const col of columns) {
    const values = data.map(row => row[col]);
    const nullCount = values.filter(v => v === null || v === undefined || v === '').length;
    const nullRate = nullCount / values.length;
    summary.nullRate[col] = nullRate;
    
    if (nullRate > 0.5) {
      issues.push({
        type: 'warning',
        code: 'HIGH_NULL_RATE',
        message: `Coluna "${col}" tem ${(nullRate * 100).toFixed(0)}% de valores nulos`,
        column: col,
      });
    }
    
    const detectedType = detectColumnType(values);
    
    // Check if this is a date column
    if (detectedType === 'date' || col.includes('dia') || col.includes('date') || col.includes('created')) {
      if (!summary.dateColumn) {
        summary.dateColumn = col;
      }
    }
    
    if (detectedType === 'mixed') {
      summary.typeIssues++;
      issues.push({
        type: 'warning',
        code: 'MIXED_TYPES',
        message: `Coluna "${col}" contém tipos mistos de dados`,
        column: col,
      });
    }
  }
  
  // Check for date column if expected
  const expectedTimeCol = timeColumn || summary.dateColumn;
  if (expectedTimeCol && columns.includes(expectedTimeCol)) {
    const dateValues = data
      .map(row => {
        const val = row[expectedTimeCol];
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      })
      .filter((d): d is Date => d !== null);
    
    summary.dateGaps = detectDateGaps(dateValues);
    if (summary.dateGaps > 0) {
      issues.push({
        type: 'warning',
        code: 'DATE_GAPS',
        message: `Detectados ${summary.dateGaps} gap(s) na sequência de datas`,
        column: expectedTimeCol,
        details: 'Podem existir dias sem dados no período selecionado',
      });
    }
    
    summary.duplicates = detectDuplicates(data, expectedTimeCol);
    if (summary.duplicates > 0) {
      issues.push({
        type: 'warning',
        code: 'DUPLICATES',
        message: `Detectadas ${summary.duplicates} linha(s) com datas duplicadas`,
        column: expectedTimeCol,
      });
    }
  } else if (!summary.dateColumn) {
    issues.push({
      type: 'info',
      code: 'NO_DATE_COLUMN',
      message: 'Nenhuma coluna de data detectada',
      details: 'Gráficos de tendência podem não funcionar corretamente',
    });
  }
  
  // Determine status
  let status: ValidationStatus = 'ok';
  
  const hasErrors = issues.some(i => i.type === 'error');
  const hasWarnings = issues.some(i => i.type === 'warning');
  
  if (hasErrors) {
    status = 'blocker';
  } else if (hasWarnings) {
    status = 'warning';
  }
  
  return { status, issues, summary };
}

export function DatasetValidator({
  data,
  requiredColumns = [],
  timeColumn,
  onValidate,
}: DatasetValidatorProps) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  
  const handleValidate = async () => {
    setIsValidating(true);
    
    // Simulate async for UX
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const validationResult = validateDataset(data, requiredColumns, timeColumn);
    setResult(validationResult);
    onValidate?.(validationResult);
    
    setIsValidating(false);
  };
  
  const getStatusIcon = (status: ValidationStatus) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      case 'blocker':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };
  
  const getStatusBadge = (status: ValidationStatus) => {
    switch (status) {
      case 'ok':
        return <Badge variant="default" className="bg-success">OK</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-warning text-warning-foreground">Warning</Badge>;
      case 'blocker':
        return <Badge variant="destructive">Blocker</Badge>;
      default:
        return null;
    }
  };
  
  const getIssueIcon = (type: 'error' | 'warning' | 'info') => {
    switch (type) {
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'info':
        return <FileCheck className="h-4 w-4 text-muted-foreground" />;
    }
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Validação de Dataset
          </CardTitle>
          {result && getStatusBadge(result.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            onClick={handleValidate} 
            disabled={isValidating || data.length === 0}
            size="sm"
          >
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validando...
              </>
            ) : (
              <>
                <FileCheck className="mr-2 h-4 w-4" />
                Validar Dataset
              </>
            )}
          </Button>
          <span className="text-sm text-muted-foreground">
            {data.length} linhas, {data.length > 0 ? Object.keys(data[0]).length : 0} colunas
          </span>
        </div>
        
        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              {getStatusIcon(result.status)}
              <div>
                <p className="font-medium">
                  {result.status === 'ok' && 'Dataset válido'}
                  {result.status === 'warning' && 'Dataset com avisos'}
                  {result.status === 'blocker' && 'Dataset com problemas críticos'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result.issues.length === 0 
                    ? 'Nenhum problema encontrado'
                    : `${result.issues.length} item(s) encontrado(s)`
                  }
                </p>
              </div>
            </div>
            
            {/* Issues list */}
            {result.issues.length > 0 && (
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2">
                  {result.issues.map((issue, idx) => (
                    <div 
                      key={idx}
                      className="flex items-start gap-2 p-2 rounded border bg-background"
                    >
                      {getIssueIcon(issue.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{issue.message}</p>
                        {issue.details && (
                          <p className="text-xs text-muted-foreground">{issue.details}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {issue.code}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Coluna de data:</span>
                <span className="ml-2 font-mono">{result.summary.dateColumn || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Gaps de data:</span>
                <span className="ml-2">{result.summary.dateGaps}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duplicatas:</span>
                <span className="ml-2">{result.summary.duplicates}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tipos mistos:</span>
                <span className="ml-2">{result.summary.typeIssues}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DatasetValidator;
