// Auto-Builder v2 Types

export type WizardStepV2 = 
  | 'select'      // 1. Dataset selection
  | 'analyze'     // 2. Auto analysis (introspection)
  | 'mapping'     // 3. Column mapping (confirm/edit)
  | 'prompt'      // 4. Dashboard prompt (LLM1)
  | 'generate'    // 5. Code generation (LLM2)
  | 'preview'     // 6. Preview & smoke test
  | 'save';       // 7. Save dashboard

export type GenerationMode = 'react_lovable' | 'html_js';

export interface Dataset {
  id: string;
  name: string;
  object_name: string | null;
  primary_time_column: string | null;
  grain_hint: string | null;
  last_introspected_at: string | null;
  _column_count?: number;
  tenant_data_sources?: { name: string } | null;
}

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export interface DatasetProfile {
  dataset_id: string;
  dataset_name: string;
  columns: ColumnProfile[];
  sample_rows: Record<string, any>[];
  stats: DatasetStats;
  semantic_model?: any;
}

export interface ColumnProfile {
  name: string;
  db_type: string;
  display_label?: string;
  semantic_type?: string;
  role_hint?: string;
  stats?: ColumnStats;
  ai_suggested_role?: ColumnRole;
  ai_confidence?: number;
  ai_reason?: string;
}

export interface ColumnStats {
  null_rate?: number;
  distinct_count?: number;
  date_parseable_rate?: number;
  numeric_rate?: number;
  boolean_like_rate?: number;
  sample_values?: any[];
}

export interface DatasetStats {
  total_rows?: number;
  time_parse_rate?: number;
  date_range?: { min: string; max: string };
}

export type ColumnRole = 
  | 'time'
  | 'id_primary'
  | 'id_secondary'
  | 'dimension'
  | 'funnel_stage'
  | 'metric_numeric'
  | 'metric_currency'
  | 'metric_percent'
  | 'text_detail'
  | 'ignored';

export interface ColumnMapping {
  column_name: string;
  role: ColumnRole;
  display_label?: string;
  filter_type?: 'select' | 'multi-select' | 'search-select';
  funnel_order?: number;
  truthy_rule?: 'default' | 'custom';
  custom_truthy_values?: string[];
  granularity?: 'day' | 'week' | 'month';
  is_hidden?: boolean;
}

export interface DashboardPrompt {
  prompt_final: string;
  user_requirements: string;
  dashboard_plan: DashboardPlan;
  recommended_mode: GenerationMode;
  why_recommended: string;
  assumptions: string[];
  warnings: string[];
}

export interface DashboardPlan {
  version: number;
  title: string;
  tabs: TabDefinition[];
  filters: FilterDefinition[];
  kpis: KPIDefinition[];
  charts: ChartDefinition[];
  funnel?: FunnelDefinition;
  time_column: string | null;
  id_column: string | null;
  confidence: number;
}

export interface TabDefinition {
  name: string;
  objective: string;
}

export interface FilterDefinition {
  column: string;
  label: string;
  type: 'select' | 'multiselect' | 'search' | 'date_range';
}

export interface KPIDefinition {
  id: string;
  column: string;
  label: string;
  formula: string;
  format: 'integer' | 'currency' | 'percent' | 'float';
  goal_direction: 'higher_better' | 'lower_better';
}

export interface ChartDefinition {
  id: string;
  type: 'line' | 'bar' | 'area';
  title: string;
  x_column: string;
  series: { column: string; label: string; aggregation: string }[];
}

export interface FunnelDefinition {
  title: string;
  base_column?: string;
  stages: FunnelStage[];
}

export interface FunnelStage {
  column: string;
  label: string;
  order: number;
}

export interface WizardState {
  step: WizardStepV2;
  selectedDatasetId: string | null;
  dashboardName: string;
  datasetProfile: DatasetProfile | null;
  columnMappings: ColumnMapping[];
  dashboardPrompt: DashboardPrompt | null;
  generationMode: GenerationMode;
  generatedSpec: any | null;
  generatedHtml: string | null;
  isLoading: boolean;
  error: string | null;
  traceId: string | null;
}

export interface SmokeTestResult {
  passed: boolean;
  kpis_valid: boolean;
  funnel_valid: boolean;
  rows_returned: number;
  errors: string[];
  warnings: string[];
  trace_id: string;
}

export interface DashboardDraft {
  id: string;
  dataset_id: string;
  tenant_id: string;
  name: string;
  mapping_json: ColumnMapping[];
  prompt_json: DashboardPrompt | null;
  generation_mode: GenerationMode;
  spec_json: any | null;
  html_content: string | null;
  status: 'mapping' | 'prompt' | 'generating' | 'preview' | 'saved';
  trace_id: string;
  created_at: string;
  updated_at: string;
}
