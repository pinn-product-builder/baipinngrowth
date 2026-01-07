/**
 * CRM/Kommo Table Adapter
 * Detects and normalizes CRM lead tables with text columns
 * Converts funnel stages to boolean counts, handles dimension consolidation
 */

// =====================================================
// TRUTHY PARSER (handles text booleans)
// =====================================================

const TRUTHY_VALUES = new Set([
  '1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'ativo', 'realizado', 'agendado', 'ganho'
]);

const FALSY_VALUES = new Set([
  '0', 'false', 'nao', 'não', 'n', 'no', '', 'null', 'undefined', 'vazio', 'pendente'
]);

/**
 * Parse text value as boolean
 * Accepts: 1, true, sim, s, yes, y, ok, x
 * Rejects: 0, false, nao, não, n, no, vazio, null
 */
export function parseTruthy(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  
  const normalized = String(value).toLowerCase().trim();
  if (TRUTHY_VALUES.has(normalized)) return true;
  if (FALSY_VALUES.has(normalized)) return false;
  
  // Non-empty string that's not explicitly falsy = truthy
  return normalized.length > 0;
}

// =====================================================
// CRM FIELD PATTERNS
// =====================================================

export const CRM_INDICATORS = [
  'lead_id', 'created_at', 'unidade', 'vendedora', 'vendedor', 'origem',
  'entrada', 'qualificado', 'venda', 'perdida', 'exp_agendada', 'exp_realizada'
];

export const CRM_TIME_COLUMNS = ['created_at', 'data', 'dia', 'date', 'data_criacao'];

export const CRM_ID_COLUMNS = ['lead_id', 'id_lead', 'id'];

export const CRM_DIMENSION_COLUMNS = [
  'unidade', 'vendedora', 'vendedor', 'modalidade', 'origem', 'retencao',
  'fonte', 'campanha', 'canal', 'produto', 'servico'
];

export const CRM_FUNNEL_STAGES = [
  { key: 'entrada', label: 'Entradas', order: 1 },
  { key: 'lead_ativo', label: 'Leads Ativos', order: 2 },
  { key: 'qualificado', label: 'Qualificados', order: 3 },
  { key: 'exp_nao_confirmada', label: 'Exp. Não Confirmada', order: 4 },
  { key: 'exp_agendada', label: 'Exp. Agendadas', order: 5 },
  { key: 'faltou_exp', label: 'Faltou Exp.', order: 6 },
  { key: 'reagendou', label: 'Reagendou', order: 7 },
  { key: 'exp_realizada', label: 'Exp. Realizadas', order: 8 },
  { key: 'venda', label: 'Vendas', order: 9 },
  { key: 'perdida', label: 'Perdidas', order: 10 }
];

export const CRM_STATUS_FLAGS = ['aluno_ativo', 'lead_ativo'];

// =====================================================
// DETECTION FUNCTIONS
// =====================================================

export interface CRMColumnMapping {
  timeColumn: string | null;
  idColumn: string | null;
  dimensions: string[];
  funnelStages: { column: string; label: string; order: number }[];
  statusFlags: string[];
  unitFlags: { columns: string[]; resolvedDimension: string };
}

/**
 * Detect if dataset is a CRM leads funnel table
 * Returns true if at least 3 CRM indicator columns are present
 */
export function isCRMDataset(columnNames: string[]): boolean {
  const lowerColumns = columnNames.map(c => c.toLowerCase());
  const matchCount = CRM_INDICATORS.filter(indicator => 
    lowerColumns.some(col => col.includes(indicator))
  ).length;
  
  return matchCount >= 3;
}

/**
 * Analyze CRM dataset columns and map them to roles
 */
