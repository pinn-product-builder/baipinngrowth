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

function errorResponse(code: string, message: string, details?: string, traceId?: string) {
  return jsonResponse({ ok: false, error: { code, message, details }, trace_id: traceId }, 400);
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data });
}

function generateTraceId(): string {
  return `pln_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

// =====================================================
// PLANNER SYSTEM PROMPT (LLM1 - Prompt Builder)
// =====================================================

const PLANNER_SYSTEM_PROMPT = `Você é o BAI Dashboard Planner, um arquiteto de BI especialista em CRM e tráfego pago.
Sua função é PLANEJAR dashboards e GERAR um prompt final para o LLM2 (Coder).

Você recebe:
1. dataset_profile (colunas, tipos, stats)
2. column_mapping (confirmado pelo usuário)
3. objetivo/requisitos do usuário

Você gera:
1. dashboard_prompt_final (texto pronto para o LLM2)
2. dashboard_plan (JSON resumido)
3. recommended_generation_mode (react_lovable ou html_js)
4. why_recommended (explicação curta)

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
6. Filtros APENAS para colunas dimension

RECOMENDAÇÃO DE MODO:
- react_lovable: dados genéricos, precisa de personalização, poucos estágios de funil
- html_js: datasets CRM/Kommo, muitos estágios de funil (>4), dados de tráfego pago

FORMATO JSON DE SAÍDA:
{
  "dashboard_prompt_final": "string com prompt detalhado para o LLM2",
  "dashboard_plan": {
    "version": 1,
    "title": "string",
    "tabs": [{ "name": "string", "objective": "string" }],
    "filters": [{ "column": "string", "label": "string", "type": "select|multiselect|date_range" }],
    "kpis": [{ "id": "string", "column": "string", "label": "string", "formula": "string", "format": "integer|currency|percent", "goal_direction": "higher_better|lower_better" }],
    "charts": [{ "id": "string", "type": "line|bar", "title": "string", "x_column": "string", "series": [] }],
    "funnel": { "title": "string", "stages": [{ "column": "string", "label": "string", "order": 1 }] } | null,
    "time_column": "string|null",
    "id_column": "string|null",
    "confidence": 0.85
  },
  "recommended_generation_mode": "react_lovable|html_js",
  "why_recommended": "string explicando a escolha",
  "assumptions": ["string"],
  "warnings": ["string"]
}

NÃO inclua explicações fora do JSON. Retorne APENAS JSON válido.`;

// =====================================================
// HEURISTIC PLANNER (fallback)
// =====================================================

interface ColumnMapping {
  column_name: string;
  role: string;
  display_label?: string;
  funnel_order?: number;
  filter_type?: string;
}

function buildPlanFromMapping(
  datasetProfile: any,
  columnMapping: ColumnMapping[],
  userRequirements: string
): any {
  const traceId = generateTraceId();
  
  // Extract columns by role
  const timeCol = columnMapping.find(c => c.role === 'time');
  const idCol = columnMapping.find(c => c.role === 'id_primary');
  const dimensions = columnMapping.filter(c => c.role === 'dimension');
  const funnelStages = columnMapping
    .filter(c => c.role === 'funnel_stage')
    .sort((a, b) => (a.funnel_order || 0) - (b.funnel_order || 0));
  const metrics = columnMapping.filter(c => 
    ['metric_numeric', 'metric_currency', 'metric_percent'].includes(c.role)
  );
  
  // Build filters
  const filters = dimensions.slice(0, 5).map(d => ({
    column: d.column_name,
    label: d.display_label || d.column_name,
    type: d.filter_type || 'select'
  }));
  
  if (timeCol) {
    filters.unshift({
      column: timeCol.column_name,
      label: 'Período',
      type: 'date_range'
    });
  }
  
  // Build KPIs
  const kpis: any[] = [];
  
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
  
  for (const stage of funnelStages.slice(0, 6)) {
    kpis.push({
      id: `kpi_${stage.column_name}`,
      column: stage.column_name,
      label: stage.display_label || stage.column_name,
      formula: `sum_truthy(${stage.column_name})`,
      format: 'integer',
      goal_direction: 'higher_better'
    });
  }
  
  for (const metric of metrics.filter(m => m.role === 'metric_currency').slice(0, 2)) {
    kpis.push({
      id: `kpi_${metric.column_name}`,
      column: metric.column_name,
      label: metric.display_label || metric.column_name,
      formula: `sum(${metric.column_name})`,
      format: 'currency',
      goal_direction: metric.column_name.includes('custo') ? 'lower_better' : 'higher_better'
    });
  }
  
  // Build charts
  const charts: any[] = [];
  if (timeCol && funnelStages.length > 0) {
    charts.push({
      id: 'funnel_evolution',
      type: 'line',
      title: 'Evolução do Funil',
      x_column: timeCol.column_name,
      series: funnelStages.slice(0, 4).map(s => ({
        column: s.column_name,
        label: s.display_label || s.column_name,
        aggregation: 'sum_truthy'
      }))
    });
  }
  
  // Build funnel
  const funnel = funnelStages.length >= 2 ? {
    title: 'Funil de Conversão',
    stages: funnelStages.map((s, i) => ({
      column: s.column_name,
      label: s.display_label || s.column_name,
      order: i + 1
    }))
  } : null;
  
  // Build tabs
  const tabs = [
    { name: 'Decisões', objective: 'Visão executiva com principais KPIs e alertas' },
    { name: 'Executivo', objective: 'Todos os KPIs com comparação de período' }
  ];
  
  if (funnel) {
    tabs.push({ name: 'Funil', objective: 'Análise detalhada do funil de conversão' });
  }
  
  if (charts.length > 0) {
    tabs.push({ name: 'Tendências', objective: 'Evolução temporal das métricas' });
  }
  
  tabs.push({ name: 'Detalhes', objective: 'Tabela completa com todos os registros' });
  
  // Determine recommended mode
  const isCrmLike = funnelStages.length >= 4 || 
    columnMapping.some(c => c.column_name.toLowerCase().includes('kommo') || c.column_name.toLowerCase().includes('lead'));
  
  const recommendedMode = isCrmLike ? 'html_js' : 'react_lovable';
  const whyRecommended = isCrmLike 
    ? 'Dataset com características de CRM (múltiplas etapas de funil). HTML oferece melhor visualização para este tipo de dados.'
    : 'Dataset genérico. React oferece mais flexibilidade e personalização.';
  
  // Build prompt for LLM2
  const promptFinal = `OBJETIVO: ${userRequirements || 'Dashboard executivo com visão de funil e tendências'}

DATASET: ${datasetProfile?.dataset_name || 'Dashboard'}
COLUNAS DISPONÍVEIS:
${columnMapping.filter(c => c.role !== 'ignored').map(c => 
  `- ${c.column_name} [${c.role}]: ${c.display_label || c.column_name}`
).join('\n')}

ESTRUTURA OBRIGATÓRIA:
- KPIs: ${kpis.map(k => k.label).join(', ')}
- Filtros: ${filters.map(f => f.label).join(', ')}
- Abas: ${tabs.map(t => t.name).join(', ')}
${funnel ? `- Funil: ${funnel.stages.map(s => s.label).join(' → ')}` : ''}
${charts.length > 0 ? `- Gráficos: ${charts.map(c => c.title).join(', ')}` : ''}

REGRAS DE AGREGAÇÃO:
- Etapas de funil: usar sum_truthy (valores: 1, true, sim, s, ok, x, yes, y, on)
- ID primário: usar count_distinct
- Métricas numéricas: usar sum ou avg conforme contexto
- Período: filtrar por ${timeCol?.column_name || 'coluna de tempo'}

ENDPOINTS DE DADOS:
- aggregate_full: POST /functions/v1/dashboard-data-v2 { mode: "aggregate" }
- details_paginated: POST /functions/v1/dashboard-data-v2 { mode: "details" }
- distinct_values: POST /functions/v1/dashboard-data-v2 { mode: "distinct" }

Gere o dashboard seguindo esta especificação.`;

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
  
  return {
    dashboard_prompt_final: promptFinal,
    dashboard_plan: {
      version: 1,
      title: datasetProfile?.dataset_name || 'Dashboard',
      tabs,
      filters,
      kpis,
      charts,
      funnel,
      time_column: timeCol?.column_name || null,
      id_column: idCol?.column_name || null,
      confidence
    },
    recommended_generation_mode: recommendedMode,
    why_recommended: whyRecommended,
    assumptions: ['Plano baseado no mapeamento confirmado pelo usuário'],
    warnings,
    trace_id: traceId,
    source: 'heuristic'
  };
}

// =====================================================
// LLM PLANNER
// =====================================================

async function generatePlanWithLLM(
  datasetProfile: any,
  columnMapping: ColumnMapping[],
  userRequirements: string
): Promise<any | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.log('[planner-generate-prompt] No LOVABLE_API_KEY, using heuristic');
    return null;
  }

  try {
    const mappingSummary = columnMapping
      .filter(c => c.role !== 'ignored')
      .map(c => `- ${c.column_name} [${c.role}]: ${c.display_label || c.column_name}${c.funnel_order ? ` (ordem: ${c.funnel_order})` : ''}`)
      .join('\n');
    
    const prompt = `DATASET: ${datasetProfile?.dataset_name || 'unknown'}

MAPEAMENTO CONFIRMADO:
${mappingSummary}

REQUISITOS DO USUÁRIO:
${userRequirements || 'Dashboard executivo com visão de funil e tendências'}

Gere o DashboardPlan + prompt final seguindo as regras do sistema.
LEMBRE: só use colunas do mapping acima, nunca invente colunas.`;

    console.log('[planner-generate-prompt] Calling LLM...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: PLANNER_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 8000
      })
    });

    if (!response.ok) {
      console.error('[planner-generate-prompt] LLM request failed:', response.status);
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
    return { ...parsed, source: 'llm' };
  } catch (error) {
    console.error('[planner-generate-prompt] LLM error:', error);
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

  const traceId = generateTraceId();

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido', undefined, traceId);
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
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado', undefined, traceId);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager']);

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado', undefined, traceId);
    }

    // Parse request
    const body = await req.json();
    const { 
      dataset_profile,
      column_mapping,
      user_requirements = '',
      use_llm = true
    } = body;

    if (!dataset_profile) {
      return errorResponse('VALIDATION_ERROR', 'dataset_profile é obrigatório', undefined, traceId);
    }
    
    if (!column_mapping || !Array.isArray(column_mapping) || column_mapping.length === 0) {
      return errorResponse('VALIDATION_ERROR', 'column_mapping é obrigatório e deve ter pelo menos uma coluna', undefined, traceId);
    }

    console.log('[planner-generate-prompt] Processing:', {
      trace_id: traceId,
      dataset_name: dataset_profile.dataset_name,
      columns: column_mapping.length,
      use_llm
    });

    // Generate plan
    let result;
    
    if (use_llm) {
      result = await generatePlanWithLLM(dataset_profile, column_mapping, user_requirements);
    }
    
    // Fallback to heuristic
    if (!result) {
      result = buildPlanFromMapping(dataset_profile, column_mapping, user_requirements);
    }

    return successResponse({
      ...result,
      trace_id: traceId
    });

  } catch (error) {
    console.error('[planner-generate-prompt] Error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Erro interno',
      undefined,
      traceId
    );
  }
});
