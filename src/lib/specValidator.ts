// =====================================================
// SPEC VALIDATOR - Client-side validation + fallbacks
// =====================================================

import { DashboardSpec, DashboardSpecKPI, DashboardSpecColumn, DashboardSpecFunnel, DashboardSpecChart } from '@/components/dashboards/viewer/types/dashboardSpec';

export interface ColumnMeta {
  name: string;
  type: string;
  semantic_type?: string | null;
  display_label?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixedSpec: DashboardSpec;
  compatibilityMode: boolean;
}

// Known funnel column patterns for ordering
const FUNNEL_ORDER = [
  'leads', 'lead', 
  'entrada', 'entradas',
  'qualificado', 'qualificados',
  'reuniao_agendada', 'reunioes_agendadas', 'agendada',
  'reuniao_realizada', 'reunioes_realizadas', 'realizada',
  'proposta', 'propostas',
  'venda', 'vendas',
  'cliente', 'clientes'
];

function getFunnelOrder(columnName: string): number {
  const lower = columnName.toLowerCase();
  for (let i = 0; i < FUNNEL_ORDER.length; i++) {
    if (lower.includes(FUNNEL_ORDER[i])) {
      return i;
    }
  }
  return 999;
}

// Type detection from value
function detectColumnType(value: any): 'date' | 'number' | 'currency' | 'percent' | 'string' | 'boolean' {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  }
  return 'string';
}