export function analyzeCRMColumns(columnNames: string[]): CRMColumnMapping {
  const lowerColumns = new Map(columnNames.map(c => [c.toLowerCase(), c]));
  
  // Find time column
  let timeColumn: string | null = null;
  for (const tc of CRM_TIME_COLUMNS) {
    for (const [lower, original] of lowerColumns) {
      if (lower === tc || lower.includes(tc)) {
        timeColumn = original;
        break;
      }
    }
    if (timeColumn) break;
  }
  
  // Find ID column
  let idColumn: string | null = null;
  for (const idc of CRM_ID_COLUMNS) {
    for (const [lower, original] of lowerColumns) {
      if (lower === idc) {
        idColumn = original;
        break;
      }
    }
    if (idColumn) break;
  }
  
  // Find dimensions
  const dimensions: string[] = [];
  for (const dim of CRM_DIMENSION_COLUMNS) {
    for (const [lower, original] of lowerColumns) {
      if (lower === dim || lower.startsWith(dim + '_')) {
        dimensions.push(original);
      }
    }
  }
  
  // Find funnel stages
  const funnelStages: { column: string; label: string; order: number }[] = [];
  for (const stage of CRM_FUNNEL_STAGES) {
    for (const [lower, original] of lowerColumns) {
      if (lower === stage.key || lower.startsWith(stage.key + '_')) {
        funnelStages.push({
          column: original,
          label: stage.label,
          order: stage.order
        });
        break;
      }
    }
  }
  
  // Sort funnel stages by order
  funnelStages.sort((a, b) => a.order - b.order);
  
  // Find status flags
  const statusFlags: string[] = [];
  for (const flag of CRM_STATUS_FLAGS) {
    for (const [lower, original] of lowerColumns) {
      if (lower === flag) {
        statusFlags.push(original);
      }
    }
  }
  
  // Find unit flags (unidade_01_*, unidade_02_*, etc.)
  const unitFlagColumns: string[] = [];
  for (const [lower, original] of lowerColumns) {
    if (/^unidade_\d{2}_/.test(lower)) {
      unitFlagColumns.push(original);
    }
  }
  
  return {
    timeColumn,
    idColumn,
    dimensions,
    funnelStages,
    statusFlags,
    unitFlags: {
      columns: unitFlagColumns,
      resolvedDimension: 'unidade_resolvida'
    }
  };
}

// =====================================================
// DATE PARSING (handles various text formats)
// =====================================================

const DATE_PATTERNS = [
  // ISO formats
  /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
  // Brazilian formats
  /^(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
  /^(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
];

export interface ParsedDate {
  date: Date;
  day: string; // YYYY-MM-DD format for grouping
}

/**
 * Parse date from text, detecting format automatically
 */
export function parseTextDate(value: any): ParsedDate | null {
  if (!value) return null;
  
  const text = String(value).trim();
  
  // Try ISO format first
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const date = new Date(isoMatch[0]);
    if (!isNaN(date.getTime())) {
      return {
        date,
        day: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      };
    }
  }
  
  // Try Brazilian DD/MM/YYYY
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [_, day, month, year] = brMatch;
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime())) {
      return {
        date,
        day: `${year}-${month}-${day}`
      };
    }
  }
  
  // Try DD-MM-YYYY
  const brDashMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (brDashMatch) {
    const [_, day, month, year] = brDashMatch;
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime())) {
      return {
        date,
        day: `${year}-${month}-${day}`
      };
    }
  }
  
  // Try native Date parsing as fallback
  const date = new Date(text);
  if (!isNaN(date.getTime())) {
    const day = date.toISOString().split('T')[0];
    return { date, day };
  }
  
  return null;
}

/**
 * Detect date format from sample values
 */
export function detectDateFormat(samples: string[]): 'iso' | 'br' | 'br-dash' | 'unknown' {
  if (!samples || samples.length === 0) return 'unknown';
  
  const validSamples = samples.filter(s => s && String(s).trim().length > 0);
  if (validSamples.length === 0) return 'unknown';
  
  // Check first few samples
  for (const sample of validSamples.slice(0, 5)) {
    const text = String(sample).trim();
    
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return 'iso';
    if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) return 'br';
    if (/^\d{2}-\d{2}-\d{4}/.test(text)) return 'br-dash';
  }
  
  return 'unknown';
}

// =====================================================
// UNIT FLAG RESOLUTION
// =====================================================

/**
 * Resolve unidade_XX_* flags to a single dimension value
 * Looks for the first truthy unidade_XX_nome value
 */
