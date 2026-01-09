// ============================================================
// LAYOUT COMPILER
// Converts DashboardPlan → Validated DashboardSpec
// With guardrails, fallbacks, and minimum guarantees
// ============================================================

import {
  DatasetCapabilities,
  DynamicTabId,
  WidgetType,
  WIDGET_CATALOG,
  CompiledLayout,
  CompiledTab,
  CompiledWidget,
  CompiledFilter,
  BindingInfo,
  DiscardInfo,
  TraceStep,
} from './types';
import { generateTabs, TabGenerationResult } from './tabGenerator';
import type { DashboardPlan, KPIDefinition, ChartDefinition, FunnelDefinition } from '@/components/dashboards/wizard/types';

export const COMPILER_VERSION = '2.0.0';

/**
 * Compilation result
 */
export interface CompilationResult {
  success: boolean;
  layout: CompiledLayout | null;
  errors: string[];
  warnings: string[];
  discards: DiscardInfo[];
  trace: TraceStep[];
}

/**
 * Widget position helpers
 */
let widgetIdCounter = 0;
function generateWidgetId(): string {
  return `widget_${Date.now()}_${++widgetIdCounter}`;
}

/**
 * Check if widget requirements are met
 */
function checkWidgetRequirements(
  widgetType: WidgetType,
  capabilities: DatasetCapabilities
): { met: boolean; reason?: string } {
  const widget = WIDGET_CATALOG[widgetType];
  if (!widget) {
    return { met: false, reason: 'Widget não encontrado no catálogo' };
  }
  
  const req = widget.requires;
  
  if (req.timeColumn && !capabilities.hasTime) {
    return { met: false, reason: widget.fallbackReason || 'Coluna de tempo necessária' };
  }
  
  if (req.minStageFlags && capabilities.stageFlagsCount < req.minStageFlags) {
    return { met: false, reason: widget.fallbackReason || 'Etapas de funil insuficientes' };
  }
  
  if (req.minDimensions && capabilities.dimensionsCount < req.minDimensions) {
    return { met: false, reason: widget.fallbackReason || 'Dimensões insuficientes' };
  }
  
  if (req.minMetrics && capabilities.metricsCount < req.minMetrics) {
    return { met: false, reason: widget.fallbackReason || 'Métricas insuficientes' };
  }
  
  if (req.currencyMetric && capabilities.currencyMetrics.length === 0) {
    return { met: false, reason: widget.fallbackReason || 'Métrica de custo/valor necessária' };
  }
  
  return { met: true };
}

/**
 * Create a widget with fallback if requirements not met
 */
function createWidgetWithFallback(
  requestedType: WidgetType,
  capabilities: DatasetCapabilities,
  config: Record<string, any>,
  position: { row: number; col: number; width: number; height: number }
): { widget: CompiledWidget; discard?: DiscardInfo } {
  const check = checkWidgetRequirements(requestedType, capabilities);
  
  if (check.met) {
    return {
      widget: {
        id: generateWidgetId(),
        type: requestedType,
        config,
        position,
      },
    };
  }
  
  // Try fallback
  const catalogEntry = WIDGET_CATALOG[requestedType];
  if (catalogEntry?.fallbackTo) {
    const fallbackCheck = checkWidgetRequirements(catalogEntry.fallbackTo, capabilities);
    if (fallbackCheck.met) {
      return {
        widget: {
          id: generateWidgetId(),
          type: catalogEntry.fallbackTo,
          originalType: requestedType,
          fallbackReason: check.reason,
          config,
          position,
        },
        discard: {
          item: catalogEntry.label,
          type: 'widget',
          reason: check.reason || 'Requisitos não atendidos',
          fallback: WIDGET_CATALOG[catalogEntry.fallbackTo]?.label,
        },
      };
    }
  }
  
  // Ultimate fallback: data_table
  return {
    widget: {
      id: generateWidgetId(),
      type: 'data_table',
      originalType: requestedType,
      fallbackReason: check.reason,
      config,
      position,
    },
    discard: {
      item: catalogEntry?.label || requestedType,
      type: 'widget',
      reason: check.reason || 'Requisitos não atendidos',
      fallback: 'Tabela de Dados',
    },
  };
}

/**
 * Generate Overview tab widgets
 */
