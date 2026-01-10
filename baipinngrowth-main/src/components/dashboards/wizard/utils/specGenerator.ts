/**
 * Dashboard Spec Generation Utilities
 * Converts plans and semantic models to dashboard specs
 */

import { findColumnMatch, normalizeColumnName } from './columnMatching';
import { CRM_FUNNEL_ORDER } from './crmDetection';

/**
 * Generate fallback spec from semantic model
 */
export function generateFallbackSpec(semanticModel: any): any {
  const columns = semanticModel?.columns || [];
  const columnNames = columns.map((c: any) => c.name);
  
  // Detect time column with priority
  const timePriority = ['dia', 'data', 'created_at_ts', 'created_at', 'inserted_at', 'updated_at'];
  let timeColumn: string | null = semanticModel?.time_column || null;
  if (!timeColumn) {
    for (const t of timePriority) {
      const match = findColumnMatch(t, columnNames);
      if (match) {
        timeColumn = match;
        break;
      }
    }
  }
  
  // Detect ID column
  const idColumn = semanticModel?.id_column || findColumnMatch('lead_id', columnNames) || findColumnMatch('id', columnNames);
  
  // Detect stage flags
  const stageFlags = columns.filter((c: any) => 
    c.semantic_role === 'stage_flag' || 
    c.name.startsWith('st_') ||
    CRM_FUNNEL_ORDER.some(s => c.name.toLowerCase().includes(s.replace('st_', '')))
  );
  
  // Sort stage flags by CRM funnel order
  const sortedStages = stageFlags.sort((a: any, b: any) => {
    const aIndex = CRM_FUNNEL_ORDER.findIndex(s => 
      a.name.toLowerCase().includes(s.replace('st_', '')) || a.name.toLowerCase() === s
    );
    const bIndex = CRM_FUNNEL_ORDER.findIndex(s => 
      b.name.toLowerCase().includes(s.replace('st_', '')) || b.name.toLowerCase() === s
    );
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
  
  // Detect dimensions
  const dimensions = columns.filter((c: any) => 
    c.semantic_role === 'dimension' || 
    ['origem', 'vendedora', 'unidade', 'modalidade', 'retencao', 'source', 'channel'].some(d => 
      c.name.toLowerCase().includes(d)
    )
  );
  
  // Build KPIs (max 8)
  const kpis: any[] = [];
  
  // Lead count KPI
  if (idColumn) {
    kpis.push({
      id: 'total_leads',
      label: 'Total de Leads',
      formula: `count(${idColumn})`,
      format: 'count'
    });
  }
  
  // Stage KPIs
  sortedStages.slice(0, 6).forEach((stage: any) => {
    kpis.push({
      id: `kpi_${stage.name}`,
      label: stage.display_label || stage.name.replace('st_', '').replace(/_/g, ' '),
      formula: `truthy_count(${stage.name})`,
      format: 'count'
    });
  });
  
  // Build funnel
  const funnel = sortedStages.map((stage: any) => ({
    column: stage.name,
    label: stage.display_label || stage.name.replace('st_', '').replace(/_/g, ' '),
    order: CRM_FUNNEL_ORDER.findIndex(s => 
      stage.name.toLowerCase().includes(s.replace('st_', '')) || stage.name.toLowerCase() === s
    )
  })).filter((f: any) => f.order !== -1)
    .sort((a: any, b: any) => a.order - b.order);
  
  return {
    version: 1,
    title: semanticModel?.dataset_name || 'Dashboard',
    ui: {
      tabs: ['Decisões', 'Executivo', 'Funil', 'Detalhes'],
      defaultTab: 'Decisões',
      comparePeriods: !!timeColumn
    },
    kpis: kpis.slice(0, 8),
    funnel: {
      stages: funnel.map((f: any) => ({
        column: f.column,
        label: f.label
      }))
    },
    charts: [],
    metadata: {
      time_column: timeColumn,
      id_column: idColumn,
      dimensions: dimensions.map((d: any) => d.name),
      generated_by: 'fallback_spec',
      confidence: 0.5
    }
  };
}

/**
 * Convert DashboardPlan to DashboardSpec format
 */
export function convertPlanToSpec(plan: any, semanticModel: any): any {
  const columns = semanticModel?.columns || [];
  const columnNames = columns.map((c: any) => c.name);
  
  // Map KPIs
  const mappedKpis = (plan.kpis || []).map((kpi: any) => {
    const column = findColumnMatch(kpi.column, columnNames);
    if (!column) return null;
    
    return {
      id: kpi.id || `kpi_${column}`,
      label: kpi.label || column,
      formula: kpi.formula || `sum(${column})`,
      format: kpi.format || 'number'
    };
  }).filter(Boolean);
  
  // Map funnel stages
  const mappedFunnel = (plan.funnel?.stages || []).map((stage: any) => {
    const column = findColumnMatch(stage.column, columnNames);
    if (!column) return null;
    
    return {
      column,
      label: stage.label || column
    };
  }).filter(Boolean);
  
  return {
    version: 1,
    title: plan.title || semanticModel?.dataset_name || 'Dashboard',
    ui: {
      tabs: plan.tabs || ['Decisões', 'Executivo', 'Detalhes'],
      defaultTab: plan.defaultTab || 'Decisões',
      comparePeriods: !!semanticModel?.time_column
    },
    kpis: mappedKpis,
    funnel: {
      stages: mappedFunnel
    },
    charts: plan.charts || [],
    metadata: {
      time_column: semanticModel?.time_column,
      id_column: semanticModel?.id_column,
      generated_by: 'llm_plan',
      confidence: plan.confidence || 0.8
    }
  };
}


