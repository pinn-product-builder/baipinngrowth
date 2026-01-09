// ============================================================
// CREATION TRACE
// Audit system for dashboard creation
// ============================================================

import {
  CreationTrace,
  TraceStep,
  DiscardInfo,
} from './types';

/**
 * Generate a unique trace ID
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `trace_${timestamp}_${random}`;
}

/**
 * Create a new creation trace
 */
export function createTrace(dashboardDraftId?: string): CreationTrace {
  return {
    traceId: generateTraceId(),
    dashboardDraftId,
    startedAt: new Date().toISOString(),
    status: 'running',
    steps: [],
    summary: {
      tabsGenerated: [],
      tabsDiscarded: [],
      widgetsGenerated: 0,
      widgetsDiscarded: [],
      warnings: [],
    },
  };
}

/**
 * Add a step to the trace
 */
export function addTraceStep(
  trace: CreationTrace,
  step: Omit<TraceStep, 'status'> & { status?: TraceStep['status'] }
): CreationTrace {
  return {
    ...trace,
    steps: [
      ...trace.steps,
      {
        ...step,
        status: step.status || 'pending',
        startedAt: step.startedAt || new Date().toISOString(),
      },
    ],
  };
}

/**
 * Update a step in the trace
 */
export function updateTraceStep(
  trace: CreationTrace,
  stepName: string,
  updates: Partial<TraceStep>
): CreationTrace {
  return {
    ...trace,
    steps: trace.steps.map(step =>
      step.name === stepName
        ? {
            ...step,
            ...updates,
            durationMs: updates.completedAt && step.startedAt
              ? new Date(updates.completedAt).getTime() - new Date(step.startedAt).getTime()
              : step.durationMs,
          }
        : step
    ),
  };
}

/**
 * Complete the trace with final status
 */
export function completeTrace(
  trace: CreationTrace,
  status: 'success' | 'failed',
  summary?: Partial<CreationTrace['summary']>
): CreationTrace {
  return {
    ...trace,
    completedAt: new Date().toISOString(),
    status,
    summary: {
      ...trace.summary,
      ...summary,
    },
  };
}

/**
 * Collect all discards from trace steps
 */
export function collectDiscards(trace: CreationTrace): DiscardInfo[] {
  const discards: DiscardInfo[] = [];
  
  for (const step of trace.steps) {
    if (step.discards) {
      discards.push(...step.discards);
    }
  }
  
  return discards;
}

/**
 * Collect all warnings from trace steps
 */
export function collectWarnings(trace: CreationTrace): string[] {
  const warnings: string[] = [];
  
  for (const step of trace.steps) {
    if (step.warnings) {
      warnings.push(...step.warnings);
    }
  }
  
  return warnings;
}

/**
 * Format trace for JSON export
 */
export function formatTraceForExport(trace: CreationTrace): object {
  const discards = collectDiscards(trace);
  const warnings = collectWarnings(trace);
  
  return {
    ...trace,
    summary: {
      ...trace.summary,
      allDiscards: discards,
      allWarnings: warnings,
      totalSteps: trace.steps.length,
      failedSteps: trace.steps.filter(s => s.status === 'error').length,
      totalDurationMs: trace.completedAt && trace.startedAt
        ? new Date(trace.completedAt).getTime() - new Date(trace.startedAt).getTime()
        : null,
    },
  };
}

/**
 * Format trace for UI display
 */
export function formatTraceForUI(trace: CreationTrace): {
  steps: Array<{
    name: string;
    status: string;
    statusIcon: string;
    duration: string;
    warnings: number;
    discards: number;
  }>;
  summary: {
    status: 'success' | 'warning' | 'error';
    message: string;
    tabsGenerated: number;
    widgetsGenerated: number;
    totalDiscards: number;
    totalWarnings: number;
  };
} {
  const discards = collectDiscards(trace);
  const warnings = collectWarnings(trace);
  
  const steps = trace.steps.map(step => ({
    name: getStepDisplayName(step.name),
    status: step.status,
    statusIcon: getStatusIcon(step.status),
    duration: step.durationMs ? `${step.durationMs}ms` : '-',
    warnings: step.warnings?.length || 0,
    discards: step.discards?.length || 0,
  }));
  
  const failedSteps = trace.steps.filter(s => s.status === 'error').length;
  
  return {
    steps,
    summary: {
      status: failedSteps > 0 ? 'error' : warnings.length > 5 ? 'warning' : 'success',
      message: failedSteps > 0
        ? `${failedSteps} etapa(s) falharam`
        : warnings.length > 0
        ? `Concluído com ${warnings.length} aviso(s)`
        : 'Concluído com sucesso',
      tabsGenerated: trace.summary.tabsGenerated.length,
      widgetsGenerated: trace.summary.widgetsGenerated,
      totalDiscards: discards.length,
      totalWarnings: warnings.length,
    },
  };
}

/**
 * Get display name for step
 */
function getStepDisplayName(stepName: string): string {
  const names: Record<string, string> = {
    'dataset_binding': 'Vinculação do Dataset',
    'introspect': 'Análise do Schema',
    'mapping': 'Mapeamento de Colunas',
    'generate_plan': 'Geração do Plano (LLM1)',
    'compile_layout': 'Compilação do Layout',
    'generate_code': 'Geração de Código (LLM2)',
    'smoke_test': 'Teste de Fumaça',
    'render_test': 'Teste de Renderização',
    'generate_tabs': 'Geração de Tabs',
    'generate_widgets': 'Geração de Widgets',
    'generate_filters': 'Geração de Filtros',
  };
  
  return names[stepName] || stepName;
}

/**
 * Get status icon
 */
function getStatusIcon(status: TraceStep['status']): string {
  switch (status) {
    case 'pending': return '⏳';
    case 'running': return '🔄';
    case 'done': return '✅';
    case 'error': return '❌';
    case 'skipped': return '⏭️';
    default: return '❓';
  }
}