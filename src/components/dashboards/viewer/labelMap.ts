// Centralized label and formatting system for dashboard columns
// All column names should be humanized through this system

export interface ColumnLabel {
  label: string;
  shortLabel?: string;
  description?: string;
  format: 'currency' | 'percent' | 'integer' | 'date' | 'text';
  goalDirection?: 'higher_better' | 'lower_better';
  category?: 'cost' | 'volume' | 'rate' | 'funnel' | 'meta';
}

// Comprehensive label map for all known columns
export const COLUMN_LABELS: Record<string, ColumnLabel> = {
  // Date columns
  dia: { label: 'Data', format: 'date', category: 'meta' },
  date: { label: 'Data', format: 'date', category: 'meta' },
  created_at: { label: 'Criado em', format: 'date', category: 'meta' },
  updated_at: { label: 'Atualizado em', format: 'date', category: 'meta' },
  
  // Cost metrics
  custo_total: { 
    label: 'Investimento', 
    shortLabel: 'Invest.',
    description: 'Total gasto em mídia no período',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  
  // Cost per acquisition metrics
  cpl: { 
    label: 'Custo por Lead', 
    shortLabel: 'CPL',
    description: 'Custo total / Leads gerados',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  cac: { 
    label: 'Custo por Aquisição', 
    shortLabel: 'CAC',
    description: 'Custo total / Vendas realizadas',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  custo_por_entrada: { 
    label: 'Custo por Entrada', 
    shortLabel: 'C/Entrada',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  custo_por_reuniao_agendada: { 
    label: 'Custo por Reunião Agendada', 
    shortLabel: 'C/R.Agend',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  custo_por_reuniao_realizada: { 
    label: 'Custo por Reunião Realizada', 
    shortLabel: 'C/R.Real',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  
  // Volume metrics (funnel)
  leads_total: { 
    label: 'Leads', 
    description: 'Total de leads gerados',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  entrada_total: { 
    label: 'Entradas', 
    shortLabel: 'Entradas',
    description: 'Leads que entraram no pipeline',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  reuniao_agendada_total: { 
    label: 'Reuniões Agendadas', 
    shortLabel: 'R. Agend.',
    description: 'Total de reuniões agendadas',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  reuniao_realizada_total: { 
    label: 'Reuniões Realizadas', 
    shortLabel: 'R. Real.',
    description: 'Total de reuniões que aconteceram',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  venda_total: { 
    label: 'Vendas', 
    description: 'Total de vendas fechadas',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  
  // Loss metrics
  falta_total: { 
    label: 'Faltas', 
    description: 'Reuniões com falta do lead',
    format: 'integer', 
    goalDirection: 'lower_better',
    category: 'funnel' 
  },
  desmarque_total: { 
    label: 'Desmarques', 
    description: 'Reuniões desmarcadas',
    format: 'integer', 
    goalDirection: 'lower_better',
    category: 'funnel' 
  },
  
  // Rate metrics
  taxa_entrada: { 
    label: 'Taxa de Entrada', 
    shortLabel: 'Tx Entrada',
    description: 'Entradas / Leads',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
  taxa_reuniao_agendada: { 
    label: 'Taxa de Agendamento', 
    shortLabel: 'Tx Agend.',
    description: 'Reuniões agendadas / Entradas',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
  taxa_comparecimento: { 
    label: 'Taxa de Comparecimento', 
    shortLabel: 'Tx Compar.',
    description: 'Reuniões realizadas / Reuniões agendadas',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
  taxa_venda_pos_reuniao: { 
    label: 'Taxa de Fechamento', 
    shortLabel: 'Tx Fech.',
    description: 'Vendas / Reuniões realizadas',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
  taxa_venda_total: { 
    label: 'Taxa de Conversão', 
    shortLabel: 'Tx Conv.',
    description: 'Vendas / Leads',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
};

// Get label for a column, with fallback for unknown columns
export function getColumnLabel(key: string, useShort = false): string {
  const config = COLUMN_LABELS[key];
  if (config) {
    return useShort && config.shortLabel ? config.shortLabel : config.label;
  }
  // Fallback: humanize the column name
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/^Taxa /, 'Tx ')
    .replace(/Total$/, '');
}

// Get format type for a column
export function getColumnFormat(key: string): ColumnLabel['format'] {
  const config = COLUMN_LABELS[key];
  if (config) return config.format;
  
  // Infer format from column name
  if (key.includes('custo') || key === 'cpl' || key === 'cac') return 'currency';
  if (key.includes('taxa_') || key.includes('rate')) return 'percent';
  if (key === 'dia' || key === 'date' || key.includes('_at')) return 'date';
  if (key.includes('_total') || key.includes('count')) return 'integer';
  return 'text';
}

// Get goal direction for a column
export function getGoalDirection(key: string): 'higher_better' | 'lower_better' {
  const config = COLUMN_LABELS[key];
  if (config?.goalDirection) return config.goalDirection;
  
  // Infer from column name
  if (key.includes('custo') || key === 'cpl' || key === 'cac' || key.includes('falta') || key.includes('desmarque')) {
    return 'lower_better';
  }
  return 'higher_better';
}

// Format a value based on column config
export function formatColumnValue(value: any, key: string): string {
  if (value === null || value === undefined) return '—';
  
  const format = getColumnFormat(key);
  
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value || 0);
    
    case 'percent':
      // Handle both 0-1 and 0-100 formats
      const pct = typeof value === 'number' && value <= 1 ? value * 100 : value;
      return `${(pct || 0).toFixed(1)}%`;
    
    case 'integer':
      return (value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    
    case 'date':
      if (value instanceof Date) {
        return value.toLocaleDateString('pt-BR');
      }
      try {
        return new Date(value).toLocaleDateString('pt-BR');
      } catch {
        return String(value);
      }
    
    default:
      return String(value);
  }
}

// Get column description (for tooltips)
export function getColumnDescription(key: string): string | undefined {
  return COLUMN_LABELS[key]?.description;
}

// Executive KPIs - the main metrics to show at top
export const EXECUTIVE_KPIS = [
  'custo_total',
  'leads_total',
  'cpl',
  'cac',
  'venda_total',
  'taxa_venda_total',
] as const;

// Funnel stages in order
export const FUNNEL_STAGES = [
  'leads_total',
  'entrada_total',
  'reuniao_agendada_total',
  'reuniao_realizada_total',
  'venda_total',
] as const;

// Loss metrics
export const LOSS_METRICS = [
  'falta_total',
  'desmarque_total',
] as const;

// Rate metrics
export const RATE_METRICS = [
  'taxa_entrada',
  'taxa_reuniao_agendada',
  'taxa_comparecimento',
  'taxa_venda_pos_reuniao',
  'taxa_venda_total',
] as const;
