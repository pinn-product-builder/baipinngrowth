import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({ ok: false, error: { code, message, details } }, 400);
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data });
}

// =====================================================
// COLUMN METADATA TYPE
// =====================================================

interface ColumnMeta {
  name: string;
  db_type: string;
  semantic_type: string | null;
  role_hint: string | null;
  display_label: string;
  aggregator_default: string;
  format: string | null;
}

interface ColumnStats {
  null_count: number;
  null_rate: number;
  distinct_count: number;
  min?: number | string;
  max?: number | string;
  avg?: number;
}

interface IntrospectionResult {
  columns: ColumnMeta[];
  row_count: number;
  primary_time_column: string | null;
  grain_hint: string;
  sql_definition?: string;
  column_stats?: Record<string, ColumnStats>;
  sample_rows?: any[];
  detected_roles?: {
    time_columns: string[];
    metric_columns: string[];
    percent_columns: string[];
    dimension_columns: string[];
    funnel_candidates: string[];
  };
}

// =====================================================
// SPEC VALIDATION
// =====================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixedSpec?: any;
}

function validateAndFixSpec(spec: any, columns: ColumnMeta[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Filter out any columns with undefined/null names
  const validColumns = columns.filter(c => c && c.name);
  
  const columnNames = new Set(validColumns.map(c => c.name));
  const columnNamesLower = new Set(validColumns.map(c => c.name.toLowerCase()));
  
  // Create mappings for column name resolution (display_label -> column_name, lowercase -> original)
  const labelToName = new Map<string, string>();
  const lowerToName = new Map<string, string>();
  validColumns.forEach(c => {
    lowerToName.set(c.name.toLowerCase(), c.name);
    if (c.display_label) {
      labelToName.set(c.display_label.toLowerCase(), c.name);
      // Also map label with underscores replaced by spaces
      labelToName.set(c.display_label.toLowerCase().replace(/_/g, ' '), c.name);
    }
  });
  
  // Function to resolve column name from AI-generated value
  const resolveColumnName = (aiColumn: string | undefined): string | null => {
    if (!aiColumn) return null;
    
    // Direct match
    if (columnNames.has(aiColumn)) return aiColumn;
    
    // Lowercase match
    const lower = aiColumn.toLowerCase();
    if (lowerToName.has(lower)) return lowerToName.get(lower)!;
    
    // Match by display_label
    if (labelToName.has(lower)) return labelToName.get(lower)!;
    
    // Try with spaces converted to underscores
    const withUnderscores = lower.replace(/\s+/g, '_');
    if (lowerToName.has(withUnderscores)) return lowerToName.get(withUnderscores)!;
    
    return null;
  };
  
  const numericColumns = new Set(
    validColumns
      .filter(c => ['currency', 'count', 'metric', 'percent'].includes(c.semantic_type || ''))
      .map(c => c.name)
  );
  const timeColumns = validColumns.filter(c => c.semantic_type === 'time').map(c => c.name);
  
  // Also detect time columns by name pattern if semantic type not set
  const timeByName = validColumns.filter(c => 
    c.name && (
      c.name.includes('created') || c.name.includes('date') || 
      c.name.includes('dia') || c.name.includes('data') ||
      c.name.includes('time') || c.name.includes('timestamp')
    )
  ).map(c => c.name);
  
  const allTimeColumns = [...new Set([...timeColumns, ...timeByName])];
  
  // CRM funnel column names that should be treated as countable
  const funnelColumnNames = new Set([
    'entrada', 'lead_ativo', 'qualificado', 'exp_agendada', 'exp_realizada',
    'exp_nao_confirmada', 'faltou_exp', 'reagendou', 'venda', 'perdida', 'aluno_ativo'
  ]);

  // Deep clone spec to fix
  const fixed = JSON.parse(JSON.stringify(spec));

  // Validate version
  if (typeof fixed.version !== 'number') {
    fixed.version = 1;
    warnings.push('Adicionada versão 1 ao spec');
  }

  // Validate and fix time column
  if (fixed.time?.column) {
    const resolvedTime = resolveColumnName(fixed.time.column);
    if (resolvedTime) {
      fixed.time.column = resolvedTime;
    } else if (allTimeColumns.length > 0) {
      fixed.time.column = allTimeColumns[0];
      fixed.time.type = 'date';
      warnings.push(`Coluna de tempo corrigida para ${allTimeColumns[0]}`);
    } else {
      delete fixed.time;
      warnings.push('Sem coluna de tempo detectada');
    }
  } else if (allTimeColumns.length > 0) {
    fixed.time = { column: allTimeColumns[0], type: 'date' };
    warnings.push(`Coluna de tempo definida para ${allTimeColumns[0]}`);
  }

  // Validate and fix KPIs
  if (Array.isArray(fixed.kpis)) {
    fixed.kpis = fixed.kpis.map((kpi: any) => {
      const resolved = resolveColumnName(kpi.column);
      if (resolved) {
        kpi.column = resolved;
      }
      return kpi;
    }).filter((kpi: any) => {
      const resolved = resolveColumnName(kpi.column);
      if (!resolved) {
        warnings.push(`KPI removido: coluna ${kpi.column || 'indefinida'} não existe`);
        return false;
      }
      
      // Allow CRM funnel columns to be used as KPIs (they can be counted)
      const isFunnelColumn = funnelColumnNames.has(resolved.toLowerCase());
      if (!numericColumns.has(resolved) && !isFunnelColumn && kpi.agg !== 'count') {
        kpi.agg = 'count'; // Force count aggregation for non-numeric columns
      }
      
      if (!kpi.label || typeof kpi.label !== 'string') {
        kpi.label = validColumns.find(c => c.name === resolved)?.display_label || resolved;
      }
      
      return true;
    });
  }

  // Validate funnel - allow CRM columns even if not marked as numeric
  if (fixed.funnel?.steps && Array.isArray(fixed.funnel.steps)) {
    fixed.funnel.steps = fixed.funnel.steps.map((step: any) => {
      const resolved = resolveColumnName(step.column);
      if (resolved) {
        step.column = resolved;
      }
      return step;
    }).filter((step: any) => {
      const resolved = resolveColumnName(step.column);
      if (!resolved) {
        warnings.push(`Etapa de funil removida: coluna ${step.column || 'indefinida'} não existe`);
        return false;
      }
      step.column = resolved;
      
      // Allow if it's numeric OR if it's a known CRM funnel column name
      const isFunnelColumn = funnelColumnNames.has(resolved.toLowerCase()) ||
        resolved.toLowerCase().includes('_total') ||
        resolved.toLowerCase().includes('leads');
      if (!numericColumns.has(resolved) && !isFunnelColumn) {
        // Still allow - we'll use count aggregation
        warnings.push(`Etapa ${step.label}: usando contagem para ${resolved}`);
      }
      if (!step.label || typeof step.label !== 'string') {
        step.label = validColumns.find(c => c.name === resolved)?.display_label || resolved;
      }
      return true;
    });

    if (fixed.funnel.steps.length < 2) {
      delete fixed.funnel;
      warnings.push('Funil removido: menos de 2 etapas válidas');
    }
  }

  // Validate charts
  if (Array.isArray(fixed.charts)) {
    fixed.charts = fixed.charts.map((chart: any) => {
      // Fix x axis
      const resolvedX = resolveColumnName(chart.x);
      if (resolvedX) {
        chart.x = resolvedX;
      } else if (allTimeColumns.length > 0) {
        chart.x = allTimeColumns[0];
      }
      
      // Fix series
      if (Array.isArray(chart.series)) {
        chart.series = chart.series.map((s: any) => {
          const resolvedY = resolveColumnName(s.y);
          if (resolvedY) {
            s.y = resolvedY;
          }
          return s;
        });
      }
      return chart;
    }).filter((chart: any) => {
      const resolvedX = resolveColumnName(chart.x);
      if (!resolvedX) {
        if (allTimeColumns.length > 0) {
          chart.x = allTimeColumns[0];
          warnings.push(`Chart ${chart.title}: eixo X corrigido para ${allTimeColumns[0]}`);
        } else {
          warnings.push(`Chart ${chart.title} removido: sem eixo X válido`);
          return false;
        }
      }

      if (Array.isArray(chart.series)) {
        chart.series = chart.series.filter((s: any) => {
          const resolvedY = resolveColumnName(s.y);
          if (!resolvedY) {
            warnings.push(`Série ${s.label || s.y} removida: coluna não existe`);
            return false;
          }
          s.y = resolvedY;
          
          // Allow CRM funnel columns in charts
          const isFunnelColumn = funnelColumnNames.has(resolvedY.toLowerCase());
          if (!numericColumns.has(resolvedY) && !isFunnelColumn) {
            warnings.push(`Série ${s.label}: usando contagem para ${resolvedY}`);
          }
          if (!s.label || typeof s.label !== 'string') {
            s.label = validColumns.find(c => c.name === resolvedY)?.display_label || resolvedY;
          }
          return true;
        });
      }

      if (!chart.series || chart.series.length === 0) {
        warnings.push(`Chart ${chart.title} removido: sem séries válidas`);
        return false;
      }

      if (!chart.title || typeof chart.title !== 'string') {
        chart.title = 'Gráfico';
      }

      return true;
    });
  }

  // Validate columns
  if (Array.isArray(fixed.columns)) {
    fixed.columns = fixed.columns.map((col: any) => {
      const resolved = resolveColumnName(col.name);
      if (resolved) {
        col.name = resolved;
      }
      return col;
    }).filter((col: any) => {
      if (!col.name || typeof col.name !== 'string') {
        warnings.push('Coluna sem nome removida');
        return false;
      }
      const resolved = resolveColumnName(col.name);
      if (!resolved) {
        warnings.push(`Coluna ${col.name} removida: não existe no dataset`);
        return false;
      }
      col.name = resolved;
      return true;
    });
  }

  // Ensure UI defaults
  if (!fixed.ui) {
    fixed.ui = {};
  }
  if (!fixed.ui.tabs) {
    fixed.ui.tabs = ['Decisões', 'Executivo', 'Detalhes'];
    if (fixed.funnel) fixed.ui.tabs.splice(2, 0, 'Funil');
    if (fixed.charts?.length > 0) fixed.ui.tabs.splice(-1, 0, 'Tendências');
  }
  if (!fixed.ui.defaultTab) {
    fixed.ui.defaultTab = 'Decisões';
  }
  if (fixed.ui.comparePeriods === undefined) {
    fixed.ui.comparePeriods = true;
  }

  // Check for NaN/Infinity in numeric values
  const checkNaN = (obj: any, path = ''): void => {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'number' && (!Number.isFinite(obj) || Number.isNaN(obj))) {
      errors.push(`Valor numérico inválido em ${path}`);
    }
    if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        checkNaN(obj[key], path ? `${path}.${key}` : key);
      }
    }
  };
  checkNaN(fixed);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixedSpec: fixed
  };
}