function generateOverviewWidgets(
  capabilities: DatasetCapabilities,
  plan?: DashboardPlan
): { widgets: CompiledWidget[]; discards: DiscardInfo[] } {
  const widgets: CompiledWidget[] = [];
  const discards: DiscardInfo[] = [];
  let row = 0;
  
  // Status card (always)
  widgets.push({
    id: generateWidgetId(),
    type: 'status_card',
    config: {
      title: 'Status do Dataset',
      rowCount: capabilities.rowCount,
      columnCount: capabilities.columns.length,
      hasTime: capabilities.hasTime,
      hasFunnel: capabilities.stageFlagsCount >= 3,
    },
    position: { row, col: 0, width: 12, height: 1 },
  });
  row++;
  
  // KPI Cards (2-4 minimum guaranteed)
  const kpiConfigs: { column: string; label: string; format: string; agg: string }[] = [];
  
  // 1. Total rows (always)
  kpiConfigs.push({
    column: '_count',
    label: 'Total de Registros',
    format: 'integer',
    agg: 'count',
  });
  
  // 2. Unique ID count if available
  if (capabilities.idColumn) {
    kpiConfigs.push({
      column: capabilities.idColumn,
      label: 'IDs Únicos',
      format: 'integer',
      agg: 'count_distinct',
    });
  }
  
  // 3. First stage flag or metric
  if (capabilities.stageFlags.length > 0) {
    kpiConfigs.push({
      column: capabilities.stageFlags[0],
      label: formatColumnLabel(capabilities.stageFlags[0]),
      format: 'integer',
      agg: 'truthy_count',
    });
  } else if (capabilities.metrics.length > 0) {
    kpiConfigs.push({
      column: capabilities.metrics[0],
      label: formatColumnLabel(capabilities.metrics[0]),
      format: capabilities.currencyMetrics.includes(capabilities.metrics[0]) ? 'currency' : 'number',
      agg: 'sum',
    });
  }
  
  // 4. Last stage flag or second metric
  if (capabilities.stageFlags.length > 2) {
    const lastStage = capabilities.stageFlags[capabilities.stageFlags.length - 1];
    kpiConfigs.push({
      column: lastStage,
      label: formatColumnLabel(lastStage),
      format: 'integer',
      agg: 'truthy_count',
    });
  } else if (capabilities.metrics.length > 1) {
    kpiConfigs.push({
      column: capabilities.metrics[1],
      label: formatColumnLabel(capabilities.metrics[1]),
      format: capabilities.currencyMetrics.includes(capabilities.metrics[1]) ? 'currency' : 'number',
      agg: 'sum',
    });
  }
  
  // Add KPIs from plan if available
  if (plan?.kpis) {
    for (const kpi of plan.kpis.slice(0, 4)) {
      if (!kpiConfigs.some(k => k.column === kpi.column)) {
        kpiConfigs.push({
          column: kpi.column,
          label: kpi.label,
          format: kpi.format || 'integer',
          agg: kpi.formula || 'sum',
        });
      }
    }
  }
  
  widgets.push({
    id: generateWidgetId(),
    type: 'kpi_cards',
    config: { kpis: kpiConfigs.slice(0, 8) },
    position: { row, col: 0, width: 12, height: 2 },
  });
  row += 2;
  
  // Funnel if available
  if (capabilities.stageFlagsCount >= 3) {
    const result = createWidgetWithFallback(
      'funnel_chart',
      capabilities,
      {
        stages: capabilities.stageFlags.slice(0, 7).map(col => ({
          column: col,
          label: formatColumnLabel(col),
        })),
        idColumn: capabilities.idColumn,
      },
      { row, col: 0, width: 8, height: 4 }
    );
    widgets.push(result.widget);
    if (result.discard) discards.push(result.discard);
    
    // Ranking next to funnel
    if (capabilities.dimensions.length > 0) {
      const rankResult = createWidgetWithFallback(
        'ranking_table',
        capabilities,
        {
          dimension: capabilities.dimensions[0],
          metric: capabilities.stageFlags[0] || capabilities.metrics[0],
          limit: 5,
        },
        { row, col: 8, width: 4, height: 4 }
      );
      widgets.push(rankResult.widget);
      if (rankResult.discard) discards.push(rankResult.discard);
    }
    row += 4;
  } else if (capabilities.dimensions.length > 0 && capabilities.metrics.length > 0) {
    // Bar chart by dimension
    const result = createWidgetWithFallback(
      'bar_chart',
      capabilities,
      {
        dimension: capabilities.dimensions[0],
        metric: capabilities.metrics[0],
        title: `${formatColumnLabel(capabilities.metrics[0])} por ${formatColumnLabel(capabilities.dimensions[0])}`,
      },
      { row, col: 0, width: 12, height: 4 }
    );
    widgets.push(result.widget);
    if (result.discard) discards.push(result.discard);
    row += 4;
  }
  
  return { widgets, discards };
}

