// Template Engine - Auto-detect column types and generate configurations
// With robust input normalization to prevent crashes

export type ColumnType = 'date' | 'currency' | 'integer' | 'percent' | 'text' | 'unknown';

export interface ColumnConfig {
  key: string;
  type: ColumnType;
  label: string;
  format?: string;
}

export interface TemplateConfig {
  enabledTabs: ('executivo' | 'funil' | 'eficiencia' | 'tendencias' | 'detalhes')[];
  kpis: string[];
  funnelStages: Record<string, string>;
  costMetrics: string[];
  taxaColumns: string[];
  lossColumns: string[];
  dateColumn: string;
  goals: Record<string, number>;
  formatting: Record<string, string>;
}

// Note: NormalizedColumn and NormalizedDataset are now in datasetNormalizer.ts
// These legacy types kept for backward compatibility with existing code
export interface LegacyNormalizedColumn {
  name: string;
  type?: 'string' | 'number' | 'date' | 'boolean' | 'json' | 'unknown';
}

export interface LegacyNormalizedDataset {
  columns: LegacyNormalizedColumn[];
  rows: Record<string, any>[];
  meta?: any;
  warnings: string[];
}

// ============================================================
// NORMALIZATION UTILITIES (never throw, always return safe value)
// ============================================================

/**
 * Normalize any column name input to a safe string
 * Handles: string, {name: string}, {label: string}, number, null, undefined
 * NEVER throws an exception
 */
export function normalizeColumnName(input: any): string {
  try {
    // Null/undefined
    if (input === null || input === undefined) {
      return '';
    }
    
    // Already a string
    if (typeof input === 'string') {
      return input.trim();
    }
    
    // Object with name property
    if (typeof input === 'object' && input !== null) {
      if (typeof input.name === 'string') {
        return input.name.trim();
      }
      if (typeof input.label === 'string') {
        return input.label.trim();
      }
      if (typeof input.key === 'string') {
        return input.key.trim();
      }
      // Try to stringify if it's a simple object
      return '';
    }
    
    // Number, boolean, etc - convert to string
    if (typeof input === 'number' || typeof input === 'boolean') {
      return String(input);
    }
    
    return '';
  } catch {
    return '';
  }
}

/**
 * Normalize an array of column definitions to string[]
 * Handles various input formats safely
 */
export function normalizeColumns(input: any): string[] {
  try {
    if (!input) return [];
    
    if (!Array.isArray(input)) {
      // If it's not an array, try to extract columns from an object
      if (typeof input === 'object') {
        if (Array.isArray(input.columns)) {
          return normalizeColumns(input.columns);
        }
        // Try to get keys from the object
        return Object.keys(input).map(k => normalizeColumnName(k)).filter(Boolean);
      }
      return [];
    }
    
    return input
      .map(col => normalizeColumnName(col))
      .filter(name => name.length > 0);
  } catch {
    return [];
  }
}

/**
 * Normalize dataset from various backend response formats (legacy version)
 * NEVER throws, always returns a valid LegacyNormalizedDataset
 */
export function legacyNormalizeDataset(input: any): LegacyNormalizedDataset {
  const warnings: string[] = [];
  
  try {
    if (!input || typeof input !== 'object') {
      warnings.push('Input is not an object');
      return { columns: [], rows: [], warnings };
    }
    
    let rows: Record<string, any>[] = [];
    let columns: LegacyNormalizedColumn[] = [];
    
    // Extract rows
    if (Array.isArray(input.rows)) {
      rows = input.rows;
    } else if (Array.isArray(input.data)) {
      rows = input.data;
    } else if (Array.isArray(input)) {
      rows = input;
    }
    
    // Normalize rows if they're arrays (convert to objects using columns)
    if (rows.length > 0 && Array.isArray(rows[0])) {
      warnings.push('Rows are arrays, converting to objects');
      const colNames = normalizeColumns(input.columns);
      rows = rows.map((row: any[]) => {
        const obj: Record<string, any> = {};
        row.forEach((val, i) => {
          const key = colNames[i] || `col_${i}`;
          obj[key] = val;
        });
        return obj;
      });
    }
    
    // Extract or infer columns
    if (input.columns) {
      const rawCols = Array.isArray(input.columns) ? input.columns : [];
      columns = rawCols.map((col: any) => {
        if (typeof col === 'string') {
          return { name: col };
        }
        if (typeof col === 'object' && col !== null) {
          return {
            name: normalizeColumnName(col),
            type: col.type || 'unknown'
          };
        }
        return { name: normalizeColumnName(col) };
      }).filter((c: LegacyNormalizedColumn) => c.name.length > 0);
    }
    
    // If no columns found, infer from first row
    if (columns.length === 0 && rows.length > 0) {
      warnings.push('Columns inferred from first row');
      const firstRow = rows[0];
      if (typeof firstRow === 'object' && firstRow !== null) {
        columns = Object.keys(firstRow).map(key => ({ name: key }));
      }
    }
    
    return {
      columns,
      rows,
      meta: input.meta,
      warnings
    } as LegacyNormalizedDataset;
  } catch (error) {
    warnings.push(`Normalization error: ${error instanceof Error ? error.message : 'unknown'}`);
    return { columns: [], rows: [], warnings } as LegacyNormalizedDataset;
  }
}

