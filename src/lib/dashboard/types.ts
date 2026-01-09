// ============================================================
// ADAPTIVE DASHBOARD TYPES
// Core types for 100% dataset-adaptive dashboards
// ============================================================

/**
 * Dataset Capabilities - what the dataset can support
 * Detected from column analysis
 */
export interface DatasetCapabilities {
  /** Has valid time/date column */
  hasTime: boolean;
  /** Time column name if detected */
  timeColumn: string | null;
  /** Number of funnel stage columns detected (>= 3 for funnel tab) */
  stageFlagsCount: number;
  /** Funnel stage columns in order */
  stageFlags: string[];
  /** Number of dimension columns detected */
  dimensionsCount: number;
  /** Dimension columns */
  dimensions: string[];
  /** Number of metric columns detected */
  metricsCount: number;
  /** Metric columns (numeric values) */
  metrics: string[];
  /** Currency metric columns */
  currencyMetrics: string[];
  /** ID column if detected */
  idColumn: string | null;
  /** Total row count */
  rowCount: number;
  /** Schema hash for binding lock */
  schemaHash: string;
  /** Column names */
  columns: string[];
}

/**
 * Dynamic Tab IDs - generated based on capabilities
 */
export type DynamicTabId = 
  | 'overview'    // ALWAYS present - minimum guaranteed
  | 'table'       // ALWAYS present - minimum guaranteed
  | 'time'        // Only if hasTime
  | 'funnel'      // Only if stageFlagsCount >= 3
  | 'explore'     // Only if dimensionsCount >= 1
  | 'efficiency'; // Only if currencyMetrics exist

/**
 * Tab definition with visibility rules
 */
export interface TabDefinition {
  id: DynamicTabId;
  label: string;
  icon: string;
  /** Capability requirements */
  requires: TabRequirement;
  /** Priority for ordering (lower = first) */
  priority: number;
}

/**
 * Tab visibility requirement
 */
export interface TabRequirement {
  /** Minimum capabilities needed */
  minStageFlags?: number;
  minDimensions?: number;
  minMetrics?: number;
  requiresTime?: boolean;
  requiresCurrency?: boolean;
  /** Always show this tab */
  always?: boolean;
}

/**
 * Widget type registry
 */
export type WidgetType = 
  | 'kpi_cards'
  | 'line_chart'
  | 'bar_chart'
  | 'area_chart'
  | 'funnel_chart'
  | 'ranking_table'
  | 'data_table'
  | 'insight_list'
  | 'status_card';

/**
 * Widget requirements declaration
 */
export interface WidgetRequirements {
  /** Widget type */
  type: WidgetType;
  /** Display name */
  label: string;
  /** Required capabilities */
  requires: {
    timeColumn?: boolean;
    minStageFlags?: number;
    minDimensions?: number;
    minMetrics?: number;
    currencyMetric?: boolean;
  };
  /** Fallback widget if requirements not met */
  fallbackTo?: WidgetType | null;
  /** Fallback reason message */
  fallbackReason?: string;
}

/**
 * Widget catalog - all available widgets with requirements
 */
export const WIDGET_CATALOG: Record<WidgetType, WidgetRequirements> = {
  kpi_cards: {
    type: 'kpi_cards',
    label: 'KPI Cards',
    requires: { minMetrics: 1 },
    fallbackTo: 'status_card',
    fallbackReason: 'Nenhuma métrica numérica encontrada',
  },
  line_chart: {
    type: 'line_chart',
    label: 'Gráfico de Linhas',
    requires: { timeColumn: true, minMetrics: 1 },
    fallbackTo: 'bar_chart',
    fallbackReason: 'Coluna de tempo não encontrada',
  },
  bar_chart: {
    type: 'bar_chart',
    label: 'Gráfico de Barras',
    requires: { minDimensions: 1, minMetrics: 1 },
    fallbackTo: 'data_table',
    fallbackReason: 'Dimensão ou métrica não encontrada',
  },
  area_chart: {
    type: 'area_chart',
    label: 'Gráfico de Área',
    requires: { timeColumn: true, minMetrics: 1 },
    fallbackTo: 'bar_chart',
    fallbackReason: 'Coluna de tempo não encontrada',
  },
  funnel_chart: {
    type: 'funnel_chart',
    label: 'Funil',
    requires: { minStageFlags: 3 },
    fallbackTo: 'bar_chart',
    fallbackReason: 'Menos de 3 etapas de funil detectadas',
  },
  ranking_table: {
    type: 'ranking_table',
    label: 'Ranking',
    requires: { minDimensions: 1, minMetrics: 1 },
    fallbackTo: 'data_table',
    fallbackReason: 'Dimensão ou métrica não encontrada',
  },
  data_table: {
    type: 'data_table',
    label: 'Tabela de Dados',
    requires: {},
    fallbackTo: null, // Always available
  },
  insight_list: {
    type: 'insight_list',
    label: 'Lista de Insights',
    requires: { minMetrics: 2 },
    fallbackTo: 'status_card',
    fallbackReason: 'Poucas métricas para gerar insights',
  },
  status_card: {
    type: 'status_card',
    label: 'Status do Dataset',
    requires: {},
    fallbackTo: null, // Always available
  },
};

