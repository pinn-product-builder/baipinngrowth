// ============================================================
// MINIMUM GUARANTEED VIEW
// Fallback view that always renders something useful
// Overview + Table - never empty
// ============================================================

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Database, 
  Rows3, 
  Hash, 
  CheckCircle2, 
  AlertTriangle,
  Download,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DatasetCapabilities } from '@/lib/dashboard/types';

interface MinimumGuaranteedViewProps {
  /** Raw data rows */
  data: Record<string, any>[];
  /** Detected capabilities */
  capabilities: DatasetCapabilities;
  /** Warnings from detection */
  warnings?: string[];
  /** Row click handler */
  onRowClick?: (row: any, index: number) => void;
  /** Export handler */
  onExport?: () => void;
  /** Search term */
  searchTerm?: string;
  /** Search handler */
  onSearchChange?: (term: string) => void;
  /** Additional className */
  className?: string;
}

/**
 * Minimum Guaranteed View
 * Always renders Overview KPIs + Data Table
 * This is the fallback when nothing else works
 */
export default function MinimumGuaranteedView({
  data,
  capabilities,
  warnings = [],
  onRowClick,
  onExport,
  searchTerm = '',
  onSearchChange,
  className,
}: MinimumGuaranteedViewProps) {
  // Filter data by search term
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(row => 
      Object.values(row).some(v => 
        String(v).toLowerCase().includes(term)
      )
    );
  }, [data, searchTerm]);

  // Limit columns to display (max 10)
  const displayColumns = useMemo(() => {
    return capabilities.columns.slice(0, 10);
  }, [capabilities.columns]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Overview Section - Always Present */}
      <OverviewSection 
        data={data} 
        capabilities={capabilities}
        warnings={warnings}
      />
      
      {/* Data Table - Always Present */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Rows3 className="h-4 w-4" />
              Dados ({filteredData.length} de {data.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              {onSearchChange && (
                <div className="relative">
                  <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-sm border rounded-md w-48 bg-background"
                  />
                </div>
              )}
              {onExport && (
                <Button variant="outline" size="sm" onClick={onExport}>
                  <Download className="h-4 w-4 mr-1" />
                  CSV
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr>
                  {displayColumns.map(col => (
                    <th key={col} className="px-4 py-3 text-left font-medium whitespace-nowrap">
                      {formatColumnLabel(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(0, 100).map((row, i) => (
                  <tr 
                    key={i} 
                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => onRowClick?.(row, i)}
                  >
                    {displayColumns.map(col => (
                      <td key={col} className="px-4 py-2 whitespace-nowrap">
                        {formatCellValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredData.length > 100 && (
            <div className="p-3 border-t text-center text-sm text-muted-foreground">
              Exibindo 100 de {filteredData.length} linhas
            </div>
          )}
          {filteredData.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              {searchTerm ? 'Nenhum resultado encontrado' : 'Sem dados para exibir'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Overview Section with guaranteed KPIs
 */
function OverviewSection({ 
  data, 
  capabilities,
  warnings,
}: { 
  data: Record<string, any>[];
  capabilities: DatasetCapabilities;
  warnings: string[];
}) {
  // Calculate basic KPIs that are always available
  const kpis = useMemo(() => {
    const result: { key: string; label: string; value: number | string; icon: React.ReactNode }[] = [];
    
    // Total records - always available
    result.push({
      key: 'total_records',
      label: 'Total de Registros',
      value: data.length,
      icon: <Rows3 className="h-5 w-5" />,
    });
    
    // Unique IDs if detected
    if (capabilities.idColumn && data.length > 0) {
      const uniqueIds = new Set(data.map(r => r[capabilities.idColumn!])).size;
      result.push({
        key: 'unique_ids',
        label: 'IDs Únicos',
        value: uniqueIds,
        icon: <Hash className="h-5 w-5" />,
      });
    }
    
    // First stage flag count if available
    if (capabilities.stageFlags.length > 0 && data.length > 0) {
      const firstStage = capabilities.stageFlags[0];
      const stageCount = data.filter(r => {
        const val = r[firstStage];
        return val === true || val === 1 || val === '1' || val === 'true' || val === 'sim' || val === 'yes';
      }).length;
      result.push({
        key: 'first_stage',
        label: formatColumnLabel(firstStage),
        value: stageCount,
        icon: <CheckCircle2 className="h-5 w-5" />,
      });
    }
    
    // First metric sum if available
    if (capabilities.metrics.length > 0 && data.length > 0) {
      const firstMetric = capabilities.metrics[0];
      const sum = data.reduce((acc, r) => {
        const val = parseFloat(r[firstMetric]);
        return acc + (isFinite(val) ? val : 0);
      }, 0);
      
      const isCurrency = capabilities.currencyMetrics.includes(firstMetric);
      result.push({
        key: 'first_metric',
        label: formatColumnLabel(firstMetric),
        value: isCurrency 
          ? `R$ ${sum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          : sum.toLocaleString('pt-BR'),
        icon: <Database className="h-5 w-5" />,
      });
    }
    
    return result.slice(0, 4); // Max 4 KPIs
  }, [data, capabilities]);

  return (
    <div className="space-y-4">
      {/* Warnings banner */}
      {warnings.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-warning">
              {warnings.length === 1 ? 'Aviso' : `${warnings.length} avisos`}
            </p>
            <p className="text-xs text-muted-foreground">{warnings[0]}</p>
          </div>
          {warnings.length > 1 && (
            <Badge variant="outline" className="text-xs">
              +{warnings.length - 1}
            </Badge>
          )}
        </div>
      )}
      
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <Card key={kpi.key}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {kpi.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                  <p className="text-xl font-semibold">
                    {typeof kpi.value === 'number' ? kpi.value.toLocaleString('pt-BR') : kpi.value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Status card */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Dados carregados</span>
            </div>
            <span className="text-muted-foreground">•</span>
            <span>{capabilities.columns.length} colunas</span>
            {capabilities.hasTime && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-green-600">Série temporal</span>
              </>
            )}
            {capabilities.stageFlagsCount >= 3 && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-blue-600">Funil ({capabilities.stageFlagsCount} etapas)</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper: Format column name to display label
function formatColumnLabel(colName: string): string {
  return colName
    .replace(/^(st_|flag_|is_|has_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Helper: Format cell value for display
function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    if (!isFinite(value)) return '—';
    return value.toLocaleString('pt-BR');
  }
  if (value instanceof Date) {
    return value.toLocaleDateString('pt-BR');
  }
  const str = String(value);
  return str.length > 50 ? str.slice(0, 50) + '…' : str;
}