/**
 * Generate Time tab widgets
 */
function generateTimeWidgets(
  capabilities: DatasetCapabilities,
  plan?: DashboardPlan
): { widgets: CompiledWidget[]; discards: DiscardInfo[] } {
  const widgets: CompiledWidget[] = [];
  const discards: DiscardInfo[] = [];
  
  if (!capabilities.hasTime || !capabilities.timeColumn) {
    return { widgets, discards };
  }
  
  let row = 0;
  
  // Main trend chart
  const metricsForChart = capabilities.metrics.slice(0, 4);
  if (metricsForChart.length > 0) {
    const result = createWidgetWithFallback(
      'line_chart',
      capabilities,
      {
        xColumn: capabilities.timeColumn,
        series: metricsForChart.map(col => ({
          column: col,
          label: formatColumnLabel(col),
          format: capabilities.currencyMetrics.includes(col) ? 'currency' : 'number',
        })),
        title: 'Tendência Principal',
      },
      { row, col: 0, width: 12, height: 4 }
    );
    widgets.push(result.widget);
    if (result.discard) discards.push(result.discard);
    row += 4;
  }
  
  // Funnel stages over time
  if (capabilities.stageFlagsCount >= 2) {
    const result = createWidgetWithFallback(
      'area_chart',
      capabilities,
      {
        xColumn: capabilities.timeColumn,
        series: capabilities.stageFlags.slice(0, 5).map(col => ({
          column: col,
          label: formatColumnLabel(col),
        })),
        title: 'Funil por Tempo',
        stacked: true,
      },
      { row, col: 0, width: 12, height: 4 }
    );
    widgets.push(result.widget);
    if (result.discard) discards.push(result.discard);
  }
  
  return { widgets, discards };
}

/**
 * Generate Funnel tab widgets
 */
function generateFunnelWidgets(
  capabilities: DatasetCapabilities,
  plan?: DashboardPlan
): { widgets: CompiledWidget[]; discards: DiscardInfo[] } {
  const widgets: CompiledWidget[] = [];
  const discards: DiscardInfo[] = [];
  
  if (capabilities.stageFlagsCount < 3) {
    return { widgets, discards };
  }
  
  // Main funnel
  widgets.push({
    id: generateWidgetId(),
    type: 'funnel_chart',
    config: {
      stages: capabilities.stageFlags.slice(0, 7).map(col => ({
        column: col,
        label: formatColumnLabel(col),
      })),
      idColumn: capabilities.idColumn,
      showRates: true,
    },
    position: { row: 0, col: 0, width: 8, height: 6 },
  });
  
  // Conversion rates KPIs
  widgets.push({
    id: generateWidgetId(),
    type: 'kpi_cards',
    config: {
      kpis: capabilities.stageFlags.slice(0, 6).map((col, i, arr) => ({
        column: col,
        label: formatColumnLabel(col),
        format: 'integer',
        agg: 'truthy_count',
        showRate: i > 0,
        rateBase: arr[0],
      })),
    },
    position: { row: 0, col: 8, width: 4, height: 6 },
  });
  
  // Funnel by dimension
  if (capabilities.dimensions.length > 0) {
    const result = createWidgetWithFallback(
      'ranking_table',
      capabilities,
      {
        dimension: capabilities.dimensions[0],
        metrics: capabilities.stageFlags.slice(0, 3),
        showConversionRates: true,
      },
      { row: 6, col: 0, width: 12, height: 4 }
    );
    widgets.push(result.widget);
    if (result.discard) discards.push(result.discard);
  }
  
  return { widgets, discards };
}

/**
 * Generate Table tab widgets
 */
function generateTableWidgets(
  capabilities: DatasetCapabilities
): { widgets: CompiledWidget[]; discards: DiscardInfo[] } {
  const widgets: CompiledWidget[] = [];
  
  widgets.push({
    id: generateWidgetId(),
    type: 'data_table',
    config: {
      columns: capabilities.columns,
      paginated: true,
      pageSize: 50,
      searchable: true,
      exportable: true,
    },
    position: { row: 0, col: 0, width: 12, height: 10 },
  });
  
  return { widgets, discards: [] };
}