/**
 * Tab catalog with capability requirements
 */
export const TAB_CATALOG: TabDefinition[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'LayoutDashboard',
    requires: { always: true },
    priority: 0,
  },
  {
    id: 'table',
    label: 'Tabela',
    icon: 'Table',
    requires: { always: true },
    priority: 100,
  },
  {
    id: 'time',
    label: 'Tempo',
    icon: 'Clock',
    requires: { requiresTime: true },
    priority: 20,
  },
  {
    id: 'funnel',
    label: 'Funil',
    icon: 'GitBranch',
    requires: { minStageFlags: 3 },
    priority: 30,
  },
  {
    id: 'explore',
    label: 'Explorar',
    icon: 'Search',
    requires: { minDimensions: 1 },
    priority: 40,
  },
  {
    id: 'efficiency',
    label: 'Eficiência',
    icon: 'TrendingUp',
    requires: { requiresCurrency: true, minMetrics: 2 },
    priority: 50,
  },
];

/**
 * Binding info for schema change detection
 */
export interface BindingInfo {
  datasetId: string;
  mappingVersion: number;
  schemaHash: string;
  columnNames: string[];
  createdAt: string;
}

/**
 * Creation trace step
 */
export interface TraceStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  warnings?: string[];
  discards?: DiscardInfo[];
  error?: string;
}

/**
 * Discard info for audit
 */
export interface DiscardInfo {
  item: string;
  type: 'tab' | 'widget' | 'kpi' | 'chart' | 'filter' | 'funnel_stage';
  reason: string;
  fallback?: string;
}

/**
 * Full creation trace
 */
export interface CreationTrace {
  traceId: string;
  dashboardDraftId?: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'failed';
  steps: TraceStep[];
  summary: {
    tabsGenerated: string[];
    tabsDiscarded: DiscardInfo[];
    widgetsGenerated: number;
    widgetsDiscarded: DiscardInfo[];
    warnings: string[];
  };
}

/**
 * Smoke test configuration
 */
export interface SmokeTestConfig {
  /** Test aggregate endpoint */
  testAggregate: boolean;
  /** Test details endpoint */
  testDetails: boolean;
  /** Minimum KPIs expected */
  minKpis: number;
  /** Minimum rows expected */
  minRows: number;
  /** Check for NaN/Infinity */
  checkInvalidNumbers: boolean;
}

/**
 * Smoke test result
 */
export interface SmokeTestResult {
  passed: boolean;
  aggregateOk: boolean;
  detailsOk: boolean;
  kpisCount: number;
  rowsCount: number;
  hasInvalidNumbers: boolean;
  errors: string[];
  warnings: string[];
  traceId: string;
}

/**
 * Gate check result
 */
export interface GateCheckResult {
  passed: boolean;
  smokeTest: SmokeTestResult;
  renderTest: {
    passed: boolean;
    error?: string;
  };
  blockReasons: string[];
  canProceed: boolean;
}

/**
 * Result of tab generation (exported from tabGenerator but declared here for convenience)
 */
export interface TabGenerationResult {
  /** Enabled tabs in order */
  tabs: TabDefinition[];
  /** Default tab ID */
  defaultTab: DynamicTabId;
  /** Tabs that were discarded with reasons */
  discarded: DiscardInfo[];
  /** Warnings generated during analysis */
  warnings: string[];
}

/**
 * Compiled layout (output of LayoutCompiler)
 */
export interface CompiledLayout {
  version: number;
  tabs: CompiledTab[];
  defaultTab: DynamicTabId;
  globalFilters: CompiledFilter[];
  binding: BindingInfo;
  createdAt: string;
  compilerVersion: string;
}

/**
 * Compiled tab with widgets
 */
export interface CompiledTab {
  id: DynamicTabId;
  label: string;
  icon: string;
  widgets: CompiledWidget[];
}

/**
 * Compiled widget ready for rendering
 */
export interface CompiledWidget {
  id: string;
  type: WidgetType;
  originalType?: WidgetType; // If fallback was applied
  fallbackReason?: string;
  config: Record<string, any>;
  position: {
    row: number;
    col: number;
    width: number;
    height: number;
  };
}

/**
 * Compiled filter
 */
export interface CompiledFilter {
  column: string;
  label: string;
  type: 'select' | 'multiselect' | 'search' | 'date_range';
}