export function resolveUnitFromFlags(row: Record<string, any>, unitFlagColumns: string[]): string | null {
  // Sort by column name to get consistent order
  const sorted = [...unitFlagColumns].sort();
  
  for (const col of sorted) {
    const value = row[col];
    if (parseTruthy(value)) {
      // Extract unit name from column name (e.g., unidade_01_estrela_sul -> estrela_sul)
      const match = col.match(/^unidade_\d{2}_(.+)$/i);
      if (match) {
        return match[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
    }
  }
  
  return null;
}

// =====================================================
// DERIVED DATASET AGGREGATION
// =====================================================

export interface DerivedDayRow {
  dia: string;
  leads_total: number;
  entrada_total: number;
  lead_ativo_total: number;
  qualificado_total: number;
  exp_agendada_total: number;
  exp_realizada_total: number;
  faltou_exp_total: number;
  reagendou_total: number;
  venda_total: number;
  perdida_total: number;
  // Rates
  taxa_entrada: number;
  taxa_qualificado: number;
  taxa_agendada: number;
  taxa_comparecimento: number;
  taxa_venda: number;
  taxa_perda: number;
  // Additional dimension counts (optional)
  [key: string]: string | number;
}

/**
 * Aggregate CRM raw data into daily funnel metrics
 */
export function aggregateCRMDataByDay(
  rows: Record<string, any>[],
  mapping: CRMColumnMapping
): DerivedDayRow[] {
  if (!mapping.timeColumn) {
    console.warn('No time column found for CRM aggregation');
    return [];
  }
  
  // Group by day
  const dayGroups = new Map<string, Record<string, any>[]>();
  
  for (const row of rows) {
    const parsedDate = parseTextDate(row[mapping.timeColumn]);
    if (!parsedDate) continue;
    
    const day = parsedDate.day;
    if (!dayGroups.has(day)) {
      dayGroups.set(day, []);
    }
    dayGroups.get(day)!.push(row);
  }
  
  // Create stage column map for quick lookup
  const stageColumns = new Map<string, string>();
  for (const stage of mapping.funnelStages) {
    // Map stage key to actual column name
    const stageKey = stage.column.toLowerCase().replace(/_.*$/, '');
    stageColumns.set(stageKey, stage.column);
  }
  
  // Aggregate each day
  const result: DerivedDayRow[] = [];
  
  for (const [day, dayRows] of dayGroups) {
    const leadsTotal = dayRows.length;
    
    // Count funnel stages
    const countStage = (key: string): number => {
      const column = mapping.funnelStages.find(s => 
        s.column.toLowerCase().includes(key)
      )?.column;
      
      if (!column) return 0;
      return dayRows.filter(r => parseTruthy(r[column])).length;
    };
    
    const entradaTotal = countStage('entrada');
    const leadAtivoTotal = countStage('lead_ativo');
    const qualificadoTotal = countStage('qualificado');
    const expAgendadaTotal = countStage('exp_agendada');
    const expRealizadaTotal = countStage('exp_realizada');
    const faltouExpTotal = countStage('faltou_exp');
    const reagendouTotal = countStage('reagendou');
    const vendaTotal = countStage('venda');
    const perdidaTotal = countStage('perdida');
    
    // Calculate rates (safe division)
    const safeDiv = (a: number, b: number): number => b > 0 ? a / b : 0;
    
    result.push({
      dia: day,
      leads_total: leadsTotal,
      entrada_total: entradaTotal,
      lead_ativo_total: leadAtivoTotal,
      qualificado_total: qualificadoTotal,
      exp_agendada_total: expAgendadaTotal,
      exp_realizada_total: expRealizadaTotal,
      faltou_exp_total: faltouExpTotal,
      reagendou_total: reagendouTotal,
      venda_total: vendaTotal,
      perdida_total: perdidaTotal,
      // Rates
      taxa_entrada: safeDiv(entradaTotal, leadsTotal),
      taxa_qualificado: safeDiv(qualificadoTotal, leadsTotal),
      taxa_agendada: safeDiv(expAgendadaTotal, leadsTotal),
      taxa_comparecimento: safeDiv(expRealizadaTotal, expAgendadaTotal),
      taxa_venda: safeDiv(vendaTotal, expRealizadaTotal),
      taxa_perda: safeDiv(perdidaTotal, leadsTotal)
    });
  }
  
  // Sort by date
  result.sort((a, b) => a.dia.localeCompare(b.dia));
  
  return result;
}

// =====================================================
// CRM DASHBOARD SPEC GENERATION
// =====================================================

export interface CRMDashboardSpec {
  version: number;
  title: string;
  dataset_kind: 'crm_leads_funnel';
  time: { column: string; type: string };
  columns: { name: string; type: string; label: string; scale?: string }[];
  kpis: { label: string; column: string; agg: string; format: string; goalDirection: string }[];
  funnel: { steps: { label: string; column: string }[] };
  charts: any[];
  dimensions: { name: string; column: string }[];
  ui: { tabs: string[]; defaultTab: string; comparePeriods: boolean; dimensionBreakdowns: boolean };
}

/**
 * Generate dashboard spec for CRM leads funnel dataset
 */
export function generateCRMDashboardSpec(
  datasetName: string,
  mapping: CRMColumnMapping,
  derivedColumns?: string[]
): CRMDashboardSpec {
  const spec: CRMDashboardSpec = {
    version: 1,
    title: datasetName,
    dataset_kind: 'crm_leads_funnel',
    time: { column: 'dia', type: 'date' },
    columns: [
      { name: 'dia', type: 'date', label: 'Data' },
      { name: 'leads_total', type: 'number', label: 'Leads' },
      { name: 'entrada_total', type: 'number', label: 'Entradas' },
      { name: 'qualificado_total', type: 'number', label: 'Qualificados' },
      { name: 'exp_agendada_total', type: 'number', label: 'Exp. Agendadas' },
      { name: 'exp_realizada_total', type: 'number', label: 'Exp. Realizadas' },
      { name: 'venda_total', type: 'number', label: 'Vendas' },
      { name: 'perdida_total', type: 'number', label: 'Perdidas' },
      { name: 'taxa_entrada', type: 'percent', label: 'Taxa Entrada', scale: '0to1' },
      { name: 'taxa_qualificado', type: 'percent', label: 'Taxa Qualificação', scale: '0to1' },
      { name: 'taxa_agendada', type: 'percent', label: 'Taxa Agendamento', scale: '0to1' },
      { name: 'taxa_comparecimento', type: 'percent', label: 'Taxa Comparecimento', scale: '0to1' },
      { name: 'taxa_venda', type: 'percent', label: 'Taxa Venda', scale: '0to1' },
      { name: 'taxa_perda', type: 'percent', label: 'Taxa Perda', scale: '0to1' },
    ],
    kpis: [
      { label: 'Leads Total', column: 'leads_total', agg: 'sum', format: 'integer', goalDirection: 'higher_better' },
      { label: 'Qualificados', column: 'qualificado_total', agg: 'sum', format: 'integer', goalDirection: 'higher_better' },
      { label: 'Exp. Agendadas', column: 'exp_agendada_total', agg: 'sum', format: 'integer', goalDirection: 'higher_better' },
      { label: 'Exp. Realizadas', column: 'exp_realizada_total', agg: 'sum', format: 'integer', goalDirection: 'higher_better' },
      { label: 'Vendas', column: 'venda_total', agg: 'sum', format: 'integer', goalDirection: 'higher_better' },
      { label: 'Taxa Comparecimento', column: 'taxa_comparecimento', agg: 'avg', format: 'percent', goalDirection: 'higher_better' },
      { label: 'Taxa Venda', column: 'taxa_venda', agg: 'avg', format: 'percent', goalDirection: 'higher_better' },
    ],
    funnel: {
      steps: [
        { label: 'Leads', column: 'leads_total' },
        { label: 'Entradas', column: 'entrada_total' },
        { label: 'Qualificados', column: 'qualificado_total' },
        { label: 'Exp. Agendadas', column: 'exp_agendada_total' },
        { label: 'Exp. Realizadas', column: 'exp_realizada_total' },
        { label: 'Vendas', column: 'venda_total' }
      ]
    },
    charts: [
      {
        type: 'line',
        title: 'Volume Diário',
        x: 'dia',
        series: [
          { label: 'Leads', y: 'leads_total', format: 'number' },
          { label: 'Qualificados', y: 'qualificado_total', format: 'number' },
          { label: 'Vendas', y: 'venda_total', format: 'number' }
        ]
      },
      {
        type: 'line',
        title: 'Taxas de Conversão',
        x: 'dia',
        series: [
          { label: 'Comparecimento', y: 'taxa_comparecimento', format: 'percent' },
          { label: 'Venda', y: 'taxa_venda', format: 'percent' }
        ]
      }
    ],
    dimensions: mapping.dimensions.map(d => ({
      name: d.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      column: d
    })),
    ui: {
      tabs: ['Decisões', 'Executivo', 'Funil', 'Tendências', 'Quebras', 'Detalhes'],
      defaultTab: 'Decisões',
      comparePeriods: true,
      dimensionBreakdowns: mapping.dimensions.length > 0
    }
  };
  
  // Add dimension breakdown tab if we have dimensions
  if (mapping.dimensions.length === 0) {
    spec.ui.tabs = spec.ui.tabs.filter(t => t !== 'Quebras');
    spec.ui.dimensionBreakdowns = false;
  }
  
  return spec;
}

// =====================================================
// EXPORT ALL
// =====================================================

export default {
  parseTruthy,
  isCRMDataset,
  analyzeCRMColumns,
  parseTextDate,
  detectDateFormat,
  resolveUnitFromFlags,
  aggregateCRMDataByDay,
  generateCRMDashboardSpec
};
