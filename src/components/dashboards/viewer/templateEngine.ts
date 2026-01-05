// Template Engine - Auto-detect column types and generate configurations

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

// Patterns for auto-detection
const DATE_PATTERNS = ['dia', 'date', 'created_at', 'updated_at', 'data'];
const CURRENCY_PATTERNS = ['custo', 'cpl', 'cac', 'valor', 'price', 'preco', 'investimento'];
const PERCENT_PATTERNS = ['taxa_', 'rate_', 'percent', 'pct'];
const COUNT_PATTERNS = ['_total', '_count', 'leads', 'vendas', 'entradas'];

export function detectColumnType(columnName: string): ColumnType {
  const lowerName = columnName.toLowerCase();
  
  // Date columns
  if (DATE_PATTERNS.some(p => lowerName.includes(p) || lowerName === p)) {
    return 'date';
  }
  
  // Percentage columns
  if (PERCENT_PATTERNS.some(p => lowerName.startsWith(p) || lowerName.includes(p))) {
    return 'percent';
  }
  
  // Currency columns
  if (CURRENCY_PATTERNS.some(p => lowerName.includes(p))) {
    return 'currency';
  }
  
  // Count/integer columns
  if (COUNT_PATTERNS.some(p => lowerName.includes(p))) {
    return 'integer';
  }
  
  return 'unknown';
}

export function generateColumnLabel(columnName: string): string {
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
  
  return LABELS[columnName] || columnName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function analyzeColumns(columns: string[]): ColumnConfig[] {
  return columns.map(key => ({
    key,
    type: detectColumnType(key),
    label: generateColumnLabel(key),
  }));
}

export function generateTemplateConfig(
  columns: string[], 
  templateKind: string = 'auto',
  customSpec: Record<string, any> = {}
): TemplateConfig {
  const analyzed = analyzeColumns(columns);
  
  // Find date column
  const dateColumn = analyzed.find(c => c.type === 'date')?.key || 'dia';
  
  // Detect funnel stages
  const funnelKeys = ['leads_total', 'entrada_total', 'reuniao_agendada_total', 'reuniao_realizada_total', 'venda_total'];
  const presentFunnelKeys = funnelKeys.filter(k => columns.includes(k));
  
  const funnelStages: Record<string, string> = {};
  presentFunnelKeys.forEach(k => {
    funnelStages[k] = generateColumnLabel(k);
  });
  
  // Detect cost/efficiency metrics
  const costMetrics = columns.filter(c => 
    c.includes('custo') || c === 'cpl' || c === 'cac'
  );
  
  // Detect taxa columns
  const taxaColumns = columns.filter(c => c.startsWith('taxa_'));
  
  // Detect loss columns
  const lossColumns = columns.filter(c => 
    c.includes('falta') || c.includes('desmarque') || c.includes('perdido')
  );
  
  // Determine which tabs to enable
  const enabledTabs: TemplateConfig['enabledTabs'] = ['executivo', 'detalhes'];
  
  if (presentFunnelKeys.length >= 3) {
    enabledTabs.push('funil');
  }
  
  if (costMetrics.length >= 2) {
    enabledTabs.push('eficiencia');
  }
  
  if (columns.includes('cpl') || columns.includes('cac') || taxaColumns.length > 0) {
    enabledTabs.push('tendencias');
  }
  
  // Sort tabs in order
  const tabOrder = ['executivo', 'funil', 'eficiencia', 'tendencias', 'detalhes'] as const;
  enabledTabs.sort((a, b) => tabOrder.indexOf(a) - tabOrder.indexOf(b));
  
  // KPIs for executive view
  const kpis = [
    ...presentFunnelKeys.slice(0, 5),
    ...costMetrics.filter(c => c === 'cpl' || c === 'cac'),
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
    enabledTabs,
    kpis: customSpec.kpis || kpis,
    funnelStages: customSpec.funnelStages || funnelStages,
    costMetrics: customSpec.costMetrics || costMetrics,
    taxaColumns: customSpec.taxaColumns || taxaColumns,
    lossColumns: customSpec.lossColumns || lossColumns,
    dateColumn: customSpec.dateColumn || dateColumn,
    goals: customSpec.goals || {},
    formatting: { ...formatting, ...customSpec.formatting },
  };
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
