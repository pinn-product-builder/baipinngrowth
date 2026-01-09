// ============================================================
// DASHBOARD SPEC TYPES
// Declarative configuration for dashboards
// ============================================================

export interface DashboardSpecColumn {
  name: string;
  type: 'date' | 'number' | 'currency' | 'percent' | 'string' | 'boolean';
  scale?: '0to1' | '0to100'; // For percentages
  label?: string;
  format?: string;
}

export interface DashboardSpecKPI {
  label: string;
  column: string;
  agg: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'last';
  format: 'currency' | 'number' | 'percent' | 'integer';
  goal?: number;
  goalDirection?: 'higher_better' | 'lower_better';
}

export interface DashboardSpecFunnelStep {
  label: string;
  column: string;
}

export interface DashboardSpecFunnel {
  steps: DashboardSpecFunnelStep[];
}

export interface DashboardSpecChartSeries {
  label: string;
  y: string;
  format: 'currency' | 'number' | 'percent';
  color?: string;
}

export interface DashboardSpecChart {
  type: 'line' | 'bar' | 'area' | 'pie';
  title: string;
  x: string;
  series: DashboardSpecChartSeries[];
}

export interface DashboardSpecGoal {
  metric: string;
  op: '<=' | '>=' | '<' | '>' | '=';
  value: number;
  label?: string;
}

export interface DashboardSpecUI {
  tabs?: string[];
  defaultTab?: string;
  comparePeriods?: boolean;
  datePresets?: number[];
  refreshInterval?: number;
}

export interface DashboardSpec {
  version: number;
  title?: string;
  time?: {
    column: string;
    type?: 'date' | 'datetime';
  };
  columns?: DashboardSpecColumn[];
  kpis?: DashboardSpecKPI[];
  funnel?: DashboardSpecFunnel;
  charts?: DashboardSpecChart[];
  goals?: DashboardSpecGoal[];
  ui?: DashboardSpecUI;
}

// ============================================================
// DEFAULT SPEC (fallback)
// ============================================================

export const DEFAULT_DASHBOARD_SPEC: DashboardSpec = {
  version: 1,
  ui: {
    tabs: ['Executivo', 'Detalhes'],
    defaultTab: 'Executivo',
    comparePeriods: true,
  },
};

// ============================================================
// SPEC PARSER
// ============================================================

/**
 * Parse and validate a dashboard spec from JSON
 * Returns null if invalid, with console warning
 */
export function parseDashboardSpec(input: any): DashboardSpec | null {
  try {
    if (!input || typeof input !== 'object') {
      return null;
    }
    
    // Validate version
    if (typeof input.version !== 'number') {
      console.warn('Dashboard spec missing version');
      return null;
    }
    
    // Basic structure validation
    const spec: DashboardSpec = {
      version: input.version,
    };
    
    if (input.title) spec.title = String(input.title);
    
    if (input.time && typeof input.time === 'object') {
      spec.time = {
        column: String(input.time.column || 'dia'),
        type: input.time.type || 'date',
      };
    }
    
    if (Array.isArray(input.columns)) {
      spec.columns = input.columns.map((col: any) => ({
        name: String(col.name || ''),
        type: col.type || 'string',
        scale: col.scale,
        label: col.label,
        format: col.format,
      })).filter((c: DashboardSpecColumn) => c.name);
    }
    
    if (Array.isArray(input.kpis)) {
      spec.kpis = input.kpis.map((kpi: any) => ({
        label: String(kpi.label || ''),
        column: String(kpi.column || ''),
        agg: kpi.agg || 'sum',
        format: kpi.format || 'number',
        goal: typeof kpi.goal === 'number' ? kpi.goal : undefined,
        goalDirection: kpi.goalDirection,
      })).filter((k: DashboardSpecKPI) => k.label && k.column);
    }
    
    if (input.funnel && typeof input.funnel === 'object') {
      if (Array.isArray(input.funnel.steps)) {
        spec.funnel = {
          steps: input.funnel.steps.map((step: any) => ({
            label: String(step.label || ''),
            column: String(step.column || ''),
          })).filter((s: DashboardSpecFunnelStep) => s.label && s.column),
        };
      }
    }
    
    if (Array.isArray(input.charts)) {
      spec.charts = input.charts.map((chart: any) => ({
        type: chart.type || 'line',
        title: String(chart.title || ''),
        x: String(chart.x || 'dia'),
        series: Array.isArray(chart.series)
          ? chart.series.map((s: any) => ({
              label: String(s.label || ''),
              y: String(s.y || ''),
              format: s.format || 'number',
              color: s.color,
            })).filter((s: DashboardSpecChartSeries) => s.label && s.y)
          : [],
      })).filter((c: DashboardSpecChart) => c.title && c.series.length > 0);
    }
    
    if (Array.isArray(input.goals)) {
      spec.goals = input.goals.map((goal: any) => ({
        metric: String(goal.metric || ''),
        op: goal.op || '<=',
        value: typeof goal.value === 'number' ? goal.value : 0,
        label: goal.label,
      })).filter((g: DashboardSpecGoal) => g.metric);
    }
    
    if (input.ui && typeof input.ui === 'object') {
      spec.ui = {
        tabs: Array.isArray(input.ui.tabs) ? input.ui.tabs : undefined,
        defaultTab: input.ui.defaultTab,
        comparePeriods: input.ui.comparePeriods,
        datePresets: Array.isArray(input.ui.datePresets) ? input.ui.datePresets : undefined,
        refreshInterval: typeof input.ui.refreshInterval === 'number' ? input.ui.refreshInterval : undefined,
      };
    }
    
    return spec;
    
  } catch (error) {
    console.error('Error parsing dashboard spec:', error);
    return null;
  }
}

