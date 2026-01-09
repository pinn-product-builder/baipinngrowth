// ============================================================
// SMOKE TEST
// Validates that a dashboard can render before saving
// ============================================================

import { supabase } from '@/integrations/supabase/client';
import {
  SmokeTestConfig,
  SmokeTestResult,
  GateCheckResult,
  CompiledLayout,
} from './types';

/**
 * Default smoke test configuration
 */
export const DEFAULT_SMOKE_CONFIG: SmokeTestConfig = {
  testAggregate: true,
  testDetails: true,
  minKpis: 1,
  minRows: 0,
  checkInvalidNumbers: true,
};

/**
 * Generate a trace ID
 */
function generateTraceId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Check for invalid numbers in data
 */
function hasInvalidNumbers(data: Record<string, any>[]): boolean {
  for (const row of data) {
    for (const value of Object.values(row)) {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Run smoke test for a dashboard
 */
export async function runSmokeTest(
  dashboardId: string,
  config: SmokeTestConfig = DEFAULT_SMOKE_CONFIG
): Promise<SmokeTestResult> {
  const traceId = generateTraceId();
  const errors: string[] = [];
  const warnings: string[] = [];
  let aggregateOk = false;
  let detailsOk = false;
  let kpisCount = 0;
  let rowsCount = 0;
  let hasInvalid = false;
  
  // Calculate date range (last 30 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const start = startDate.toISOString().split('T')[0];
  const end = endDate.toISOString().split('T')[0];
  
  // Test aggregate endpoint
  if (config.testAggregate) {
    try {
      const { data: aggResult, error: aggError } = await supabase.functions.invoke(
        'dashboard-data-v2',
        {
          body: {
            dashboard_id: dashboardId,
            start,
            end,
            mode: 'aggregate',
          },
        }
      );
      
      if (aggError) {
        errors.push(`Erro no endpoint de agregação: ${aggError.message}`);
      } else if (!aggResult?.ok) {
        errors.push(`Agregação falhou: ${aggResult?.error?.message || 'erro desconhecido'}`);
      } else {
        aggregateOk = true;
        
        // Check KPIs
        const kpis = aggResult?.aggregations?.kpis || {};
        kpisCount = Object.keys(kpis).length;
        
        if (kpisCount < config.minKpis) {
          warnings.push(`Apenas ${kpisCount} KPIs retornados (mínimo: ${config.minKpis})`);
        }
        
        // Check for invalid numbers in KPIs
        if (config.checkInvalidNumbers) {
          for (const [key, value] of Object.entries(kpis)) {
            if (typeof value === 'number' && !Number.isFinite(value)) {
              hasInvalid = true;
              errors.push(`KPI "${key}" contém valor inválido: ${value}`);
            }
          }
        }
      }
    } catch (err) {
      errors.push(`Exceção no teste de agregação: ${err}`);
    }
  }
  
  // Test details endpoint
  if (config.testDetails) {
    try {
      const { data: detailsResult, error: detailsError } = await supabase.functions.invoke(
        'dashboard-data-v2',
        {
          body: {
            dashboard_id: dashboardId,
            start,
            end,
            mode: 'details',
            page: 1,
            pageSize: 10,
          },
        }
      );
      
      if (detailsError) {
        errors.push(`Erro no endpoint de detalhes: ${detailsError.message}`);
      } else if (!detailsResult?.ok) {
        errors.push(`Detalhes falhou: ${detailsResult?.error?.message || 'erro desconhecido'}`);
      } else {
        detailsOk = true;
        rowsCount = detailsResult?.meta?.total_rows || detailsResult?.rows?.length || 0;
        
        if (rowsCount < config.minRows) {
          warnings.push(`Apenas ${rowsCount} linhas retornadas`);
        }
        
        // Check for invalid numbers
        if (config.checkInvalidNumbers && detailsResult?.rows) {
          if (hasInvalidNumbers(detailsResult.rows)) {
            hasInvalid = true;
            warnings.push('Dados contêm valores numéricos inválidos (NaN/Infinity)');
          }
        }
      }
    } catch (err) {
      errors.push(`Exceção no teste de detalhes: ${err}`);
    }
  }
  
  const passed = errors.length === 0 && aggregateOk && detailsOk;
  
  return {
    passed,
    aggregateOk,
    detailsOk,
    kpisCount,
    rowsCount,
    hasInvalidNumbers: hasInvalid,
    errors,
    warnings,
    traceId,
  };
}

/**
 * Run render test (simulated preview check)
 */
export async function runRenderTest(
  layout: CompiledLayout
): Promise<{ passed: boolean; error?: string }> {
  try {
    // Check layout structure
    if (!layout) {
      return { passed: false, error: 'Layout não definido' };
    }
    
    if (!layout.tabs || layout.tabs.length === 0) {
      return { passed: false, error: 'Layout não contém tabs' };
    }
    
    // Check for required tabs
    const hasOverview = layout.tabs.some(t => t.id === 'overview');
    const hasTable = layout.tabs.some(t => t.id === 'table');
    
    if (!hasOverview) {
      return { passed: false, error: 'Tab Overview obrigatória não encontrada' };
    }
    
    if (!hasTable) {
      return { passed: false, error: 'Tab Tabela obrigatória não encontrada' };
    }
    
    // Check for widgets
    const totalWidgets = layout.tabs.reduce((sum, t) => sum + (t.widgets?.length || 0), 0);
    if (totalWidgets === 0) {
      return { passed: false, error: 'Nenhum widget definido' };
    }
    
    // Verify each widget has required properties
    for (const tab of layout.tabs) {
      for (const widget of tab.widgets || []) {
        if (!widget.id || !widget.type) {
          return { passed: false, error: `Widget inválido na tab ${tab.id}` };
        }
      }
    }
    
    return { passed: true };
  } catch (err) {
    return { passed: false, error: `Erro de validação: ${err}` };
  }
}

/**
 * Run complete gate check (smoke + render)
 */
export async function runGateCheck(
  dashboardId: string,
  layout: CompiledLayout,
  config: SmokeTestConfig = DEFAULT_SMOKE_CONFIG
): Promise<GateCheckResult> {
  const blockReasons: string[] = [];
  
  // Run smoke test
  const smokeTest = await runSmokeTest(dashboardId, config);
  
  // Run render test
  const renderTest = await runRenderTest(layout);
  
  // Collect block reasons
  if (!smokeTest.passed) {
    blockReasons.push(...smokeTest.errors);
  }
  
  if (!renderTest.passed) {
    blockReasons.push(renderTest.error || 'Falha no teste de renderização');
  }
  
  const passed = smokeTest.passed && renderTest.passed;
  
  return {
    passed,
    smokeTest,
    renderTest,
    blockReasons,
    canProceed: passed,
  };
}

/**
 * Format gate check result for UI display
 */
export function formatGateCheckResult(result: GateCheckResult): {
  status: 'success' | 'warning' | 'error';
  title: string;
  description: string;
  details: string[];
} {
  if (result.passed) {
    return {
      status: 'success',
      title: 'Validação aprovada',
      description: 'O dashboard passou em todos os testes e pode ser salvo.',
      details: [
        `${result.smokeTest.kpisCount} KPIs validados`,
        `${result.smokeTest.rowsCount} linhas de dados`,
        ...result.smokeTest.warnings,
      ],
    };
  }
  
  if (result.blockReasons.length > 0) {
    return {
      status: 'error',
      title: 'Validação falhou',
      description: 'O dashboard não pode ser salvo pois falhou nos testes obrigatórios.',
      details: result.blockReasons,
    };
  }
  
  return {
    status: 'warning',
    title: 'Validação com avisos',
    description: 'O dashboard passou nos testes mas possui avisos.',
    details: result.smokeTest.warnings,
  };
}