// =====================================================
// CRM TRUTHY VALUE PARSING
// =====================================================

function parseTruthy(value: any): boolean {
  if (value === null || value === undefined || value === '') return false;
  const v = String(value).toLowerCase().trim();
  return ['1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x'].includes(v);
}

// Normalize column name for matching
function normalizeColName(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/\s+/g, '_');
}

// CRM column aliases for matching
const CRM_ALIASES: Record<string, string[]> = {
  entrada: ['entrada', 'entrou', 'lead_entrada'],
  venda: ['venda', 'vendeu', 'fechou', 'ganho', 'venda_total', 'sales'],
  qualificado: ['qualificado', 'qualificacao', 'lead_qualificado'],
  tempo: ['created_at', 'data', 'dia', 'date', 'created', 'inserted_at', 'updated_at', 'day'],
  leads: ['leads', 'leads_total', 'leads_new', 'lead_ativo'],
  agendada: ['exp_agendada', 'reuniao_agendada', 'meetings_scheduled', 'agendada'],
  realizada: ['exp_realizada', 'reuniao_realizada', 'meetings_completed', 'realizada'],
};

// =====================================================
// FALLBACK HEURISTIC SPEC GENERATOR
// =====================================================

function generateFallbackSpec(
  columns: ColumnMeta[], 
  datasetName: string,
  introspection?: IntrospectionResult
): any {
  console.log('generateFallbackSpec: Starting with', columns.length, 'columns');
  
  // Build normalized name map
  const normalizedMap = new Map<string, ColumnMeta>();
  columns.forEach(c => {
    normalizedMap.set(normalizeColName(c.name), c);
    if (c.display_label) {
      normalizedMap.set(normalizeColName(c.display_label), c);
    }
  });
  
  // Find column by alias
  const findColumnByAlias = (aliases: string[]): ColumnMeta | undefined => {
    for (const alias of aliases) {
      const norm = normalizeColName(alias);
      if (normalizedMap.has(norm)) {
        return normalizedMap.get(norm);
      }
    }
    return undefined;
  };
  
  // Find time column - check semantic type first, then by name pattern
  let timeCol = columns.find(c => c.semantic_type === 'time');
  if (!timeCol) {
    timeCol = findColumnByAlias(CRM_ALIASES.tempo);
  }
  if (!timeCol) {
    timeCol = columns.find(c => 
      c.name.includes('created') || c.name.includes('date') || 
      c.name.includes('dia') || c.name.includes('data') ||
      c.name.includes('time') || c.name.includes('timestamp')
    );
  }
  
  console.log('generateFallbackSpec: Time column:', timeCol?.name || 'NONE');
  
  const currencyCols = columns.filter(c => c.semantic_type === 'currency');
  const countCols = columns.filter(c => c.semantic_type === 'count');
  const percentCols = columns.filter(c => c.semantic_type === 'percent');
  const metricCols = columns.filter(c => c.semantic_type === 'metric');
  const dimensionCols = columns.filter(c => c.semantic_type === 'dimension');

  // CRM funnel column detection by name (even if type is text/string)
  const funnelColumnNames = [
    'entrada', 'lead_ativo', 'qualificado', 'exp_agendada', 'exp_realizada',
    'exp_nao_confirmada', 'faltou_exp', 'reagendou', 'venda', 'perdida', 'aluno_ativo'
  ];
  
  // Find funnel columns by name pattern
  const funnelCols = columns.filter(c => 
    funnelColumnNames.some(fn => normalizeColName(c.name) === fn || normalizeColName(c.name).includes(fn))
  );
  
  console.log('generateFallbackSpec: Found', funnelCols.length, 'funnel columns by name');

  // Also check for _total suffix patterns (Afonsina style)
  const totalPatterns = [
    'leads_total', 'entrada_total', 'reuniao_agendada_total', 'reuniao_realizada_total', 'venda_total',
    'leads_new', 'meetings_scheduled', 'meetings_completed', 'sales'
  ];
  
  let funnelSteps: ColumnMeta[] = [];
  
  // Try _total pattern first
  for (const pattern of totalPatterns) {
    const matched = columns.find(c => normalizeColName(c.name) === normalizeColName(pattern));
    if (matched && !funnelSteps.includes(matched)) {
      funnelSteps.push(matched);
    }
  }
  
  // If not enough from _total pattern, use CRM funnel columns
  if (funnelSteps.length < 3 && funnelCols.length >= 3) {
    // Order funnel columns logically
    const funnelOrder = ['entrada', 'lead_ativo', 'qualificado', 'exp_agendada', 'exp_realizada', 'venda'];
    funnelSteps = funnelOrder
      .map(name => funnelCols.find(c => normalizeColName(c.name).includes(name)))
      .filter((c): c is ColumnMeta => c !== undefined)
      .slice(0, 6);
  }

  // Fallback: use count columns if still not enough
  if (funnelSteps.length < 3) {
    const additionalFunnel = countCols.filter(c => 
      !funnelSteps.includes(c) && (
        c.name.includes('_total') || c.name.includes('leads') || c.name.includes('entrada') || 
        c.name.includes('reuniao') || c.name.includes('venda') || c.name.includes('meetings') ||
        c.name.includes('sales')
      )
    );
    funnelSteps = [...funnelSteps, ...additionalFunnel].slice(0, 6);
  }
  
  console.log('generateFallbackSpec: Funnel steps:', funnelSteps.map(f => f.name).join(', '));

  const spec: any = {
    version: 1,
    title: datasetName,
    ui: {
      tabs: ['Decisões', 'Executivo', 'Detalhes'],
      defaultTab: 'Decisões',
      comparePeriods: true
    }
  };

  // Time config
  if (timeCol) {
    spec.time = { column: timeCol.name, type: 'date' };
  }

  // Columns config - ALWAYS include all columns
  spec.columns = columns.map(c => ({
    name: c.name,
    type: c.semantic_type === 'currency' ? 'currency' : 
          c.semantic_type === 'percent' ? 'percent' :
          c.semantic_type === 'time' ? 'date' :
          ['count', 'metric'].includes(c.semantic_type || '') ? 'number' : 'string',
    label: c.display_label
  }));

  // KPIs - prioritize key metrics + CRM funnel columns
  const kpiOrder = [
    'custo_total', 'spend', 'cpl', 'cac',
    'leads_total', 'leads_new', 'entrada_total', 'entrada',
    'qualificado', 'exp_agendada', 'exp_realizada',
    'venda_total', 'sales', 'venda', 'reuniao_realizada_total', 'meetings_completed'
  ];
  
  const orderedKpis = kpiOrder
    .map(name => columns.find(c => normalizeColName(c.name) === normalizeColName(name)))
    .filter((c): c is ColumnMeta => c !== undefined);

  // Add CRM funnel columns as KPIs if not already included
  const funnelKpis = funnelCols.filter(c => !orderedKpis.includes(c));

  const remainingKpis = [...currencyCols, ...countCols]
    .filter(c => !orderedKpis.includes(c) && !funnelKpis.includes(c))
    .slice(0, 6 - orderedKpis.length);

  const kpiCandidates = [...orderedKpis, ...funnelKpis, ...remainingKpis].slice(0, 10);
  
  console.log('generateFallbackSpec: KPI candidates:', kpiCandidates.map(k => k.name).join(', '));
  
  spec.kpis = kpiCandidates.map(c => ({
    label: c.display_label,
    column: c.name,
    agg: c.aggregator_default === 'avg' ? 'avg' : 'sum',
    format: c.semantic_type === 'currency' ? 'currency' : 
            c.semantic_type === 'percent' ? 'percent' : 'integer',
    goalDirection: ['cpl', 'cac', 'custo'].some(k => c.name.toLowerCase().includes(k)) 
      ? 'lower_better' : 'higher_better'
  }));

  // Add rate KPIs
  const rateKpis = percentCols.slice(0, 4).map(c => ({
    label: c.display_label,
    column: c.name,
    agg: 'avg',
    format: 'percent',
    goalDirection: 'higher_better'
  }));
  spec.kpis.push(...rateKpis);

  // Funnel
  if (funnelSteps.length >= 2) {
    spec.funnel = {
      steps: funnelSteps.map(c => ({
        label: c.display_label,
        column: c.name
      }))
    };
    spec.ui.tabs.splice(2, 0, 'Funil');
    console.log('generateFallbackSpec: Funnel added with', funnelSteps.length, 'steps');
  }

  // Charts - even if no time column, create ranking charts
  spec.charts = [];
  
  if (timeCol) {
    // Primary metrics chart (cost vs results)
    const costMetrics = currencyCols.filter(c => 
      c.name.includes('custo') || c.name === 'spend'
    ).slice(0, 1);
    const resultMetrics = [...countCols, ...funnelCols].filter(c => 
      c.name.includes('leads') || c.name.includes('venda') || c.name.includes('sales') ||
      c.name.includes('entrada') || c.name.includes('qualificado')
    ).slice(0, 3);
    
    if (costMetrics.length > 0 || resultMetrics.length > 0) {
      spec.charts.push({
        type: 'line',
        title: 'Investimento e Resultados',
        x: timeCol.name,
        series: [...costMetrics, ...resultMetrics].map(c => ({
          label: c.display_label,
          y: c.name,
          format: c.semantic_type === 'currency' ? 'currency' : 'number'
        }))
      });
    }

    // Funnel progression chart
    if (funnelSteps.length >= 2) {
      spec.charts.push({
        type: 'line',
        title: 'Evolução do Funil',
        x: timeCol.name,
        series: funnelSteps.slice(0, 4).map(c => ({
          label: c.display_label,
          y: c.name,
          format: 'number'
        }))
      });
    }

    // Efficiency chart (CPL/CAC)
    const efficiencyMetrics = columns.filter(c => 
      c.name.includes('cpl') || c.name.includes('cac') || c.name.includes('custo_por')
    );
    if (efficiencyMetrics.length > 0) {
      spec.charts.push({
        type: 'line',
        title: 'Custos por Etapa',
        x: timeCol.name,
        series: efficiencyMetrics.map(c => ({
          label: c.display_label,
          y: c.name,
          format: 'currency'
        }))
      });
    }

    // Conversion rates chart
    if (percentCols.length > 0) {
      spec.charts.push({
        type: 'line',
        title: 'Taxas de Conversão',
        x: timeCol.name,
        series: percentCols.slice(0, 4).map(c => ({
          label: c.display_label,
          y: c.name,
          format: 'percent'
        }))
      });
    }
  }

  // Add Tendências tab if we have charts
  if (spec.charts.length > 0) {
    spec.ui.tabs.splice(-1, 0, 'Tendências');
  }
  
  // === CRITICAL: Ensure minimum dashboard structure ===
  // If we got here with empty spec, create minimum dashboard
  if (spec.kpis.length === 0 && spec.columns.length === 0 && !spec.funnel) {
    console.log('generateFallbackSpec: Empty spec detected, creating minimum dashboard');
    
    // Use first 6 columns as KPIs with count aggregation
    const allCols = columns.slice(0, 6);
    spec.kpis = allCols.map(c => ({
      label: c.display_label || c.name,
      column: c.name,
      agg: 'count',
      format: 'integer',
      goalDirection: 'higher_better'
    }));
    
    // Ensure columns are populated
    spec.columns = columns.map(c => ({
      name: c.name,
      type: 'string',
      label: c.display_label || c.name
    }));
  }

  console.log('generateFallbackSpec: Final spec - KPIs:', spec.kpis.length, 'Charts:', spec.charts.length, 'Columns:', spec.columns.length);

  return spec;
}

