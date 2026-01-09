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
// DASHBOARD PLAN TYPES
// =====================================================

interface ColumnMapping {
  column_name: string;
  role: 'time' | 'id_primary' | 'id_secondary' | 'dimension' | 'funnel_stage' | 'metric_numeric' | 'metric_currency' | 'metric_percent' | 'text_detail' | 'ignored';
  display_label: string;
  granularity?: 'day' | 'month';
  filter_type?: 'select' | 'multiselect' | 'search';
  funnel_order?: number;
  truthy_rule?: 'default' | 'custom';
}

interface FilterDefinition {
  column: string;
  label: string;
  type: 'select' | 'multiselect' | 'search' | 'date_range' | 'toggle';
  cardinality_hint?: number;
}

interface KPIDefinition {
  id: string;
  column: string;
  label: string;
  formula: string; // e.g., "count_distinct(lead_id)", "sum_truthy(st_venda)"
  format: 'integer' | 'currency' | 'percent' | 'float';
  goal_direction: 'higher_better' | 'lower_better';
}

interface ChartDefinition {
  id: string;
  type: 'line' | 'bar' | 'area';
  title: string;
  x_column: string;
  series: { column: string; label: string; aggregation: string; format: string }[];
}

interface FunnelStage {
  column: string;
  label: string;
  order: number;
  expression: string;
}

interface TabDefinition {
  name: string;
  objective: string;
  tiles: { type: string; config: any }[];
}

interface DataRequirements {
  columns_needed: string[];
  aggregation_server_side: boolean;
  time_grouping?: string;
  filters_needed: string[];
}

interface DashboardPlan {
  version: number;
  title: string;
  tabs: TabDefinition[];
  filters: FilterDefinition[];
  kpis: KPIDefinition[];
  charts: ChartDefinition[];
  funnel?: {
    title: string;
    base_column?: string;
    stages: FunnelStage[];
  };
  data_requirements: DataRequirements;
  layout_guidelines: {
    kpi_count: number;
    chart_count: number;
    funnel_steps: number;
    priority_visual: string[];
  };
  time_column: string | null;
  id_column: string | null;
  confidence: number;
  assumptions: string[];
  warnings: string[];
}

interface CoderPrompt {
  objective: string;
  business_rules: string[];
  endpoint_contracts: {
    aggregate_full: string;
    details_paginated: string;
    distinct_values: string;
  };
  ui_specifications: string[];
  security_constraints: string[];
  performance_hints: string[];
}

interface AcceptanceCheck {
  id: string;
  description: string;
  test_type: 'kpi_numeric' | 'funnel_coherent' | 'charts_populated' | 'filters_work';
}

// =====================================================
// PLANNER SYSTEM PROMPT (LLM #1)
// =====================================================

const PLANNER_SYSTEM_PROMPT = `Você é o BAI Dashboard Planner, um arquiteto de BI especialista em CRM e tráfego pago.
Sua função é PLANEJAR dashboards, NÃO escrever código. Você recebe:
1. dataset_profile (colunas, tipos, stats)
2. column_mapping (confirmado pelo usuário)
3. objetivo do dashboard

E gera:
1. DashboardPlan JSON (layout, tabs, KPIs, filtros, funil, gráficos)
2. CoderPrompt (instruções detalhadas para o LLM #2 que vai implementar)

REGRAS DURAS (NÃO QUEBRAR):
1. SÓ USE colunas do column_mapping (confirmadas pelo usuário)
2. NÃO INVENTE colunas novas
3. Respeite os roles do mapping:
   - funnel_stage → agregar com sum_truthy
   - dimension → criar filtros
   - time → eixo X dos charts
   - id_primary → count_distinct para total
   - ignored → NÃO USAR
4. Máximo 8 KPIs, 4 charts, 7 etapas funil
5. SEMPRE incluir tab "Detalhes" com tabela
6. Filtros APENAS para colunas dimension (nunca IDs)
7. Se não houver time column válida: remover charts de tendência, manter KPIs e funil

GUARDRAILS:
- max_kpis: 8
- max_charts: 4
- max_funnel_stages: 7
- always_include: ["Detalhes"]
- filters_only_for: ["dimension"]
- if_no_time: remove tendências automaticamente

ESTRUTURA DO OUTPUT:

{
  "dashboard_plan": {
    "version": 1,
    "title": "string",
    "tabs": [{ "name": "string", "objective": "string", "tiles": [] }],
    "filters": [{ "column": "string", "label": "string", "type": "select|multiselect|search|date_range" }],
    "kpis": [{ "id": "string", "column": "string", "label": "string", "formula": "count_distinct(x)|sum_truthy(x)|sum(x)|avg(x)", "format": "integer|currency|percent", "goal_direction": "higher_better|lower_better" }],
    "charts": [{ "id": "string", "type": "line|bar", "title": "string", "x_column": "string", "series": [] }],
    "funnel": { "title": "string", "base_column": "string", "stages": [{ "column": "string", "label": "string", "order": 1, "expression": "truthy" }] },
    "data_requirements": { "columns_needed": [], "aggregation_server_side": true, "time_grouping": "day", "filters_needed": [] },
    "layout_guidelines": { "kpi_count": 6, "chart_count": 2, "funnel_steps": 5, "priority_visual": ["kpis", "funnel"] },
    "time_column": "string|null",
    "id_column": "string|null",
    "confidence": 0.85,
    "assumptions": [],
    "warnings": []
  },
  "coder_prompt": {
    "objective": "Criar dashboard executivo CRM com visão de funil e tendências",
    "business_rules": ["Base do funil é lead_ativo", "Excluir status=perdida do total"],
    "endpoint_contracts": {
      "aggregate_full": "/functions/v1/dashboard-data-v2?mode=aggregate",
      "details_paginated": "/functions/v1/dashboard-data-v2?mode=details&page=1",
      "distinct_values": "/functions/v1/dashboard-data-v2?mode=distinct&column=X"
    },
    "ui_specifications": ["Dark mode global", "Tabs fixas no topo", "Filtros em linha", "KPIs com delta %"],
    "security_constraints": ["Filtrar por tenant_id", "RLS ativo"],
    "performance_hints": ["Agregação server-side", "Cache por período", "Lazy load detalhes"]
  },
  "acceptance_checks": [
    { "id": "kpi_numeric", "description": "Todos os KPIs retornam números válidos (não NaN)", "test_type": "kpi_numeric" },
    { "id": "funnel_order", "description": "Funil está ordenado do topo para base", "test_type": "funnel_coherent" }
  ]
}

NÃO inclua explicações, apenas JSON válido.`;