// ============================================================
// COLUMN TYPE DETECTION (uses normalized input)
// ============================================================

// Patterns for auto-detection
const DATE_PATTERNS = ['dia', 'date', 'created_at', 'updated_at', 'data'];
const CURRENCY_PATTERNS = ['custo', 'cpl', 'cac', 'valor', 'price', 'preco', 'investimento'];
const PERCENT_PATTERNS = ['taxa_', 'rate_', 'percent', 'pct'];
const COUNT_PATTERNS = ['_total', '_count', 'leads', 'vendas', 'entradas'];

export function detectColumnType(columnName: any): ColumnType {
  const key = normalizeColumnName(columnName).toLowerCase();
  
  // Empty or invalid column name
  if (!key) {
    return 'unknown';
  }
  
  // Date columns
  if (DATE_PATTERNS.some(p => key.includes(p) || key === p)) {
    return 'date';
  }
  
  // Percentage columns
  if (PERCENT_PATTERNS.some(p => key.startsWith(p) || key.includes(p))) {
    return 'percent';
  }
  
  // Currency columns
  if (CURRENCY_PATTERNS.some(p => key.includes(p))) {
    return 'currency';
  }
  
  // Count/integer columns
  if (COUNT_PATTERNS.some(p => key.includes(p))) {
    return 'integer';
  }
  
  return 'unknown';
}

