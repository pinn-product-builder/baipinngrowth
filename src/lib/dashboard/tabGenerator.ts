// ============================================================
// DYNAMIC TAB GENERATOR
// Generates tabs based on dataset capabilities
// ============================================================

import { 
  DatasetCapabilities, 
  DynamicTabId, 
  TAB_CATALOG, 
  TabDefinition,
  TabRequirement,
  DiscardInfo 
} from './types';

// TabGenerationResult is now defined in types.ts
import type { TabGenerationResult } from './types';

/**
 * Check if a tab's requirements are met
 */
function checkTabRequirements(
  requirement: TabRequirement,
  capabilities: DatasetCapabilities
): { met: boolean; reason?: string } {
  // Always tabs are always met
  if (requirement.always) {
    return { met: true };
  }
  
  // Check time requirement
  if (requirement.requiresTime && !capabilities.hasTime) {
    return { met: false, reason: 'Coluna de tempo não encontrada' };
  }
  
  // Check currency requirement
  if (requirement.requiresCurrency && capabilities.currencyMetrics.length === 0) {
    return { met: false, reason: 'Métricas de custo/valor não encontradas' };
  }
  
  // Check stage flags
  if (requirement.minStageFlags && capabilities.stageFlagsCount < requirement.minStageFlags) {
    return { 
      met: false, 
      reason: `Mínimo ${requirement.minStageFlags} etapas de funil necessárias, encontradas ${capabilities.stageFlagsCount}` 
    };
  }
  
  // Check dimensions
  if (requirement.minDimensions && capabilities.dimensionsCount < requirement.minDimensions) {
    return { 
      met: false, 
      reason: `Mínimo ${requirement.minDimensions} dimensões necessárias, encontradas ${capabilities.dimensionsCount}` 
    };
  }
  
  // Check metrics
  if (requirement.minMetrics && capabilities.metricsCount < requirement.minMetrics) {
    return { 
      met: false, 
      reason: `Mínimo ${requirement.minMetrics} métricas necessárias, encontradas ${capabilities.metricsCount}` 
    };
  }
  
  return { met: true };
}

/**
 * Generate tabs based on dataset capabilities
 */
export function generateTabs(capabilities: DatasetCapabilities): TabGenerationResult {
  const enabledTabs: TabDefinition[] = [];
  const discarded: DiscardInfo[] = [];
  const warnings: string[] = [];
  
  // Check each tab in the catalog
  for (const tab of TAB_CATALOG) {
    const check = checkTabRequirements(tab.requires, capabilities);
    
    if (check.met) {
      enabledTabs.push(tab);
    } else {
      discarded.push({
        item: tab.label,
        type: 'tab',
        reason: check.reason || 'Requisitos não atendidos',
      });
    }
  }
  
  // Sort by priority
  enabledTabs.sort((a, b) => a.priority - b.priority);
  
  // Ensure minimum tabs (Overview + Table should always be present)
  const hasOverview = enabledTabs.some(t => t.id === 'overview');
  const hasTable = enabledTabs.some(t => t.id === 'table');
  
  if (!hasOverview) {
    const overviewTab = TAB_CATALOG.find(t => t.id === 'overview');
    if (overviewTab) {
      enabledTabs.unshift(overviewTab);
      warnings.push('Tab Overview adicionada como fallback obrigatório');
    }
  }
  
  if (!hasTable) {
    const tableTab = TAB_CATALOG.find(t => t.id === 'table');
    if (tableTab) {
      enabledTabs.push(tableTab);
      warnings.push('Tab Tabela adicionada como fallback obrigatório');
    }
  }
  
  // Determine default tab
  // Overview is always the default unless funnel has high confidence
  let defaultTab: DynamicTabId = 'overview';
  
  // If we have a solid funnel (5+ stages), consider suggesting it
  if (capabilities.stageFlagsCount >= 5) {
    warnings.push('Funil com alta confiança detectado - considerar como tab padrão');
  }
  
  // Generate warnings for edge cases
  if (enabledTabs.length <= 2) {
    warnings.push('Apenas tabs mínimas disponíveis - dataset pode precisar de mais colunas');
  }
  
  if (!capabilities.hasTime && !capabilities.idColumn) {
    warnings.push('Dataset sem coluna de tempo ou ID - funcionalidades limitadas');
  }
  
  return {
    tabs: enabledTabs,
    defaultTab,
    discarded,
    warnings,
  };
}

/**
 * Map old tab IDs to new dynamic tab IDs
 */
export function mapLegacyTabId(legacyId: string): DynamicTabId | null {
  const mapping: Record<string, DynamicTabId> = {
    'decisoes': 'overview',
    'executivo': 'overview',
    'funil': 'funnel',
    'eficiencia': 'efficiency',
    'tendencias': 'time',
    'detalhes': 'table',
  };
  
  return mapping[legacyId.toLowerCase()] || null;
}

/**
 * Map new dynamic tab IDs to legacy display names (for backward compatibility)
 */
export function getDynamicTabLabel(tabId: DynamicTabId): string {
  const labels: Record<DynamicTabId, string> = {
    'overview': 'Overview',
    'table': 'Tabela',
    'time': 'Tendências',
    'funnel': 'Funil',
    'explore': 'Explorar',
    'efficiency': 'Eficiência',
  };
  
  return labels[tabId] || tabId;
}