/**
 * Generate a spec from detected data (auto-spec)
 */
export function generateSpecFromData(
  columns: string[],
  sampleRow?: Record<string, any>
): DashboardSpec {
  const spec: DashboardSpec = {
    version: 1,
    columns: [],
    kpis: [],
    ui: {
      tabs: ['Executivo', 'Detalhes'],
      comparePeriods: true,
    },
  };
  
  // Known column mappings
  const knownColumns: Record<string, DashboardSpecColumn> = {
    dia: { name: 'dia', type: 'date', label: 'Data' },
    custo_total: { name: 'custo_total', type: 'currency', label: 'Custo Total' },
    leads_total: { name: 'leads_total', type: 'number', label: 'Leads' },
    entrada_total: { name: 'entrada_total', type: 'number', label: 'Entradas' },
    reuniao_agendada_total: { name: 'reuniao_agendada_total', type: 'number', label: 'Reuniões Agendadas' },
    reuniao_realizada_total: { name: 'reuniao_realizada_total', type: 'number', label: 'Reuniões Realizadas' },
    venda_total: { name: 'venda_total', type: 'number', label: 'Vendas' },
    cpl: { name: 'cpl', type: 'currency', label: 'CPL' },
    cac: { name: 'cac', type: 'currency', label: 'CAC' },
    taxa_entrada: { name: 'taxa_entrada', type: 'percent', scale: '0to1', label: 'Taxa de Entrada' },
    taxa_comparecimento: { name: 'taxa_comparecimento', type: 'percent', scale: '0to1', label: 'Taxa de Comparecimento' },
    taxa_venda_total: { name: 'taxa_venda_total', type: 'percent', scale: '0to1', label: 'Taxa de Conversão' },
  };
  
  // Build columns
  spec.columns = columns.map(col => {
    if (knownColumns[col]) {
      return knownColumns[col];
    }
    
    // Auto-detect type
    const lower = col.toLowerCase();
    if (lower.includes('taxa_') || lower.includes('rate') || lower.includes('percent')) {
      return { name: col, type: 'percent', scale: '0to1' } as DashboardSpecColumn;
    }
    if (lower.includes('custo') || lower.includes('cpl') || lower.includes('cac') || lower.includes('valor')) {
      return { name: col, type: 'currency' } as DashboardSpecColumn;
    }
    if (lower.includes('_total') || lower.includes('_count') || lower.includes('qtd')) {
      return { name: col, type: 'number' } as DashboardSpecColumn;
    }
    if (lower === 'dia' || lower.includes('date') || lower.includes('created')) {
      return { name: col, type: 'date' } as DashboardSpecColumn;
    }
    
    return { name: col, type: 'string' } as DashboardSpecColumn;
  });
  
  // Build KPIs from known metrics
  const kpiCandidates = ['custo_total', 'leads_total', 'entrada_total', 'venda_total', 'cpl', 'cac'];
  spec.kpis = kpiCandidates
    .filter(col => columns.includes(col))
    .map(col => {
      const known = knownColumns[col];
      const isCurrency = col.includes('custo') || col === 'cpl' || col === 'cac';
      return {
        label: known?.label || col,
        column: col,
        agg: (col === 'cpl' || col === 'cac') ? 'avg' : 'sum',
        format: isCurrency ? 'currency' : 'integer',
        goalDirection: isCurrency ? 'lower_better' : 'higher_better',
      } as DashboardSpecKPI;
    });
  
  // Add funnel if we have the columns
  const funnelCols = ['leads_total', 'entrada_total', 'reuniao_agendada_total', 'reuniao_realizada_total', 'venda_total'];
  const presentFunnel = funnelCols.filter(c => columns.includes(c));
  if (presentFunnel.length >= 3) {
    spec.funnel = {
      steps: presentFunnel.map(col => ({
        label: knownColumns[col]?.label || col,
        column: col,
      })),
    };
    spec.ui!.tabs = ['Executivo', 'Funil', 'Tendências', 'Detalhes'];
  }
  
  // Add charts
  const dateCol = columns.find(c => c === 'dia' || c.includes('date'));
  if (dateCol) {
    spec.time = { column: dateCol, type: 'date' };
    
    // Cost + Leads chart
    if (columns.includes('custo_total') && columns.includes('leads_total')) {
      spec.charts = spec.charts || [];
      spec.charts.push({
        type: 'line',
        title: 'Tendência • Custo x Leads',
        x: dateCol,
        series: [
          { label: 'Custo Total', y: 'custo_total', format: 'currency' },
          { label: 'Leads', y: 'leads_total', format: 'number' },
        ],
      });
    }
    
    // CPL + CAC chart
    if (columns.includes('cpl') && columns.includes('cac')) {
      spec.charts = spec.charts || [];
      spec.charts.push({
        type: 'line',
        title: 'Eficiência • CPL x CAC',
        x: dateCol,
        series: [
          { label: 'CPL', y: 'cpl', format: 'currency' },
          { label: 'CAC', y: 'cac', format: 'currency' },
        ],
      });
      
      spec.ui!.tabs = ['Executivo', 'Funil', 'Eficiência', 'Tendências', 'Detalhes'];
    }
  }
  
  return spec;
}

/**
 * Validate a spec JSON string
 */
export function validateSpecJson(jsonString: string): { valid: boolean; error?: string; spec?: DashboardSpec } {
  try {
    const parsed = JSON.parse(jsonString);
    const spec = parseDashboardSpec(parsed);
    
    if (!spec) {
      return { valid: false, error: 'Invalid spec structure' };
    }
    
    return { valid: true, spec };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}