export function generateColumnLabel(columnName: any): string {
  const key = normalizeColumnName(columnName);
  
  if (!key) return 'Unknown';
  
  const LABELS: Record<string, string> = {
    dia: 'Data',
    custo_total: 'Custo Total',
    leads_total: 'Leads',
    entrada_total: 'Entradas',
    reuniao_agendada_total: 'Reuniões Agendadas',
    reuniao_realizada_total: 'Reuniões Realizadas',
    venda_total: 'Vendas',
    falta_total: 'Faltas',
    desmarque_total: 'Desmarques',
    cpl: 'CPL',
    cac: 'CAC',
    custo_por_entrada: 'Custo/Entrada',
    custo_por_reuniao_agendada: 'Custo/Reunião Agendada',
    custo_por_reuniao_realizada: 'Custo/Reunião Realizada',
    taxa_entrada: 'Taxa de Entrada',
    taxa_reuniao_agendada: 'Taxa de Agendamento',
    taxa_comparecimento: 'Taxa de Comparecimento',
    taxa_venda_pos_reuniao: 'Taxa de Venda (pós-reunião)',
    taxa_venda_total: 'Taxa de Conversão Total',
  };
  
  return LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function analyzeColumns(columns: any[]): ColumnConfig[] {
  try {
    const normalized = normalizeColumns(columns);
    return normalized.map(key => ({
      key,
      type: detectColumnType(key),
      label: generateColumnLabel(key),
    }));
  } catch {
    return [];
  }
}

// ============================================================
// TEMPLATE CONFIG GENERATION (with full error handling)
// ============================================================

/**
 * Default fallback config when everything else fails
 */
export function getDefaultTemplateConfig(): TemplateConfig {
  return {
    enabledTabs: ['executivo', 'detalhes'],
    kpis: [],
    funnelStages: {},
    costMetrics: [],
    taxaColumns: [],
    lossColumns: [],
    dateColumn: 'dia',
    goals: {},
    formatting: {},
  };
}

export function generateTemplateConfig(
  columns: any[], 
  templateKind: string = 'auto',
  customSpec: Record<string, any> = {}
): TemplateConfig {
  try {
    // Normalize columns first
    const normalizedColumns = normalizeColumns(columns);
    
    // If no columns, return default config
    if (normalizedColumns.length === 0) {
      return getDefaultTemplateConfig();
    }
    
    const analyzed = analyzeColumns(normalizedColumns);
    
    // Find date column
    const dateColumn = analyzed.find(c => c.type === 'date')?.key || 'dia';
    
    // Detect funnel stages
    const funnelKeys = ['leads_total', 'entrada_total', 'reuniao_agendada_total', 'reuniao_realizada_total', 'venda_total'];
    const presentFunnelKeys = funnelKeys.filter(k => normalizedColumns.includes(k));
    
    const funnelStages: Record<string, string> = {};
    presentFunnelKeys.forEach(k => {
      funnelStages[k] = generateColumnLabel(k);
    });
    
    // Detect cost/efficiency metrics (safely)
    const costMetrics = normalizedColumns.filter(c => {
      const lower = c.toLowerCase();
      return lower.includes('custo') || lower === 'cpl' || lower === 'cac';
    });
    
    // Detect taxa columns
    const taxaColumns = normalizedColumns.filter(c => c.toLowerCase().startsWith('taxa_'));
    
    // Detect loss columns
    const lossColumns = normalizedColumns.filter(c => {
      const lower = c.toLowerCase();
      return lower.includes('falta') || lower.includes('desmarque') || lower.includes('perdido');
    });
    
    // Determine which tabs to enable
    const enabledTabs: TemplateConfig['enabledTabs'] = ['executivo', 'detalhes'];
    
    if (presentFunnelKeys.length >= 3) {
      enabledTabs.push('funil');
    }
    
    if (costMetrics.length >= 2) {
      enabledTabs.push('eficiencia');
    }
    
    if (normalizedColumns.some(c => c.toLowerCase() === 'cpl' || c.toLowerCase() === 'cac') || taxaColumns.length > 0) {
      enabledTabs.push('tendencias');
    }
    
    // Sort tabs in order
    const tabOrder = ['executivo', 'funil', 'eficiencia', 'tendencias', 'detalhes'] as const;
    enabledTabs.sort((a, b) => tabOrder.indexOf(a) - tabOrder.indexOf(b));
    
    // KPIs for executive view
    const kpis = [
      ...presentFunnelKeys.slice(0, 5),
      ...costMetrics.filter(c => c.toLowerCase() === 'cpl' || c.toLowerCase() === 'cac'),
    ].slice(0, 7);
    
    // Formatting map
    const formatting: Record<string, string> = {};
    analyzed.forEach(col => {
      if (col.type === 'currency') formatting[col.key] = 'currency';
      if (col.type === 'percent') formatting[col.key] = 'percent';
      if (col.type === 'integer') formatting[col.key] = 'integer';
    });
    
    // Merge with custom spec
    return {
      enabledTabs: customSpec.enabledTabs || enabledTabs,
      kpis: customSpec.kpis || kpis,
      funnelStages: customSpec.funnelStages || funnelStages,
      costMetrics: customSpec.costMetrics || costMetrics,
      taxaColumns: customSpec.taxaColumns || taxaColumns,
      lossColumns: customSpec.lossColumns || lossColumns,
      dateColumn: customSpec.dateColumn || dateColumn,
      goals: customSpec.goals || {},
      formatting: { ...formatting, ...customSpec.formatting },
    };
  } catch (error) {
    console.error('generateTemplateConfig error:', error);
    return getDefaultTemplateConfig();
  }
}

// Afonsina template preset
export const AFONSINA_TEMPLATE: Partial<TemplateConfig> = {
  enabledTabs: ['executivo', 'funil', 'eficiencia', 'tendencias', 'detalhes'],
  kpis: ['custo_total', 'leads_total', 'entrada_total', 'reuniao_realizada_total', 'venda_total', 'cpl', 'cac'],
  funnelStages: {
    leads_total: 'Leads',
    entrada_total: 'Entradas',
    reuniao_agendada_total: 'Reuniões Agendadas',
    reuniao_realizada_total: 'Reuniões Realizadas',
    venda_total: 'Vendas',
  },
  goals: {
    cpl: 20,
    cac: 200,
    taxa_entrada: 0.2,
    taxa_comparecimento: 0.7,
  },
};

// ============================================================
// DIAGNOSTIC UTILITIES (for admin debugging)
// ============================================================

export interface DiagnosticInfo {
  columnsType: string;
  columnsCount: number;
  columnsSample: string[];
  rowsCount: number;
  firstRowKeys: string[];
  templateChosen: string;
  enabledTabs: string[];
  warnings: string[];
}

export function getDiagnosticInfo(
  rawColumns: any,
  rawRows: any[],
  templateConfig: TemplateConfig
): DiagnosticInfo {
  const warnings: string[] = [];
  
  // Check columns type
  let columnsType: string = typeof rawColumns;
  if (Array.isArray(rawColumns)) {
    if (rawColumns.length > 0) {
      columnsType = `array of ${typeof rawColumns[0]}`;
    } else {
      columnsType = 'empty array';
    }
  }
  
  // Check for potential issues
  if (!rawColumns) {
    warnings.push('No columns provided');
  }
  if (Array.isArray(rawColumns) && rawColumns.length > 0 && typeof rawColumns[0] !== 'string') {
    warnings.push('Columns are not strings');
  }
  if (!Array.isArray(rawRows)) {
    warnings.push('Rows is not an array');
  }
  if (Array.isArray(rawRows) && rawRows.length === 0) {
    warnings.push('Rows array is empty');
  }
  
  const normalized = normalizeColumns(rawColumns);
  
  return {
    columnsType,
    columnsCount: normalized.length,
    columnsSample: normalized.slice(0, 10),
    rowsCount: Array.isArray(rawRows) ? rawRows.length : 0,
    firstRowKeys: Array.isArray(rawRows) && rawRows.length > 0 && typeof rawRows[0] === 'object' 
      ? Object.keys(rawRows[0]).slice(0, 15) 
      : [],
    templateChosen: templateConfig.enabledTabs.length > 2 ? 'auto-detected' : 'basic',
    enabledTabs: templateConfig.enabledTabs,
    warnings,
  };
}