// =====================================================
// PLANNER LOGIC
// =====================================================

function buildPlanFromMapping(
  datasetProfile: any,
  columnMapping: ColumnMapping[],
  objective: string
): { plan: DashboardPlan; coderPrompt: CoderPrompt; acceptanceChecks: AcceptanceCheck[] } {
  
  // Extract columns by role
  const timeCol = columnMapping.find(c => c.role === 'time');
  const idCol = columnMapping.find(c => c.role === 'id_primary');
  const dimensions = columnMapping.filter(c => c.role === 'dimension');
  const funnelStages = columnMapping.filter(c => c.role === 'funnel_stage').sort((a, b) => (a.funnel_order || 0) - (b.funnel_order || 0));
  const metrics = columnMapping.filter(c => ['metric_numeric', 'metric_currency', 'metric_percent'].includes(c.role));
  const textDetails = columnMapping.filter(c => c.role === 'text_detail');
  
  // Build filters from dimensions
  const filters: FilterDefinition[] = dimensions.slice(0, 5).map(d => ({
    column: d.column_name,
    label: d.display_label,
    type: d.filter_type || 'select',
    cardinality_hint: datasetProfile?.columns?.find((c: any) => c.name === d.column_name)?.stats?.distinct_count
  }));
  
  // Add date range filter if time exists
  if (timeCol) {
    filters.unshift({
      column: timeCol.column_name,
      label: 'Período',
      type: 'date_range'
    });
  }
  
  // Build KPIs
  const kpis: KPIDefinition[] = [];
  
  // Lead count KPI
  if (idCol) {
    kpis.push({
      id: 'total_leads',
      column: idCol.column_name,
      label: 'Total de Leads',
      formula: `count_distinct(${idCol.column_name})`,
      format: 'integer',
      goal_direction: 'higher_better'
    });
  }
  
  // Funnel stage KPIs
  for (const stage of funnelStages.slice(0, 6)) {
    kpis.push({
      id: `kpi_${stage.column_name}`,
      column: stage.column_name,
      label: stage.display_label,
      formula: `sum_truthy(${stage.column_name})`,
      format: 'integer',
      goal_direction: 'higher_better'
    });
  }
  
  // Currency metrics
  for (const metric of metrics.filter(m => m.role === 'metric_currency').slice(0, 2)) {
    kpis.push({
      id: `kpi_${metric.column_name}`,
      column: metric.column_name,
      label: metric.display_label,
      formula: `sum(${metric.column_name})`,
      format: 'currency',
      goal_direction: metric.column_name.includes('custo') || metric.column_name.includes('cpl') ? 'lower_better' : 'higher_better'
    });
  }
  
  // Build charts (only if time exists)
  const charts: ChartDefinition[] = [];
  if (timeCol && funnelStages.length > 0) {
    charts.push({
      id: 'funnel_evolution',
      type: 'line',
      title: 'Evolução do Funil',
      x_column: timeCol.column_name,
      series: funnelStages.slice(0, 4).map(s => ({
        column: s.column_name,
        label: s.display_label,
        aggregation: 'sum_truthy',
        format: 'integer'
      }))
    });
  }
  
  if (timeCol && metrics.filter(m => m.role === 'metric_currency').length > 0) {
    charts.push({
      id: 'cost_evolution',
      type: 'line',
      title: 'Investimento',
      x_column: timeCol.column_name,
      series: metrics.filter(m => m.role === 'metric_currency').slice(0, 2).map(m => ({
        column: m.column_name,
        label: m.display_label,
        aggregation: 'sum',
        format: 'currency'
      }))
    });
  }
  
  // Build funnel
  const funnel = funnelStages.length >= 2 ? {
    title: 'Funil de Conversão',
    base_column: funnelStages[0]?.column_name,
    stages: funnelStages.map((s, i) => ({
      column: s.column_name,
      label: s.display_label,
      order: i + 1,
      expression: 'truthy'
    }))
  } : undefined;
  
  // Build tabs
  const tabs: TabDefinition[] = [
    {
      name: 'Decisões',
      objective: 'Visão executiva com principais KPIs e alertas',
      tiles: [
        { type: 'kpi_row', config: { kpi_ids: kpis.slice(0, 6).map(k => k.id) } },
        ...(funnel ? [{ type: 'funnel', config: {} }] : []),
        ...(charts.length > 0 ? [{ type: 'chart', config: { chart_id: charts[0].id } }] : [])
      ]
    },
    {
      name: 'Executivo',
      objective: 'Todos os KPIs com comparação de período',
      tiles: [
        { type: 'kpi_row', config: { kpi_ids: kpis.map(k => k.id) } }
      ]
    }
  ];
  
  if (funnel) {
    tabs.push({
      name: 'Funil',
      objective: 'Análise detalhada do funil de conversão',
      tiles: [
        { type: 'funnel', config: { show_rates: true } },
        ...(charts.find(c => c.id === 'funnel_evolution') ? [{ type: 'chart', config: { chart_id: 'funnel_evolution' } }] : [])
      ]
    });
  }
  
  if (charts.length > 0) {
    tabs.push({
      name: 'Tendências',
      objective: 'Evolução temporal das métricas',
      tiles: charts.map(c => ({ type: 'chart', config: { chart_id: c.id } }))
    });
  }
  
  // Always add Detalhes tab
  tabs.push({
    name: 'Detalhes',
    objective: 'Tabela completa com todos os registros',
    tiles: [{ type: 'table', config: { paginated: true, export: true } }]
  });
  
  // Build data requirements
  const dataRequirements: DataRequirements = {
    columns_needed: columnMapping.filter(c => c.role !== 'ignored').map(c => c.column_name),
    aggregation_server_side: true,
    time_grouping: timeCol?.granularity || 'day',
    filters_needed: filters.map(f => f.column)
  };
  
  // Calculate confidence
  const confidence = (
    (kpis.length > 0 ? 0.3 : 0) +
    (timeCol ? 0.2 : 0) +
    (funnelStages.length >= 2 ? 0.3 : 0) +
    (dimensions.length > 0 ? 0.1 : 0) +
    (charts.length > 0 ? 0.1 : 0)
  );
  
  // Build warnings
  const warnings: string[] = [];
  if (!timeCol) warnings.push('Sem coluna de tempo - gráficos de tendência removidos');
  if (funnelStages.length < 2) warnings.push('Funil não detectado ou insuficiente');
  if (dimensions.length === 0) warnings.push('Sem dimensões para filtros');
  
  const plan: DashboardPlan = {
    version: 1,
    title: datasetProfile?.dataset_name || 'Dashboard',
    tabs,
    filters,
    kpis,
    charts,
    funnel,
    data_requirements: dataRequirements,
    layout_guidelines: {
      kpi_count: kpis.length,
      chart_count: charts.length,
      funnel_steps: funnelStages.length,
      priority_visual: ['kpis', funnel ? 'funnel' : 'charts'].filter(Boolean)
    },
    time_column: timeCol?.column_name || null,
    id_column: idCol?.column_name || null,
    confidence,
    assumptions: ['Plano baseado no mapeamento confirmado pelo usuário'],
    warnings
  };
  
  const coderPrompt: CoderPrompt = {
    objective: objective || 'Criar dashboard executivo com visão de funil e tendências',
    business_rules: [
      funnelStages.length > 0 ? `Base do funil: ${funnelStages[0]?.display_label}` : 'Sem funil definido',
      'Agregar etapas de funil com sum_truthy (valores: 1, true, sim, s, ok, x, yes, y, on)',
      idCol ? `Total de registros via count_distinct(${idCol.column_name})` : 'Sem ID primário'
    ],
    endpoint_contracts: {
      aggregate_full: 'POST /functions/v1/dashboard-data-v2 { mode: "aggregate", dashboard_id, start_date, end_date }',
      details_paginated: 'POST /functions/v1/dashboard-data-v2 { mode: "details", page, limit, filters }',
      distinct_values: 'POST /functions/v1/dashboard-data-v2 { mode: "distinct", column }'
    },
    ui_specifications: [
      'Dark mode global via CSS variables',
      'Tabs fixas no topo da página',
      'Filtros em linha horizontal abaixo das tabs',
      'KPIs com valor atual, delta %, e ícone de direção',
      'Funil com barras horizontais e taxas de conversão',
      'Charts com tooltip e zoom',
      'Tabela paginada com export CSV'
    ],
    security_constraints: [
      'Filtrar dados por tenant_id (via RLS)',
      'Não expor IDs internos na URL',
      'Validar range de datas no backend'
    ],
    performance_hints: [
      'Usar agregação server-side (não trazer 1000+ rows pro client)',
      'Cache por dashboard_id + período',
      'Lazy load da tab Detalhes'
    ]
  };
  
  const acceptanceChecks: AcceptanceCheck[] = [
    { id: 'kpi_numeric', description: 'Todos os KPIs retornam números válidos (não NaN)', test_type: 'kpi_numeric' },
    { id: 'funnel_order', description: 'Funil está ordenado do maior para menor', test_type: 'funnel_coherent' },
    { id: 'charts_data', description: 'Charts têm pelo menos 1 ponto de dados', test_type: 'charts_populated' },
    { id: 'filters_work', description: 'Filtros alteram os dados corretamente', test_type: 'filters_work' }
  ];
  
  return { plan, coderPrompt, acceptanceChecks };
}