// =====================================================
// AI SPEC GENERATION WITH SQL CONTEXT
// =====================================================

async function generateSpecWithAI(
  columns: ColumnMeta[], 
  datasetName: string, 
  introspection: IntrospectionResult
): Promise<any> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!lovableApiKey) {
    console.log('LOVABLE_API_KEY not available, using fallback');
    return null;
  }

  // Build metadata-only prompt (no sensitive data)
  const columnSummary = columns.map(c => ({
    name: c.name,
    type: c.db_type,
    semantic: c.semantic_type,
    label: c.display_label,
    role: c.role_hint
  }));

  // Add stats summary if available
  let statsSummary = '';
  if (introspection.column_stats) {
    const statsEntries = Object.entries(introspection.column_stats)
      .filter(([_, s]) => s.min !== undefined || s.avg !== undefined)
      .map(([name, s]) => `${name}: min=${s.min}, max=${s.max}, avg=${s.avg?.toFixed(2)}`)
      .slice(0, 10);
    if (statsEntries.length > 0) {
      statsSummary = `\n\nEstatísticas de colunas numéricas:\n${statsEntries.join('\n')}`;
    }
  }

  // Build list of valid column names for AI reference
  const validColumnNames = columns.map(c => c.name);
  
  const systemPrompt = `Você é um especialista em Business Intelligence que cria especificações de dashboards.
Sua tarefa é criar um DashboardSpec JSON para visualizar os dados de forma clara e acionável.

REGRAS CRÍTICAS - VOCÊ DEVE SEGUIR EXATAMENTE:
1. Use APENAS os nomes de colunas EXATOS fornecidos na lista abaixo
2. O campo "column" em KPIs DEVE ser o nome exato da coluna (ex: "entrada", NÃO "Entrada")
3. O campo "y" em series DEVE ser o nome exato da coluna
4. O campo "x" em charts DEVE ser o nome exato da coluna de tempo
5. Nomes de colunas são CASE-SENSITIVE - use exatamente como fornecidos
6. NUNCA invente nomes de colunas que não existam na lista

Lista de nomes de colunas válidos:
${validColumnNames.join(', ')}

PADRÃO DE FUNIL ESPERADO (use colunas que existam):
- leads/entrada → qualificado → agendada → realizada → venda

ESTRUTURA DO SPEC:
{
  "version": 1,
  "title": "Nome do Dashboard",
  "time": { "column": "NOME_EXATO_COLUNA_TEMPO", "type": "date" },
  "columns": [{ "name": "NOME_EXATO", "type": "currency|number|percent|date|string", "label": "Label Amigável" }],
  "kpis": [{ "label": "Label Amigável", "column": "NOME_EXATO", "agg": "sum|avg", "format": "currency|number|percent|integer", "goalDirection": "higher_better|lower_better" }],
  "funnel": { "steps": [{ "label": "Label Amigável", "column": "NOME_EXATO" }] },
  "charts": [{ "type": "line", "title": "Título", "x": "NOME_EXATO_TEMPO", "series": [{ "label": "Label", "y": "NOME_EXATO", "format": "number" }] }],
  "ui": { "tabs": ["Decisões", "Executivo", "Funil", "Tendências", "Detalhes"], "defaultTab": "Decisões", "comparePeriods": true }
}`;

  const userPrompt = `Dataset: "${datasetName}"

COLUNAS DISPONÍVEIS (use EXATAMENTE estes nomes):
${JSON.stringify(columnSummary, null, 2)}

${introspection.sql_definition ? `SQL da View:\n${introspection.sql_definition.slice(0, 1000)}\n` : ''}

Detecções:
- Linhas: ${introspection.row_count}
- Granularidade: ${introspection.grain_hint}
- Coluna tempo: ${introspection.primary_time_column || 'detectar por nome'}
- Funil candidatos: ${introspection.detected_roles?.funnel_candidates?.join(', ') || 'detectar'}
${statsSummary}

Gere o DashboardSpec JSON usando APENAS os nomes de colunas listados acima.
IMPORTANTE: Retorne APENAS o JSON válido, sem markdown ou explicações.`;

  try {
    console.log('Calling Lovable AI for spec generation...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.2, // Lower for more consistent output
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI API error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      console.error('Empty response from AI');
      return null;
    }

    // Extract JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Clean up potential issues
    jsonStr = jsonStr.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\w*\n?/, '').replace(/```$/, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);
      console.log('AI spec parsed successfully');
      return parsed;
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', parseErr);
      console.error('Raw content (first 500 chars):', jsonStr.slice(0, 500));
      return null;
    }
  } catch (err) {
    console.error('AI generation error:', err);
    return null;
  }
}

// =====================================================
// MAIN HANDLER
// =====================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Auth
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager']);

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado. Requer role admin ou manager.');
    }

    // Parse request
    const body = await req.json();
    const { dataset_id, use_ai = true, introspection_data } = body;

    if (!dataset_id) {
      return errorResponse('VALIDATION_ERROR', 'dataset_id é obrigatório');
    }

    // Fetch dataset
    const { data: dataset, error: dsError } = await adminClient
      .from('datasets')
      .select('*')
      .eq('id', dataset_id)
      .single();

    if (dsError || !dataset) {
      return errorResponse('NOT_FOUND', 'Dataset não encontrado');
    }

    // Fetch columns
    const { data: columnsData, error: colError } = await adminClient
      .from('dataset_columns')
      .select('*')
      .eq('dataset_id', dataset_id)
      .order('sort_priority');

    if (colError) {
      return errorResponse('DB_ERROR', 'Erro ao buscar colunas', colError.message);
    }

    const columns: ColumnMeta[] = columnsData || [];

    if (columns.length === 0) {
      return errorResponse('NO_COLUMNS', 'Dataset não possui colunas. Execute introspecção primeiro.');
    }

    console.log(`Generating spec for dataset ${dataset.name} with ${columns.length} columns`);

    // Build introspection data for AI context
    const introspection: IntrospectionResult = introspection_data || {
      columns,
      row_count: dataset.row_limit_default || 10000,
      grain_hint: dataset.grain_hint || 'day',
      primary_time_column: dataset.primary_time_column,
      detected_roles: {
        time_columns: columns.filter(c => c.semantic_type === 'time').map(c => c.name),
        metric_columns: columns.filter(c => ['currency', 'count', 'metric'].includes(c.semantic_type || '')).map(c => c.name),
        percent_columns: columns.filter(c => c.semantic_type === 'percent').map(c => c.name),
        dimension_columns: columns.filter(c => c.semantic_type === 'dimension').map(c => c.name),
        funnel_candidates: columns
          .filter(c => c.semantic_type === 'count')
          .map(c => c.name)
      }
    };

    // Try AI generation first
    let spec: any = null;
    let source = 'fallback';
    let aiError: string | null = null;

    if (use_ai) {
      try {
        spec = await generateSpecWithAI(columns, dataset.name, introspection);
        if (spec) {
          source = 'ai';
          console.log('AI spec generated successfully');
        }
      } catch (err: any) {
        aiError = err.message;
        console.error('AI generation failed:', err);
      }
    }

    // Fallback to heuristic
    if (!spec) {
      spec = generateFallbackSpec(columns, dataset.name, introspection);
      console.log('Using fallback spec generator');
    }

    // Validate and fix spec
    let validation = validateAndFixSpec(spec, columns);
    let finalSpec = validation.fixedSpec || spec;
    
    // === CRITICAL: Never allow empty spec ===
    const specIsEmpty = (
      (!finalSpec.kpis || finalSpec.kpis.length === 0) &&
      (!finalSpec.charts || finalSpec.charts.length === 0) &&
      (!finalSpec.funnel || !finalSpec.funnel.steps || finalSpec.funnel.steps.length === 0)
    );
    
    if (specIsEmpty && columns.length > 0) {
      console.log('CRITICAL: Empty spec detected after validation, regenerating with minimum fallback');
      
      // Filter valid columns first
      const validColumns = columns.filter(c => c && c.name);
      
      // Find time column safely
      const timeColumn = validColumns.find(c => 
        c.semantic_type === 'time' || 
        (c.name && (c.name.includes('created') || c.name.includes('data') || c.name.includes('dia')))
      );
      
      // Create minimum viable spec
      const minimumSpec: any = {
        version: 1,
        title: dataset.name,
        columns: validColumns.map(c => ({
          name: c.name,
          type: c.semantic_type === 'currency' ? 'currency' : 
                c.semantic_type === 'percent' ? 'percent' :
                c.semantic_type === 'time' ? 'date' :
                ['count', 'metric'].includes(c.semantic_type || '') ? 'number' : 'string',
          label: c.display_label || c.name
        })),
        kpis: validColumns
          .filter(c => ['count', 'currency', 'metric', 'percent'].includes(c.semantic_type || '') || 
                       c.role_hint === 'funnel_step')
          .slice(0, 8)
          .map(c => ({
            label: c.display_label || c.name,
            column: c.name,
            agg: c.semantic_type === 'percent' ? 'avg' : 'sum',
            format: c.semantic_type === 'currency' ? 'currency' : 
                    c.semantic_type === 'percent' ? 'percent' : 'integer',
            goalDirection: 'higher_better'
          })),
        ui: {
          tabs: ['Decisões', 'Executivo', 'Detalhes'],
          defaultTab: 'Decisões',
          comparePeriods: true
        }
      };
      
      // Add time if found
      if (timeColumn) {
        minimumSpec.time = { column: timeColumn.name, type: 'date' };
      }
      
      // If still no KPIs, use first 4 columns
      if (minimumSpec.kpis.length === 0) {
        minimumSpec.kpis = validColumns.slice(0, 4).map(c => ({
          label: c.display_label || c.name,
          column: c.name,
          agg: 'count',
          format: 'integer',
          goalDirection: 'higher_better'
        }));
      }
      
      console.log('Minimum spec created with', minimumSpec.kpis.length, 'KPIs');
      
      finalSpec = minimumSpec;
      validation = {
        valid: true,
        errors: [],
        warnings: ['Spec mínimo gerado automaticamente (fallback de emergência)'],
        fixedSpec: minimumSpec
      };
    }
    
    if (!validation.valid) {
      console.warn('Spec validation errors:', validation.errors);
    }

    if (validation.warnings.length > 0) {
      console.log('Spec validation warnings:', validation.warnings);
    }

    // Build debug info
    const debug = {
      dataset_name: dataset.name,
      dataset_id: dataset.id,
      column_count: columns.length,
      columns_detected: columns.map(c => ({ name: c.name, semantic: c.semantic_type, label: c.display_label })),
      time_column: introspection.primary_time_column,
      grain: introspection.grain_hint,
      funnel_candidates: introspection.detected_roles?.funnel_candidates || [],
      ai_used: source === 'ai',
      ai_error: aiError,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      final_kpis: finalSpec.kpis?.length || 0,
      final_charts: finalSpec.charts?.length || 0,
      final_funnel_steps: finalSpec.funnel?.steps?.length || 0
    };

    return successResponse({
      spec: finalSpec,
      source,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      },
      debug
    });

  } catch (error: any) {
    console.error('Error in generate-dashboard-spec:', error);
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message);
  }
});