/**
 * Generate Explore tab widgets
 */
function generateExploreWidgets(
  capabilities: DatasetCapabilities
): { widgets: CompiledWidget[]; discards: DiscardInfo[] } {
  const widgets: CompiledWidget[] = [];
  const discards: DiscardInfo[] = [];
  
  if (capabilities.dimensions.length === 0) {
    return { widgets, discards };
  }
  
  let row = 0;
  
  // Rankings for each dimension
  for (const dim of capabilities.dimensions.slice(0, 3)) {
    const metric = capabilities.stageFlags[0] || capabilities.metrics[0];
    if (metric) {
      const result = createWidgetWithFallback(
        'ranking_table',
        capabilities,
        {
          dimension: dim,
          metric,
          limit: 10,
          title: `Top ${formatColumnLabel(dim)}`,
        },
        { row, col: (row / 4) % 2 === 0 ? 0 : 6, width: 6, height: 4 }
      );
      widgets.push(result.widget);
      if (result.discard) discards.push(result.discard);
      
      if (widgets.length % 2 === 0) {
        row += 4;
      }
    }
  }
  
  return { widgets, discards };
}

/**
 * Generate Efficiency tab widgets
 */
function generateEfficiencyWidgets(
  capabilities: DatasetCapabilities
): { widgets: CompiledWidget[]; discards: DiscardInfo[] } {
  const widgets: CompiledWidget[] = [];
  const discards: DiscardInfo[] = [];
  
  if (capabilities.currencyMetrics.length === 0 || capabilities.metricsCount < 2) {
    return { widgets, discards };
  }
  
  // Cost KPIs
  widgets.push({
    id: generateWidgetId(),
    type: 'kpi_cards',
    config: {
      kpis: capabilities.currencyMetrics.slice(0, 4).map(col => ({
        column: col,
        label: formatColumnLabel(col),
        format: 'currency',
        agg: 'sum',
        goalDirection: 'lower_better',
      })),
    },
    position: { row: 0, col: 0, width: 12, height: 2 },
  });
  
  // Cost trend
  if (capabilities.hasTime && capabilities.timeColumn) {
    const result = createWidgetWithFallback(
      'line_chart',
      capabilities,
      {
        xColumn: capabilities.timeColumn,
        series: capabilities.currencyMetrics.slice(0, 3).map(col => ({
          column: col,
          label: formatColumnLabel(col),
          format: 'currency',
        })),
        title: 'Custos por Período',
      },
      { row: 2, col: 0, width: 12, height: 4 }
    );
    widgets.push(result.widget);
    if (result.discard) discards.push(result.discard);
  }
  
  return { widgets, discards };
}

/**
 * Format column name to display label
 */