async function generatePlanWithLLM(
  datasetProfile: any,
  columnMapping: ColumnMapping[],
  objective: string
): Promise<{ plan: DashboardPlan; coderPrompt: CoderPrompt; acceptanceChecks: AcceptanceCheck[] } | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.log('No LOVABLE_API_KEY, falling back to heuristic planner');
    return null;
  }

  try {
    // Build column summary for LLM
    const mappingSummary = columnMapping
      .filter(c => c.role !== 'ignored')
      .map(c => `- ${c.column_name} [${c.role}]: ${c.display_label}${c.funnel_order ? ` (ordem: ${c.funnel_order})` : ''}`)
      .join('\n');
    
    const prompt = `DATASET: ${datasetProfile?.dataset_name || 'unknown'}

MAPEAMENTO CONFIRMADO PELO USUÁRIO:
${mappingSummary}

OBJETIVO DO DASHBOARD:
${objective || 'Dashboard executivo com visão de funil e tendências'}

Gere o DashboardPlan + CoderPrompt JSON seguindo as regras do sistema.
LEMBRE: só use colunas do mapping acima, nunca invente colunas.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: PLANNER_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 8000
      })
    });

    if (!response.ok) {
      console.error('LLM Planner request failed:', response.status);
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) return null;

    // Extract JSON
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);
    return {
      plan: parsed.dashboard_plan,
      coderPrompt: parsed.coder_prompt,
      acceptanceChecks: parsed.acceptance_checks || []
    };
  } catch (error) {
    console.error('LLM Planner error:', error);
    return null;
  }
}

// =====================================================
// DENO SERVE
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

    // Authenticate
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
      return errorResponse('FORBIDDEN', 'Acesso negado');
    }

    // Parse request
    const body = await req.json();
    const { 
      dataset_profile, 
      column_mapping, 
      objective,
      use_llm = true 
    } = body;

    if (!dataset_profile) {
      return errorResponse('VALIDATION_ERROR', 'dataset_profile é obrigatório');
    }

    if (!column_mapping || !Array.isArray(column_mapping)) {
      return errorResponse('VALIDATION_ERROR', 'column_mapping é obrigatório e deve ser um array');
    }

    // Generate plan
    let result;
    let source: 'llm' | 'heuristic' = 'heuristic';

    if (use_llm) {
      result = await generatePlanWithLLM(dataset_profile, column_mapping, objective);
      if (result) {
        source = 'llm';
      }
    }

    if (!result) {
      result = buildPlanFromMapping(dataset_profile, column_mapping, objective);
    }

    console.log(`Planner generated: ${result.plan.kpis?.length || 0} KPIs, ${result.plan.funnel?.stages?.length || 0} funnel stages, source: ${source}`);

    return successResponse({
      dashboard_plan: result.plan,
      coder_prompt: result.coderPrompt,
      acceptance_checks: result.acceptanceChecks,
      source
    });

  } catch (error: any) {
    console.error('Error in generate-dashboard-planner:', error);
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message);
  }
});