// Generate fallback spec from data
export function generateFallbackSpec(
  data: Record<string, any>[],
  datasetName?: string
): DashboardSpec {
  if (data.length === 0) {
    return {
      version: 1,
      title: datasetName || 'Dashboard',
      ui: {
        tabs: ['Decisões', 'Executivo', 'Detalhes'],
        defaultTab: 'Decisões',
        comparePeriods: true
      }
    };
  }

  const firstRow = data[0];
  const columns = Object.keys(firstRow);
  
  // Analyze columns
  const columnMeta: ColumnMeta[] = columns.map(col => {
    const value = firstRow[col];
    const lower = col.toLowerCase();
    
    let semantic_type = 'text';
    let type: DashboardSpecColumn['type'] = detectColumnType(value);
    
    // Semantic detection
    if (lower.includes('dia') || lower.includes('date') || lower.includes('data')) {
      semantic_type = 'time';
      type = 'date';
    } else if (lower.includes('custo') || lower.includes('valor') || lower.includes('cpl') || lower.includes('cac')) {
      semantic_type = 'currency';
      type = 'currency';
    } else if (lower.startsWith('taxa_') || lower.includes('percent') || lower.includes('rate')) {
      semantic_type = 'percent';
      type = 'percent';
    } else if (lower.includes('_total') || lower.includes('count') || lower.includes('qtd')) {
      semantic_type = 'count';
      type = 'number';
    } else if (typeof value === 'number') {
      semantic_type = 'metric';
      type = 'number';
    }
    
    // Generate label
    const label = col
      .replace(/_total$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    
    return { name: col, type, semantic_type, display_label: label };
  });

  const spec: DashboardSpec = {
    version: 1,
    title: datasetName || 'Dashboard',
    ui: {
      tabs: ['Decisões', 'Executivo', 'Detalhes'],
      defaultTab: 'Decisões',
      comparePeriods: true
    }
  };

  // Time column
  const timeCol = columnMeta.find(c => c.semantic_type === 'time');
  if (timeCol) {
    spec.time = { column: timeCol.name, type: 'date' };
  }

  // Columns
  spec.columns = columnMeta.map(c => ({
    name: c.name,
    type: c.type as DashboardSpecColumn['type'],
    label: c.display_label,
    scale: c.semantic_type === 'percent' ? '0to1' : undefined
  }));

  // KPIs
  const numericCols = columnMeta.filter(c => 
    ['currency', 'count', 'metric', 'percent'].includes(c.semantic_type || '')
  );
  spec.kpis = numericCols.slice(0, 6).map(c => ({
    label: c.display_label || c.name,
    column: c.name,
    agg: c.semantic_type === 'percent' ? 'avg' : 'sum',
    format: c.semantic_type === 'currency' ? 'currency' : 
            c.semantic_type === 'percent' ? 'percent' : 'integer',
    goalDirection: c.semantic_type === 'currency' ? 'lower_better' : 'higher_better'
  } as DashboardSpecKPI));

  // Funnel
  const funnelCols = numericCols
    .filter(c => getFunnelOrder(c.name) < 999)
    .sort((a, b) => getFunnelOrder(a.name) - getFunnelOrder(b.name));
  
  if (funnelCols.length >= 3) {
    spec.funnel = {
      steps: funnelCols.slice(0, 6).map(c => ({
        label: c.display_label || c.name,
        column: c.name
      }))
    };
    spec.ui!.tabs = ['Decisões', 'Executivo', 'Funil', 'Detalhes'];
  }

  // Charts
  if (timeCol) {
    spec.charts = [];
    
    const chartMetrics = numericCols
      .filter(c => c.semantic_type !== 'percent')
      .slice(0, 4);
    
    if (chartMetrics.length > 0) {
      spec.charts.push({
        type: 'line',
        title: 'Tendência Principal',
        x: timeCol.name,
        series: chartMetrics.map(c => ({
          label: c.display_label || c.name,
          y: c.name,
          format: c.semantic_type === 'currency' ? 'currency' : 'number'
        }))
      });
    }
    
    if (spec.charts.length > 0) {
      spec.ui!.tabs = spec.ui!.tabs!.includes('Funil') 
        ? ['Decisões', 'Executivo', 'Funil', 'Tendências', 'Detalhes']
        : ['Decisões', 'Executivo', 'Tendências', 'Detalhes'];
    }
  }

  return spec;
}

// Validate spec against actual data
export function validateSpec(
  spec: DashboardSpec | null,
  data: Record<string, any>[],
  fallbackDatasetName?: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let compatibilityMode = false;

  // If no spec or no data, generate fallback
  if (!spec || data.length === 0) {
    const fallback = generateFallbackSpec(data, fallbackDatasetName);
    return {
      valid: data.length > 0,
      errors: data.length === 0 ? ['Sem dados para exibir'] : [],
      warnings: spec ? [] : ['Usando spec gerado automaticamente'],
      fixedSpec: fallback,
      compatibilityMode: data.length === 0
    };
  }

  // Get actual columns from data
  const actualColumns = new Set(Object.keys(data[0] || {}));
  const numericColumns = new Set<string>();
  
  Object.entries(data[0] || {}).forEach(([key, value]) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      numericColumns.add(key);
    }
  });

  // Clone spec for fixing
  const fixed: DashboardSpec = JSON.parse(JSON.stringify(spec));

  // Ensure version
  if (!fixed.version) {
    fixed.version = 1;
    warnings.push('Versão adicionada ao spec');
  }

  // Validate time column
  if (fixed.time?.column) {
    if (!actualColumns.has(fixed.time.column)) {
      // Try to find alternative
      const altTime = Array.from(actualColumns).find(c => 
        c.toLowerCase().includes('dia') || 
        c.toLowerCase().includes('date') ||
        c.toLowerCase().includes('data')
      );
      if (altTime) {
        fixed.time.column = altTime;
        warnings.push(`Coluna de tempo corrigida para ${altTime}`);
      } else {
        delete fixed.time;
        warnings.push('Configuração de tempo removida (coluna não encontrada)');
      }
    }
  }

  // Validate KPIs
  if (fixed.kpis) {
    const validKpis: DashboardSpecKPI[] = [];
    for (const kpi of fixed.kpis) {
      if (!kpi.column) {
        warnings.push(`KPI "${kpi.label}" removido: sem coluna definida`);
        continue;
      }
      
      // Ensure column name is string (prevent toLowerCase crash)
      if (typeof kpi.column !== 'string') {
        warnings.push(`KPI "${kpi.label}" removido: coluna inválida`);
        continue;
      }
      
      if (!actualColumns.has(kpi.column)) {
        warnings.push(`KPI "${kpi.label}" removido: coluna ${kpi.column} não existe`);
        continue;
      }
      
      if (!numericColumns.has(kpi.column) && kpi.agg !== 'count') {
        warnings.push(`KPI "${kpi.label}": coluna ${kpi.column} não é numérica`);
        continue;
      }
      
      // Ensure label is string
      if (!kpi.label || typeof kpi.label !== 'string') {
        kpi.label = kpi.column;
      }
      
      validKpis.push(kpi);
    }
    fixed.kpis = validKpis;
  }

  // Validate funnel
  if (fixed.funnel?.steps) {
    const validSteps = fixed.funnel.steps.filter(step => {
      if (!step.column || typeof step.column !== 'string') {
        warnings.push(`Etapa de funil removida: coluna inválida`);
        return false;
      }
      if (!actualColumns.has(step.column)) {
        warnings.push(`Etapa "${step.label}" removida: coluna ${step.column} não existe`);
        return false;
      }
      if (!numericColumns.has(step.column)) {
        warnings.push(`Etapa "${step.label}": coluna não é numérica`);
        return false;
      }
      if (!step.label || typeof step.label !== 'string') {
        step.label = step.column;
      }
      return true;
    });
    
    if (validSteps.length < 2) {
      delete fixed.funnel;
      warnings.push('Funil removido: menos de 2 etapas válidas');
    } else {
      fixed.funnel.steps = validSteps;
    }
  }

  // Validate charts
  if (fixed.charts) {
    const validCharts: DashboardSpecChart[] = [];
    for (const chart of fixed.charts) {
      // Validate x-axis
      if (!chart.x || typeof chart.x !== 'string' || !actualColumns.has(chart.x)) {
        const altX = fixed.time?.column || 
          Array.from(actualColumns).find(c => c.toLowerCase().includes('dia'));
        if (altX) {
          chart.x = altX;
          warnings.push(`Gráfico "${chart.title}": eixo X corrigido para ${altX}`);
        } else {
          warnings.push(`Gráfico "${chart.title}" removido: sem eixo X válido`);
          continue;
        }
      }
      
      // Validate series
      if (chart.series) {
        chart.series = chart.series.filter(s => {
          if (!s.y || typeof s.y !== 'string') {
            warnings.push(`Série removida: coluna inválida`);
            return false;
          }
          if (!actualColumns.has(s.y)) {
            warnings.push(`Série "${s.label}" removida: coluna ${s.y} não existe`);
            return false;
          }
          if (!numericColumns.has(s.y)) {
            warnings.push(`Série "${s.label}": coluna não é numérica`);
            return false;
          }
          if (!s.label || typeof s.label !== 'string') {
            s.label = s.y;
          }
          return true;
        });
      }
      
      if (!chart.series || chart.series.length === 0) {
        warnings.push(`Gráfico "${chart.title}" removido: sem séries válidas`);
        continue;
      }
      
      if (!chart.title || typeof chart.title !== 'string') {
        chart.title = 'Gráfico';
      }
      
      validCharts.push(chart);
    }
    fixed.charts = validCharts;
  }

  // Validate columns
  if (fixed.columns) {
    fixed.columns = fixed.columns.filter(col => {
      if (!col.name || typeof col.name !== 'string') {
        warnings.push('Coluna sem nome removida');
        return false;
      }
      if (!actualColumns.has(col.name)) {
        warnings.push(`Coluna ${col.name} removida: não existe no dataset`);
        return false;
      }
      return true;
    });
  }

  // Ensure UI defaults
  if (!fixed.ui) {
    fixed.ui = {};
  }
  if (!fixed.ui.tabs || fixed.ui.tabs.length === 0) {
    fixed.ui.tabs = ['Decisões', 'Executivo', 'Detalhes'];
    if (fixed.funnel) fixed.ui.tabs.splice(2, 0, 'Funil');
    if (fixed.charts && fixed.charts.length > 0) {
      const insertIdx = fixed.ui.tabs.indexOf('Detalhes');
      fixed.ui.tabs.splice(insertIdx, 0, 'Tendências');
    }
  }
  if (!fixed.ui.defaultTab) {
    fixed.ui.defaultTab = 'Decisões';
  }

  // Check for compatibility mode
  if (warnings.length > 10 || errors.length > 0) {
    compatibilityMode = true;
    warnings.push('Modo compatibilidade ativado devido a muitos problemas');
  }

  // If too many issues, regenerate from data
  if (compatibilityMode && data.length > 0) {
    const fallback = generateFallbackSpec(data, fixed.title || fallbackDatasetName);
    return {
      valid: true,
      errors,
      warnings: [...warnings, 'Spec regenerado automaticamente'],
      fixedSpec: fallback,
      compatibilityMode: true
    };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixedSpec: fixed,
    compatibilityMode
  };
}

// Safe column accessor
export function safeColumnValue(row: Record<string, any>, column: string | undefined): any {
  if (!column || typeof column !== 'string') return null;
  return row[column] ?? null;
}

// Safe numeric accessor
export function safeNumericValue(row: Record<string, any>, column: string | undefined): number {
  const val = safeColumnValue(row, column);
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : 0;
}
