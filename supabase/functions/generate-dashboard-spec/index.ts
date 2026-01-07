import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
// SPEC VALIDATION
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

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixedSpec?: any;
}

function validateAndFixSpec(spec: any, columns: ColumnMeta[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const columnNames = new Set(columns.map(c => c.name));
  const numericColumns = new Set(
    columns
      .filter(c => ['currency', 'count', 'metric', 'percent'].includes(c.semantic_type || ''))
      .map(c => c.name)
  );
  const timeColumns = columns.filter(c => c.semantic_type === 'time').map(c => c.name);

  // Deep clone spec to fix
  const fixed = JSON.parse(JSON.stringify(spec));

  // Validate version
  if (typeof fixed.version !== 'number') {
    fixed.version = 1;
    warnings.push('Adicionada versão 1 ao spec');
  }

  // Validate time column
  if (fixed.time?.column && !columnNames.has(fixed.time.column)) {
    if (timeColumns.length > 0) {
      fixed.time.column = timeColumns[0];
      warnings.push(`Coluna de tempo corrigida para ${timeColumns[0]}`);
    } else {
      delete fixed.time;
      warnings.push('Removida configuração de tempo (sem coluna válida)');
    }
  }

  // Validate KPIs
  if (Array.isArray(fixed.kpis)) {
    fixed.kpis = fixed.kpis.filter((kpi: any) => {
      // Check column exists
      if (!kpi.column || !columnNames.has(kpi.column)) {
        warnings.push(`KPI removido: coluna ${kpi.column || 'indefinida'} não existe`);
        return false;
      }
      
      // Check column is numeric for aggregations
      if (!numericColumns.has(kpi.column) && kpi.agg !== 'count') {
        warnings.push(`KPI ${kpi.label}: coluna ${kpi.column} não é numérica`);
        return false;
      }
      
      // Ensure label is string
      if (!kpi.label || typeof kpi.label !== 'string') {
        kpi.label = columns.find(c => c.name === kpi.column)?.display_label || kpi.column;
      }
      
      return true;
    });
  }

  // Validate funnel
  if (fixed.funnel?.steps && Array.isArray(fixed.funnel.steps)) {
    fixed.funnel.steps = fixed.funnel.steps.filter((step: any) => {
      if (!step.column || !columnNames.has(step.column)) {
        warnings.push(`Etapa de funil removida: coluna ${step.column || 'indefinida'} não existe`);
        return false;
      }
      if (!numericColumns.has(step.column)) {
        warnings.push(`Etapa ${step.label}: coluna ${step.column} não é numérica`);
        return false;
      }
      if (!step.label || typeof step.label !== 'string') {
        step.label = columns.find(c => c.name === step.column)?.display_label || step.column;
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
    fixed.charts = fixed.charts.filter((chart: any) => {
      // Validate x-axis
      if (!chart.x || !columnNames.has(chart.x)) {
        if (timeColumns.length > 0) {
          chart.x = timeColumns[0];
          warnings.push(`Chart ${chart.title}: eixo X corrigido para ${timeColumns[0]}`);
        } else {
          warnings.push(`Chart ${chart.title} removido: sem eixo X válido`);
          return false;
        }
      }

      // Validate series
      if (Array.isArray(chart.series)) {
        chart.series = chart.series.filter((s: any) => {
          if (!s.y || !columnNames.has(s.y)) {
            warnings.push(`Série ${s.label || s.y} removida: coluna não existe`);
            return false;
          }
          if (!numericColumns.has(s.y)) {
            warnings.push(`Série ${s.label}: coluna ${s.y} não é numérica`);
            return false;
          }
          if (!s.label || typeof s.label !== 'string') {
            s.label = columns.find(c => c.name === s.y)?.display_label || s.y;
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
    fixed.columns = fixed.columns.filter((col: any) => {
      if (!col.name || typeof col.name !== 'string') {
        warnings.push('Coluna sem nome removida');
        return false;
      }
      if (!columnNames.has(col.name)) {
        warnings.push(`Coluna ${col.name} removida: não existe no dataset`);
        return false;
      }
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
// FALLBACK HEURISTIC SPEC GENERATOR
// =====================================================

function generateFallbackSpec(columns: ColumnMeta[], datasetName: string): any {
  const timeCol = columns.find(c => c.semantic_type === 'time');
  const currencyCols = columns.filter(c => c.semantic_type === 'currency');
  const countCols = columns.filter(c => c.semantic_type === 'count');
  const percentCols = columns.filter(c => c.semantic_type === 'percent');
  const metricCols = columns.filter(c => c.semantic_type === 'metric');

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

  // Columns
  spec.columns = columns.map(c => ({
    name: c.name,
    type: c.semantic_type === 'currency' ? 'currency' : 
          c.semantic_type === 'percent' ? 'percent' :
          c.semantic_type === 'time' ? 'date' :
          ['count', 'metric'].includes(c.semantic_type || '') ? 'number' : 'string',
    label: c.display_label,
    scale: c.semantic_type === 'percent' ? '0to1' : undefined
  }));

  // KPIs - pick top metrics
  const kpiCandidates = [...currencyCols, ...countCols.slice(0, 4), ...percentCols.slice(0, 2)];
  spec.kpis = kpiCandidates.slice(0, 6).map(c => ({
    label: c.display_label,
    column: c.name,
    agg: c.aggregator_default === 'avg' ? 'avg' : 'sum',
    format: c.semantic_type === 'currency' ? 'currency' : 
            c.semantic_type === 'percent' ? 'percent' : 'integer',
    goalDirection: c.semantic_type === 'currency' ? 'lower_better' : 'higher_better'
  }));

  // Funnel - from count columns if we have progression
  const funnelCandidates = countCols.filter(c => 
    c.name.includes('_total') || c.name.includes('leads') || c.name.includes('entrada') || 
    c.name.includes('reuniao') || c.name.includes('venda')
  );
  if (funnelCandidates.length >= 3) {
    spec.funnel = {
      steps: funnelCandidates.slice(0, 6).map(c => ({
        label: c.display_label,
        column: c.name
      }))
    };
    spec.ui.tabs.splice(2, 0, 'Funil');
  }

  // Charts - if we have time column
  if (timeCol) {
    spec.charts = [];
    
    // Primary metrics chart
    const chartMetrics = [...currencyCols.slice(0, 2), ...countCols.slice(0, 2)];
    if (chartMetrics.length > 0) {
      spec.charts.push({
        type: 'line',
        title: 'Tendência Principal',
        x: timeCol.name,
        series: chartMetrics.map(c => ({
          label: c.display_label,
          y: c.name,
          format: c.semantic_type === 'currency' ? 'currency' : 'number'
        }))
      });
    }

    // Efficiency chart
    const efficiencyMetrics = columns.filter(c => 
      c.name.includes('cpl') || c.name.includes('cac') || c.name.includes('custo_por')
    );
    if (efficiencyMetrics.length > 0) {
      spec.charts.push({
        type: 'line',
        title: 'Eficiência',
        x: timeCol.name,
        series: efficiencyMetrics.map(c => ({
          label: c.display_label,
          y: c.name,
          format: 'currency'
        }))
      });
    }

    if (spec.charts.length > 0) {
      spec.ui.tabs.splice(-1, 0, 'Tendências');
    }
  }

  return spec;
}

// =====================================================
// AI SPEC GENERATION
// =====================================================

async function generateSpecWithAI(columns: ColumnMeta[], datasetName: string, stats: any): Promise<any> {
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

  const systemPrompt = `Você é um especialista em Business Intelligence que cria especificações de dashboards.
Sua tarefa é criar um DashboardSpec JSON para visualizar os dados de forma clara e acionável.

REGRAS OBRIGATÓRIAS:
1. Use APENAS colunas que existem no dataset (fornecidas abaixo)
2. KPIs devem usar APENAS colunas numéricas (currency, count, metric)
3. Funnel deve ter etapas com colunas numéricas que representem progressão
4. Charts devem ter x = coluna de tempo e series = colunas numéricas
5. Labels devem ser claros e em português
6. Não invente colunas ou métricas

ESTRUTURA DO SPEC:
{
  "version": 1,
  "title": "Nome do Dashboard",
  "time": { "column": "coluna_data", "type": "date" },
  "columns": [{ "name": "col", "type": "currency|number|percent|date|string", "label": "Label", "scale": "0to1" }],
  "kpis": [{ "label": "Label", "column": "col", "agg": "sum|avg|min|max|last", "format": "currency|number|percent|integer", "goalDirection": "higher_better|lower_better" }],
  "funnel": { "steps": [{ "label": "Etapa", "column": "col" }] },
  "charts": [{ "type": "line|bar|area", "title": "Título", "x": "col_tempo", "series": [{ "label": "Label", "y": "col", "format": "currency|number|percent" }] }],
  "ui": { "tabs": ["Decisões", "Executivo", "Funil", "Tendências", "Detalhes"], "defaultTab": "Decisões", "comparePeriods": true }
}

DICAS:
- Priorize métricas de custo, leads, vendas, taxas
- CPL/CAC devem ter goalDirection: "lower_better"
- Taxas de conversão devem ter goalDirection: "higher_better"
- Identifique colunas de funil pela semântica (leads → entrada → reunião → venda)`;

  const userPrompt = `Dataset: "${datasetName}"

Colunas disponíveis:
${JSON.stringify(columnSummary, null, 2)}

${stats ? `Estatísticas:
- Total de linhas: ${stats.row_count}
- Período: ${stats.grain_hint}
- Coluna de tempo principal: ${stats.primary_time_column || 'nenhuma'}` : ''}

Gere o DashboardSpec JSON ideal para este dataset. Retorne APENAS o JSON, sem explicações.`;

  try {
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
        temperature: 0.3,
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

    try {
      return JSON.parse(jsonStr.trim());
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', parseErr, jsonStr.slice(0, 500));
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
    const { dataset_id, use_ai = true } = body;

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

    // Stats for AI context
    const stats = {
      row_count: dataset.row_limit_default || 10000,
      grain_hint: dataset.grain_hint,
      primary_time_column: dataset.primary_time_column
    };

    // Try AI generation first
    let spec: any = null;
    let source = 'fallback';

    if (use_ai) {
      spec = await generateSpecWithAI(columns, dataset.name, stats);
      if (spec) {
        source = 'ai';
        console.log('AI spec generated successfully');
      }
    }

    // Fallback to heuristic
    if (!spec) {
      spec = generateFallbackSpec(columns, dataset.name);
      console.log('Using fallback spec generator');
    }

    // Validate and fix spec
    const validation = validateAndFixSpec(spec, columns);
    
    if (!validation.valid) {
      console.warn('Spec validation errors:', validation.errors);
      // Still use fixed spec but log errors
    }

    if (validation.warnings.length > 0) {
      console.log('Spec validation warnings:', validation.warnings);
    }

    const finalSpec = validation.fixedSpec || spec;

    return successResponse({
      spec: finalSpec,
      source,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      }
    });

  } catch (error: any) {
    console.error('Error in generate-dashboard-spec:', error);
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message);
  }
});
