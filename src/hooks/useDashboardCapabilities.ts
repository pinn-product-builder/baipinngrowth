// ============================================================
// HOOK: useDashboardCapabilities
// Detects and memoizes dataset capabilities for adaptive dashboards
// ============================================================

import { useMemo } from 'react';
import { 
  detectCapabilities, 
  generateTabs, 
  type TabGenerationResult,
} from '@/lib/dashboard';
import type { DatasetCapabilities, DynamicTabId } from '@/lib/dashboard/types';

interface ColumnInfo {
  name: string;
  type?: string;
  semanticType?: string;
  roleHint?: string;
}

interface UseDashboardCapabilitiesProps {
  /** Raw data rows */
  data: Record<string, any>[];
  /** Column metadata from spec or detection */
  columns?: ColumnInfo[];
  /** Dashboard spec if available */
  dashboardSpec?: {
    time?: { column: string } | null;
    funnel?: { stages: { column: string }[] } | null;
    kpis?: { column: string }[];
  } | null;
}

interface UseDashboardCapabilitiesResult {
  /** Detected capabilities */
  capabilities: DatasetCapabilities;
  /** Generated tabs based on capabilities */
  tabs: TabGenerationResult;
  /** Active tab IDs */
  enabledTabs: DynamicTabId[];
  /** Default tab to show */
  defaultTab: DynamicTabId;
  /** Whether capabilities detection ran */
  isDetected: boolean;
}

/**
 * Hook to detect dataset capabilities and generate dynamic tabs
 */
export function useDashboardCapabilities({
  data,
  columns,
  dashboardSpec,
}: UseDashboardCapabilitiesProps): UseDashboardCapabilitiesResult {
  
  // Detect capabilities from data and columns
  const capabilities = useMemo<DatasetCapabilities>(() => {
    if (data.length === 0 && !columns?.length) {
      // Return minimal capabilities
      return {
        hasTime: false,
        timeColumn: null,
        stageFlagsCount: 0,
        stageFlags: [],
        dimensionsCount: 0,
        dimensions: [],
        metricsCount: 0,
        metrics: [],
        currencyMetrics: [],
        idColumn: null,
        rowCount: 0,
        schemaHash: '',
        columns: [],
      };
    }

    // Build column list from various sources
    let columnList: string[] = [];

    if (columns && columns.length > 0) {
      columnList = columns.map(c => c.name);
    } else if (data.length > 0) {
      columnList = Object.keys(data[0]);
    }

    // detectCapabilities takes columns and sample rows
    return detectCapabilities(columnList, data);
  }, [data, columns, dashboardSpec]);

  // Generate tabs based on capabilities
  const tabs = useMemo<TabGenerationResult>(() => {
    return generateTabs(capabilities);
  }, [capabilities]);

  // Extract enabled tab IDs
  const enabledTabs = useMemo<DynamicTabId[]>(() => {
    return tabs.tabs.map(t => t.id);
  }, [tabs]);

  // Get default tab
  const defaultTab = useMemo<DynamicTabId>(() => {
    return tabs.defaultTab;
  }, [tabs]);

  // Check if detection was meaningful
  const isDetected = capabilities.columns.length > 0 || data.length > 0;

  return {
    capabilities,
    tabs,
    enabledTabs,
    defaultTab,
    isDetected,
  };
}

export default useDashboardCapabilities;