function formatColumnLabel(column: string): string {
  return column
    .replace(/^st_/, '')
    .replace(/_total$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Compile a dashboard plan into a validated layout
 */
export function compileLayout(
  capabilities: DatasetCapabilities,
  plan?: DashboardPlan,
  datasetId?: string
): CompilationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const allDiscards: DiscardInfo[] = [];
  const trace: TraceStep[] = [];
  
  const startTime = Date.now();
  
  // Step 1: Generate tabs
  trace.push({
    name: 'generate_tabs',
    status: 'running',
    startedAt: new Date().toISOString(),
  });
  
  let tabResult: TabGenerationResult;
  try {
    tabResult = generateTabs(capabilities);
    warnings.push(...tabResult.warnings);
    allDiscards.push(...tabResult.discards);
    
    trace[trace.length - 1].status = 'done';
    trace[trace.length - 1].completedAt = new Date().toISOString();
    trace[trace.length - 1].outputs = {
      tabsGenerated: tabResult.tabs.map(t => t.id),
      defaultTab: tabResult.defaultTab,
    };
    trace[trace.length - 1].discards = tabResult.discards;
    trace[trace.length - 1].warnings = tabResult.warnings;
  } catch (err) {
    trace[trace.length - 1].status = 'error';
    trace[trace.length - 1].error = String(err);
    errors.push(`Falha ao gerar tabs: ${err}`);
    return { success: false, layout: null, errors, warnings, discards: allDiscards, trace };
  }
  
  // Step 2: Generate widgets for each tab
  trace.push({
    name: 'generate_widgets',
    status: 'running',
    startedAt: new Date().toISOString(),
  });
  
  const compiledTabs: CompiledTab[] = [];
  
  try {
    for (const tab of tabResult.tabs) {
      let widgetResult: { widgets: CompiledWidget[]; discards: DiscardInfo[] };
      
      switch (tab.id) {
        case 'overview':
          widgetResult = generateOverviewWidgets(capabilities, plan);
          break;
        case 'table':
          widgetResult = generateTableWidgets(capabilities);
          break;
        case 'time':
          widgetResult = generateTimeWidgets(capabilities, plan);
          break;
        case 'funnel':
          widgetResult = generateFunnelWidgets(capabilities, plan);
          break;
        case 'explore':
          widgetResult = generateExploreWidgets(capabilities);
          break;
        case 'efficiency':
          widgetResult = generateEfficiencyWidgets(capabilities);
          break;
        default:
          widgetResult = { widgets: [], discards: [] };
      }
      
      allDiscards.push(...widgetResult.discards);
      
      compiledTabs.push({
        id: tab.id,
        label: tab.label,
        icon: tab.icon,
        widgets: widgetResult.widgets,
      });
    }
    
    trace[trace.length - 1].status = 'done';
    trace[trace.length - 1].completedAt = new Date().toISOString();
    trace[trace.length - 1].outputs = {
      totalWidgets: compiledTabs.reduce((sum, t) => sum + t.widgets.length, 0),
    };
  } catch (err) {
    trace[trace.length - 1].status = 'error';
    trace[trace.length - 1].error = String(err);
    errors.push(`Falha ao gerar widgets: ${err}`);
    return { success: false, layout: null, errors, warnings, discards: allDiscards, trace };
  }
  
  // Step 3: Generate global filters
  trace.push({
    name: 'generate_filters',
    status: 'running',
    startedAt: new Date().toISOString(),
  });
  
  const globalFilters: CompiledFilter[] = [];
  
  try {
    // Date range filter if time exists
    if (capabilities.hasTime && capabilities.timeColumn) {
      globalFilters.push({
        column: capabilities.timeColumn,
        label: 'Período',
        type: 'date_range',
      });
    }
    
    // Dimension filters
    for (const dim of capabilities.dimensions.slice(0, 3)) {
      globalFilters.push({
        column: dim,
        label: formatColumnLabel(dim),
        type: 'multiselect',
      });
    }
    
    trace[trace.length - 1].status = 'done';
    trace[trace.length - 1].completedAt = new Date().toISOString();
    trace[trace.length - 1].outputs = { filtersGenerated: globalFilters.length };
  } catch (err) {
    trace[trace.length - 1].status = 'error';
    trace[trace.length - 1].error = String(err);
    warnings.push(`Falha ao gerar filtros: ${err}`);
    // Continue without filters
    trace[trace.length - 1].status = 'done';
  }
  
  // Step 4: Create binding info
  const binding: BindingInfo = {
    datasetId: datasetId || 'unknown',
    mappingVersion: 1,
    schemaHash: capabilities.schemaHash,
    columnNames: capabilities.columns,
    createdAt: new Date().toISOString(),
  };
  
  // Compile final layout
  const layout: CompiledLayout = {
    version: 2,
    tabs: compiledTabs,
    defaultTab: tabResult.defaultTab,
    globalFilters,
    binding,
    createdAt: new Date().toISOString(),
    compilerVersion: COMPILER_VERSION,
  };
  
  // Validation: ensure minimum guarantees
  const hasOverview = layout.tabs.some(t => t.id === 'overview' && t.widgets.length > 0);
  const hasTable = layout.tabs.some(t => t.id === 'table' && t.widgets.length > 0);
  
  if (!hasOverview) {
    errors.push('Layout não contém tab Overview com widgets');
  }
  if (!hasTable) {
    errors.push('Layout não contém tab Tabela com widgets');
  }
  
  const totalWidgets = layout.tabs.reduce((sum, t) => sum + t.widgets.length, 0);
  if (totalWidgets === 0) {
    errors.push('Layout não contém nenhum widget');
  }
  
  return {
    success: errors.length === 0,
    layout: errors.length === 0 ? layout : null,
    errors,
    warnings,
    discards: allDiscards,
    trace,
  };
}