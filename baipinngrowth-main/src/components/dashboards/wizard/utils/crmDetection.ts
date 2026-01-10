/**
 * CRM Funnel Detection Utilities
 * Detects if a dataset is a CRM/Kommo funnel dataset
 */

export interface CrmDetectionResult {
  isCrm: boolean;
  confidence: number;
  reasons: string[];
}

// CRM Funnel detection patterns for Kommo datasets
export const CRM_FUNNEL_DETECTION = {
  id_patterns: ['lead_id', 'leadid', 'kommo_lead_id', 'idd'],
  time_patterns: ['created_at', 'created_at_ts', 'dia', 'data', 'inserted_at'],
  stage_patterns: [
    'st_entrada', 'st_lead_ativo', 'st_qualificado', 'st_exp_nao_confirmada',
    'st_exp_agendada', 'st_faltou_exp', 'st_reagendou', 'st_exp_realizada',
    'st_venda', 'st_perdida', 'entrada', 'qualificado', 'venda', 'perdida'
  ],
  dimension_patterns: ['unidade', 'vendedora', 'professor', 'modalidade', 'origem', 'retencao']
};

// CRM fallback funnel order
export const CRM_FUNNEL_ORDER = [
  'st_entrada', 'entrada',
  'st_lead_ativo', 'lead_ativo',
  'st_qualificado', 'qualificado',
  'st_exp_agendada', 'exp_agendada', 'agendada',
  'st_exp_realizada', 'exp_realizada', 'realizada',
  'st_venda', 'venda', 'vendas',
  'aluno_ativo',
  'st_perdida', 'perdida'
];

/**
 * Detect if dataset looks like CRM/Kommo funnel
 */
export function detectCrmFunnelDataset(
  columns: string[], 
  datasetName: string
): CrmDetectionResult {
  const colNamesLower = columns.map(c => c.toLowerCase());
  const reasons: string[] = [];
  let score = 0;
  
  // Check dataset name
  if (datasetName.toLowerCase().includes('kommo') || datasetName.toLowerCase().includes('crm')) {
    score += 20;
    reasons.push('Nome contém "kommo" ou "crm"');
  }
  
  // Check for ID column
  const hasIdColumn = CRM_FUNNEL_DETECTION.id_patterns.some(p => colNamesLower.includes(p));
  if (hasIdColumn) {
    score += 15;
    reasons.push('Coluna lead_id encontrada');
  }
  
  // Check for time column
  const hasTimeColumn = CRM_FUNNEL_DETECTION.time_patterns.some(p => colNamesLower.includes(p));
  if (hasTimeColumn) {
    score += 10;
    reasons.push('Coluna de tempo encontrada');
  }
  
  // Check for stage columns (need at least 4)
  const stageCount = CRM_FUNNEL_DETECTION.stage_patterns.filter(p => 
    colNamesLower.some(c => c.includes(p.replace('st_', '')) || c === p)
  ).length;
  if (stageCount >= 4) {
    score += 35;
    reasons.push(`${stageCount} etapas de funil detectadas`);
  } else if (stageCount >= 2) {
    score += 15;
    reasons.push(`${stageCount} etapas de funil detectadas (mínimo 4 ideal)`);
  }
  
  // Check for dimension columns
  const dimCount = CRM_FUNNEL_DETECTION.dimension_patterns.filter(p => 
    colNamesLower.some(c => c.includes(p))
  ).length;
  if (dimCount >= 2) {
    score += 20;
    reasons.push(`${dimCount} dimensões encontradas (unidade, vendedora, etc)`);
  }
  
  return {
    isCrm: score >= 60,
    confidence: Math.min(score, 100),
    reasons
  };
}


