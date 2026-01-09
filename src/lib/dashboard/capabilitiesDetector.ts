// ============================================================
// CAPABILITIES DETECTOR
// Analyzes dataset to determine what dashboards can be built
// ============================================================
import { DatasetCapabilities } from './types';
import type { ColumnRole } from '@/components/dashboards/wizard/types';

// Patterns for detecting column roles
const PATTERNS = {
  time: [
    /^dia$/i, /^data$/i, /^date$/i, /^created_at/i, /^inserted_at/i,
    /^updated_at/i, /_at$/i, /_date$/i, /_time$/i, /timestamp/i
  ],
  id: [
    /^id$/i, /^lead_id$/i, /^user_id$/i, /^customer_id$/i,
    /^idd$/i, /^uuid$/i, /_id$/i
  ],
  stageFlag: [
    /^st_/i, /^flag_/i, /^is_/i, /^has_/i,
    /entrada/i, /qualificado/i, /agendad[ao]/i, /realizad[ao]/i,
    /venda/i, /perdida/i, /cliente/i, /ativo/i
  ],
  dimension: [
    /origem/i, /source/i, /channel/i, /vendedor/i, /seller/i,
    /unidade/i, /unit/i, /modalidade/i, /categoria/i, /category/i,
    /tipo/i, /type/i, /status/i, /region/i, /cidade/i, /cidade/i
  ],
  currency: [
    /custo/i, /cost/i, /valor/i, /value/i, /price/i, /preco/i,
    /cpl/i, /cac/i, /revenue/i, /receita/i, /spend/i, /gasto/i
  ],
  percent: [
    /^taxa_/i, /^rate_/i, /_rate$/i, /_taxa$/i, /percent/i, /%/
  ],
  metric: [
    /_total$/i, /_count$/i, /_sum$/i, /^total_/i, /^count_/i,
    /quantidade/i, /qtd/i, /amount/i
  ]
};

// Funnel stage ordering (priority order)
const FUNNEL_ORDER = [
  'entrada', 'lead', 'leads',
  'ativo', 'lead_ativo',
  'qualificado',
  'agendada', 'exp_agendada', 'reuniao_agendada',
  'realizada', 'exp_realizada', 'reuniao_realizada',
  'proposta',
  'venda', 'vendas', 'fechado',
  'aluno', 'cliente',
  'perdida', 'perdido', 'churn'
];

/**
 * Generate a hash from column names for schema change detection
 */
function generateSchemaHash(columns: string[]): string {
  const sorted = [...columns].sort().join('|');
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Check if a value looks like a boolean/truthy value
 */
function isTruthyLike(value: any): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === 0 || value === 1;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return ['true', 'false', 'yes', 'no', 'sim', 'não', 'nao', '1', '0', 's', 'n'].includes(lower);
  }
  return false;
}

/**
 * Get funnel order index for a column
 */
function getFunnelOrderIndex(columnName: string): number {
  const lower = columnName.toLowerCase().replace(/^st_/, '');
  for (let i = 0; i < FUNNEL_ORDER.length; i++) {
    if (lower.includes(FUNNEL_ORDER[i])) {
      return i;
    }
  }
  return 999;
}

/**
 * Detect column role from name and sample values
 */
function detectColumnRole(
  columnName: string,
  sampleValues: any[]
): 'time' | 'id' | 'stage_flag' | 'dimension' | 'currency' | 'percent' | 'metric' | 'text' {
  const name = columnName.toLowerCase();
  
  // Check patterns in priority order
  for (const pattern of PATTERNS.time) {
    if (pattern.test(columnName)) return 'time';
  }
  
  for (const pattern of PATTERNS.id) {
    if (pattern.test(columnName)) return 'id';
  }
  
  for (const pattern of PATTERNS.currency) {
    if (pattern.test(columnName)) return 'currency';
  }
  
  for (const pattern of PATTERNS.percent) {
    if (pattern.test(columnName)) return 'percent';
  }
  
  // Check for stage flags (name pattern + truthy-like values)
  for (const pattern of PATTERNS.stageFlag) {
    if (pattern.test(columnName)) {
      // Additional check: sample values should be truthy-like
      const truthyCount = sampleValues.filter(isTruthyLike).length;
      if (truthyCount >= sampleValues.length * 0.5) {
        return 'stage_flag';
      }
    }
  }
  
  for (const pattern of PATTERNS.dimension) {
    if (pattern.test(columnName)) return 'dimension';
  }
  
  for (const pattern of PATTERNS.metric) {
    if (pattern.test(columnName)) return 'metric';
  }
  
  // Infer from values
  const numericCount = sampleValues.filter(v => 
    typeof v === 'number' && Number.isFinite(v)
  ).length;
  
  if (numericCount >= sampleValues.length * 0.8) {
    return 'metric';
  }
  
  // Check for dates
  const dateCount = sampleValues.filter(v => {
    if (!v || typeof v !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}/.test(v);
  }).length;
  
  if (dateCount >= sampleValues.length * 0.8) {
    return 'time';
  }
  
  // Check for dimensions (low cardinality strings)
  const uniqueValues = new Set(sampleValues.filter(v => v != null));
  if (uniqueValues.size <= 20 && uniqueValues.size > 1) {
    return 'dimension';
  }
  
  return 'text';
}

