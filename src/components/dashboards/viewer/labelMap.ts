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
  day: { label: 'Data', format: 'date', category: 'meta' },
  date: { label: 'Data', format: 'date', category: 'meta' },
  created_at: { label: 'Criado em', format: 'date', category: 'meta' },
  updated_at: { label: 'Atualizado em', format: 'date', category: 'meta' },
  
  // Cost metrics (v3 and legacy)
  spend: { 
    label: 'Investimento', 
    shortLabel: 'Invest.',
    description: 'Total gasto em mídia no período',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  spend_7d: { 
    label: 'Investimento 7d', 
    shortLabel: 'Invest. 7d',
    description: 'Total gasto em mídia nos últimos 7 dias',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  spend_30d: { 
    label: 'Investimento 30d', 
    shortLabel: 'Invest. 30d',
    description: 'Total gasto em mídia nos últimos 30 dias',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  custo_total: { 
    label: 'Investimento', 
    shortLabel: 'Invest.',
    description: 'Total gasto em mídia no período',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  
  // Cost per acquisition metrics (v3 and legacy)
  cpl: { 
    label: 'Custo por Lead', 
    shortLabel: 'CPL',
    description: 'Custo total / Leads gerados',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  cpl_7d: { 
    label: 'CPL 7d', 
    shortLabel: 'CPL 7d',
    description: 'Custo por Lead nos últimos 7 dias',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  cpl_30d: { 
    label: 'CPL 30d', 
    shortLabel: 'CPL 30d',
    description: 'Custo por Lead nos últimos 30 dias',
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
  cpm_meeting_7d: { 
    label: 'Custo por Reunião 7d', 
    shortLabel: 'C/Reunião 7d',
    description: 'Custo por reunião agendada nos últimos 7 dias',
    format: 'currency', 
    goalDirection: 'lower_better',
    category: 'cost' 
  },
  cpm_meeting_30d: { 
    label: 'Custo por Reunião 30d', 
    shortLabel: 'C/Reunião 30d',
    description: 'Custo por reunião agendada nos últimos 30 dias',
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
  
  // Volume metrics - v3 (Afonsina views)
  leads_new: { 
    label: 'Leads', 
    description: 'Leads novos no período',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  leads_total_7d: { 
    label: 'Leads 7d', 
    description: 'Total de leads nos últimos 7 dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  leads_total_30d: { 
    label: 'Leads 30d', 
    description: 'Total de leads nos últimos 30 dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  msg_in: { 
    label: 'Mensagens Recebidas', 
    shortLabel: 'Msgs',
    description: 'Total de mensagens recebidas',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'volume' 
  },
  msg_in_7d: { 
    label: 'Mensagens 7d', 
    shortLabel: 'Msgs 7d',
    description: 'Mensagens recebidas nos últimos 7 dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'volume' 
  },
  msg_in_30d: { 
    label: 'Mensagens 30d', 
    shortLabel: 'Msgs 30d',
    description: 'Mensagens recebidas nos últimos 30 dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'volume' 
  },
  meetings_scheduled: { 
    label: 'Reuniões Agendadas', 
    shortLabel: 'R. Agend.',
    description: 'Total de reuniões agendadas',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  meetings_scheduled_7d: { 
    label: 'Reuniões Agendadas 7d', 
    shortLabel: 'R.Agend. 7d',
    description: 'Reuniões agendadas nos últimos 7 dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  meetings_scheduled_30d: { 
    label: 'Reuniões Agendadas 30d', 
    shortLabel: 'R.Agend. 30d',
    description: 'Reuniões agendadas nos últimos 30 dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  meetings_cancelled: { 
    label: 'Reuniões Canceladas', 
    shortLabel: 'R. Canc.',
    description: 'Total de reuniões canceladas',
    format: 'integer', 
    goalDirection: 'lower_better',
    category: 'funnel' 
  },
  meetings_cancelled_7d: { 
    label: 'Reuniões Canceladas 7d', 
    shortLabel: 'R.Canc. 7d',
    description: 'Reuniões canceladas nos últimos 7 dias',
    format: 'integer', 
    goalDirection: 'lower_better',
    category: 'funnel' 
  },
  meetings_cancelled_30d: { 
    label: 'Reuniões Canceladas 30d', 
    shortLabel: 'R.Canc. 30d',
    description: 'Reuniões canceladas nos últimos 30 dias',
    format: 'integer', 
    goalDirection: 'lower_better',
    category: 'funnel' 
  },
  meetings_upcoming: { 
    label: 'Reuniões Próximas', 
    shortLabel: 'R. Próx.',
    description: 'Reuniões agendadas para os próximos dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'funnel' 
  },
  calls_total_7d: { 
    label: 'Ligações 7d', 
    shortLabel: 'Lig. 7d',
    description: 'Total de ligações nos últimos 7 dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'volume' 
  },
  calls_total_30d: { 
    label: 'Ligações 30d', 
    shortLabel: 'Lig. 30d',
    description: 'Total de ligações nos últimos 30 dias',
    format: 'integer', 
    goalDirection: 'higher_better',
    category: 'volume' 
  },
  
  // Legacy volume metrics (funnel)
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
  
  // Rate metrics - v3
  conv_lead_to_msg_7d: { 
    label: 'Conv. Lead→Msg 7d', 
    shortLabel: 'L→M 7d',
    description: 'Taxa de conversão de Lead para Mensagem (7 dias)',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
  conv_lead_to_msg_30d: { 
    label: 'Conv. Lead→Msg 30d', 
    shortLabel: 'L→M 30d',
    description: 'Taxa de conversão de Lead para Mensagem (30 dias)',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
  conv_msg_to_meeting_7d: { 
    label: 'Conv. Msg→Reunião 7d', 
    shortLabel: 'M→R 7d',
    description: 'Taxa de conversão de Mensagem para Reunião (7 dias)',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
  conv_msg_to_meeting_30d: { 
    label: 'Conv. Msg→Reunião 30d', 
    shortLabel: 'M→R 30d',
    description: 'Taxa de conversão de Mensagem para Reunião (30 dias)',
    format: 'percent', 
    goalDirection: 'higher_better',
    category: 'rate' 
  },
  
  // Legacy rate metrics
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
// CRITICAL: Guard against formatting numbers as dates (causes 31/12/1969 bug)
export function formatColumnValue(value: any, key: string): string {
  if (value === null || value === undefined) return '—';
  
  const format = getColumnFormat(key);
  
  // GUARD: If format is 'date' but value is a plain number (likely a count), treat as integer
  // This prevents the 31/12/1969 bug where counts are formatted as dates
  if (format === 'date' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100000) {
    // Small integers are almost certainly counts, not timestamps
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  
  switch (format) {
    case 'currency':
      if (typeof value !== 'number' || !isFinite(value)) return '—';
      return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    
    case 'percent':
      if (typeof value !== 'number' || !isFinite(value)) return '—';
      // Handle both 0-1 and 0-100 formats
      const pct = value <= 1 ? value * 100 : value;
      return `${pct.toFixed(1)}%`;
    
    case 'integer':
      if (typeof value !== 'number' || !isFinite(value)) return '—';
      return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    
    case 'date':
      // Only format as date if it's actually a date-like value
      if (value instanceof Date) {
        const d = value;
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('pt-BR');
      }
      if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
        try {
          const d = new Date(value);
          if (isNaN(d.getTime())) return String(value);
          return d.toLocaleDateString('pt-BR');
        } catch {
          return String(value);
        }
      }
      // If it's a large number, it might be a timestamp
      if (typeof value === 'number' && value > 946684800000) { // After year 2000 in ms
        try {
          const d = new Date(value);
          if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
        } catch {
          // Fall through
        }
      }
      return String(value);
    
    default:
      return String(value);
  }
}

// Get column description (for tooltips)
export function getColumnDescription(key: string): string | undefined {
  return COLUMN_LABELS[key]?.description;
}

// Executive KPIs - the main metrics to show at top (v3)
export const EXECUTIVE_KPIS_V3 = [
  'spend_7d',
  'leads_total_7d',
  'cpl_7d',
  'msg_in_7d',
  'meetings_scheduled_7d',
  'cpm_meeting_7d',
  'conv_lead_to_msg_7d',
  'conv_msg_to_meeting_7d',
] as const;

// Executive KPIs - legacy
export const EXECUTIVE_KPIS = [
  'custo_total',
  'leads_total',
  'cpl',
  'cac',
  'venda_total',
  'taxa_venda_total',
] as const;

// Funnel stages for v3 views
export const FUNNEL_STAGES_V3 = [
  'leads_total_7d',
  'msg_in_7d',
  'meetings_scheduled_7d',
] as const;

// Funnel stages in order (legacy)
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
  'meetings_cancelled_7d',
  'meetings_cancelled_30d',
] as const;

// Rate metrics v3
export const RATE_METRICS_V3 = [
  'conv_lead_to_msg_7d',
  'conv_msg_to_meeting_7d',
] as const;

// Rate metrics legacy
export const RATE_METRICS = [
  'taxa_entrada',
  'taxa_reuniao_agendada',
  'taxa_comparecimento',
  'taxa_venda_pos_reuniao',
  'taxa_venda_total',
] as const;

// Helper to normalize data from v3 views to expected format
export function normalizeV3Data(data: Record<string, any>): Record<string, any> {
  const normalized = { ...data };
  
  // Map v3 fields to normalized fields
  if (data.spend !== undefined) normalized.custo_total = data.spend;
  if (data.spend_7d !== undefined) normalized.custo_total = data.spend_7d;
  if (data.leads_new !== undefined) normalized.leads_total = data.leads_new;
  if (data.leads_total_7d !== undefined) normalized.leads_total = data.leads_total_7d;
  if (data.day !== undefined) normalized.dia = data.day;
  if (data.meetings_scheduled !== undefined) normalized.reuniao_agendada_total = data.meetings_scheduled;
  if (data.meetings_scheduled_7d !== undefined) normalized.reuniao_agendada_total = data.meetings_scheduled_7d;
  
  return normalized;
}
