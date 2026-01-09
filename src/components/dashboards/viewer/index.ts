export { default as ModernDashboardViewer } from './ModernDashboardViewer';
export { default as DashboardFilterBar } from './DashboardFilterBar';
export { default as DashboardTabs } from './DashboardTabs';
export { default as KPICard } from './KPICard';
export { default as AlertsInsights } from './AlertsInsights';
export { default as DetailDrawer } from './DetailDrawer';
export { default as EnhancedDataTable } from './EnhancedDataTable';
export { default as TrendCharts } from './TrendCharts';
export { default as DashboardErrorBoundary } from './DashboardErrorBoundary';
export { default as DiagnosticsDrawer } from './DiagnosticsDrawer';
export { default as ThemeToggle } from './ThemeToggle';
export { default as AIAnalystDrawer } from './AIAnalystDrawer';
export { default as AIAnalystButton } from './AIAnalystButton';
export { default as AIEditDrawer } from './AIEditDrawer';
export { DatasetValidator, validateDataset, type ValidationResult, type ValidationIssue, type ValidationStatus } from './DatasetValidator';

// Template engine exports
export { 
  generateTemplateConfig, 
  getDefaultTemplateConfig,
  analyzeColumns,
  generateColumnLabel,
  getDiagnosticInfo,
  AFONSINA_TEMPLATE,
  type TemplateConfig,
  type ColumnConfig,
  type ColumnType,
  type DiagnosticInfo
} from './templateEngine';

// Dataset normalizer exports  
export {
  normalizeDataset,
  parseNumber,
  parseCurrency,
  parsePercent,
  parseDate,
  formatValue,
  formatCompactNumber,
  type NormalizedDataset,
  type NormalizedColumn,
  type ColumnWarning,
  type ColumnStats
} from './datasetNormalizer';

// Dashboard spec exports
export * from './types/dashboardSpec';