/**
 * Detect dataset capabilities from columns and sample data
 */
export function detectCapabilities(
  columns: string[],
  sampleRows: Record<string, any>[] = []
): DatasetCapabilities {
  const result: DatasetCapabilities = {
    hasTime: false,
    timeColumn: null,
    stageFlagsCount: 0,
    stageFlags: [],
    dimensionsCount: 0,
    dimensions: [],
    metricsCount: 0,
    metrics: [],
    currencyMetrics: [],
    idColumn: null,
    rowCount: sampleRows.length,
    schemaHash: generateSchemaHash(columns),
    columns: columns,
  };
  
  if (columns.length === 0) {
    return result;
  }
  
  // Collect sample values for each column
  const columnSamples: Record<string, any[]> = {};
  for (const col of columns) {
    columnSamples[col] = sampleRows
      .slice(0, 100) // First 100 rows
      .map(row => row[col])
      .filter(v => v !== null && v !== undefined);
  }
  
  // Detect roles for each column
  const stageFlags: { name: string; order: number }[] = [];
  
  for (const col of columns) {
    const role = detectColumnRole(col, columnSamples[col] || []);
    
    switch (role) {
      case 'time':
        if (!result.timeColumn) {
          result.timeColumn = col;
          result.hasTime = true;
        }
        break;
      case 'id':
        if (!result.idColumn) {
          result.idColumn = col;
        }
        break;
      case 'stage_flag':
        stageFlags.push({ name: col, order: getFunnelOrderIndex(col) });
        break;
      case 'dimension':
        result.dimensions.push(col);
        result.dimensionsCount++;
        break;
      case 'currency':
        result.currencyMetrics.push(col);
        result.metrics.push(col);
        result.metricsCount++;
        break;
      case 'percent':
      case 'metric':
        result.metrics.push(col);
        result.metricsCount++;
        break;
    }
  }
  
  // Sort stage flags by funnel order
  stageFlags.sort((a, b) => a.order - b.order);
  result.stageFlags = stageFlags.map(s => s.name);
  result.stageFlagsCount = result.stageFlags.length;
  
  return result;
}

/**
 * Check if capabilities have changed (for binding lock)
 */
export function hasCapabilitiesChanged(
  current: DatasetCapabilities,
  previous: { schemaHash: string; columnNames: string[] }
): { changed: boolean; addedColumns: string[]; removedColumns: string[] } {
  const addedColumns = current.columns.filter(c => !previous.columnNames.includes(c));
  const removedColumns = previous.columnNames.filter(c => !current.columns.includes(c));
  
  return {
    changed: current.schemaHash !== previous.schemaHash,
    addedColumns,
    removedColumns,
  };
}

/**
 * Convert capabilities to ColumnRole array for compatibility
 */
export function capabilitiesToColumnMappings(
  capabilities: DatasetCapabilities
): { column: string; role: ColumnRole }[] {
  const mappings: { column: string; role: ColumnRole }[] = [];
  
  if (capabilities.timeColumn) {
    mappings.push({ column: capabilities.timeColumn, role: 'time' });
  }
  
  if (capabilities.idColumn) {
    mappings.push({ column: capabilities.idColumn, role: 'id_primary' });
  }
  
  for (const col of capabilities.stageFlags) {
    mappings.push({ column: col, role: 'funnel_stage' });
  }
  
  for (const col of capabilities.dimensions) {
    mappings.push({ column: col, role: 'dimension' });
  }
  
  for (const col of capabilities.currencyMetrics) {
    mappings.push({ column: col, role: 'metric_currency' });
  }
  
  for (const col of capabilities.metrics) {
    if (!capabilities.currencyMetrics.includes(col)) {
      mappings.push({ column: col, role: 'metric_numeric' });
    }
  }
  
  return mappings;
}