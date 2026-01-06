// ============================================
// LABEL MAPS & FORMATTING UTILITIES
// Professional naming and formatting for dashboard metrics
// ============================================

export const COLUMN_LABELS: Record<string, string> = {
  // Cost metrics
  custo_total: 'Investimento',
  custo: 'Custo',
  cost: 'Custo',
  
  // Lead metrics
  leads_total: 'Leads',
  leads: 'Leads',
  lead_count: 'Leads',
  
  // Funnel stages
  entrada_total: 'Entradas',
  entradas: 'Entradas',
  entrada: 'Entrada',
  reuniao_agendada_total: 'Reuniões Agendadas',
  reuniao_agendada: 'Reunião Agendada',
  agendamentos: 'Agendamentos',
  reuniao_realizada_total: 'Reuniões Realizadas',
  reuniao_realizada: 'Reunião Realizada',
  comparecimento: 'Comparecimentos',
  venda_total: 'Vendas',
  vendas: 'Vendas',
  venda: 'Venda',
  
  // Efficiency metrics
  cpl: 'CPL',
  cac: 'CAC',
  cpl_medio: 'CPL Médio',
  cac_medio: 'CAC Médio',
  custo_por_entrada: 'Custo por Entrada',
  custo_por_reuniao: 'Custo por Reunião',
  
  // Rates
  taxa_entrada: 'Taxa de Entrada',
  taxa_conversao: 'Taxa de Conversão',
  taxa_comparecimento: 'Taxa de Comparecimento',
  taxa_venda: 'Taxa de Venda',
  taxa_venda_total: 'Taxa de Conversão Final',
  taxa_agendamento: 'Taxa de Agendamento',
  
  // Negatives
  desmarque_total: 'Desmarcações',
  desmarque: 'Desmarcações',
  no_show: 'No-Shows',
  nao_compareceu: 'Não Compareceu',
  
  // Time
  dia: 'Data',
  date: 'Data',
  data: 'Data',
  mes: 'Mês',
  semana: 'Semana',
  periodo: 'Período',
  
  // Other
  canal: 'Canal',
  campanha: 'Campanha',
  fonte: 'Fonte',
  origem: 'Origem',
};

export const COLUMN_FORMATS: Record<string, 'currency' | 'percent' | 'integer' | 'date'> = {
  // Currency
  custo_total: 'currency',
  custo: 'currency',
  cpl: 'currency',
  cac: 'currency',
  cpl_medio: 'currency',
  cac_medio: 'currency',
  custo_por_entrada: 'currency',
  custo_por_reuniao: 'currency',
  investimento: 'currency',
  receita: 'currency',
  valor: 'currency',
  
  // Percent (values in 0-1 range)
  taxa_entrada: 'percent',
  taxa_conversao: 'percent',
  taxa_comparecimento: 'percent',
  taxa_venda: 'percent',
  taxa_venda_total: 'percent',
  taxa_agendamento: 'percent',
  
  // Dates
  dia: 'date',
  date: 'date',
  data: 'date',
  
  // Integers (default)
  leads_total: 'integer',
  entrada_total: 'integer',
  reuniao_agendada_total: 'integer',
  reuniao_realizada_total: 'integer',
  venda_total: 'integer',
  desmarque_total: 'integer',
};

export const GOAL_DIRECTIONS: Record<string, 'higher_better' | 'lower_better'> = {
  // Lower is better
  custo_total: 'lower_better',
  cpl: 'lower_better',
  cac: 'lower_better',
  desmarque_total: 'lower_better',
  
  // Higher is better
  leads_total: 'higher_better',
  entrada_total: 'higher_better',
  venda_total: 'higher_better',
  taxa_entrada: 'higher_better',
  taxa_comparecimento: 'higher_better',
  taxa_venda_total: 'higher_better',
};

/**
 * Get human-readable label for a column
 */
export function getColumnLabel(column: string): string {
  // First check direct match
  if (COLUMN_LABELS[column]) {
    return COLUMN_LABELS[column];
  }
  
  // Convert snake_case to Title Case
  return column
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get format type for a column
 */
export function getColumnFormat(column: string): 'currency' | 'percent' | 'integer' | 'date' {
  if (COLUMN_FORMATS[column]) {
    return COLUMN_FORMATS[column];
  }
  
  // Infer from column name
  if (column.includes('custo') || column.includes('cpl') || column.includes('cac') || column.includes('valor') || column.includes('preco')) {
    return 'currency';
  }
  if (column.includes('taxa') || column.includes('rate') || column.includes('percent')) {
    return 'percent';
  }
  if (column.includes('dia') || column.includes('date') || column.includes('data')) {
    return 'date';
  }
  
  return 'integer';
}

/**
 * Format a value according to its type
 */
export function formatMetricValue(
  value: number | null | undefined, 
  format: 'currency' | 'percent' | 'integer' | 'date'
): string {
  if (value === null || value === undefined || !isFinite(value)) {
    return '—';
  }
  
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    
    case 'percent':
      // Assume values are in 0-1 range
      const percentValue = value > 1 ? value : value * 100;
      return `${percentValue.toFixed(1)}%`;
    
    case 'integer':
      return Math.round(value).toLocaleString('pt-BR');
    
    case 'date':
      return String(value);
    
    default:
      return value.toLocaleString('pt-BR');
  }
}

/**
 * Get goal direction for a metric
 */
export function getGoalDirection(column: string): 'higher_better' | 'lower_better' {
  return GOAL_DIRECTIONS[column] || 'higher_better';
}

/**
 * Calculate delta between current and previous values
 */
export function calculateDelta(current: number, previous: number): {
  percent: number;
  absolute: number;
  isPositive: boolean;
  formatted: string;
} | null {
  if (previous === 0 || !isFinite(previous) || !isFinite(current)) {
    return null;
  }
  
  const absolute = current - previous;
  const percent = (absolute / previous) * 100;
  
  return {
    percent,
    absolute,
    isPositive: percent > 0,
    formatted: `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`,
  };
}
