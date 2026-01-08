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
// DASHBOARD PLAN TYPES & JSON SCHEMA
// =====================================================

interface LayoutTile {
  id: string
  type: 'kpi_row' | 'funnel' | 'chart' | 'ranking' | 'table'
  title?: string
  columns?: string[]
  config?: Record<string, any>
}

interface TabLayout {
  name: string
  tiles: LayoutTile[]
}

interface KPIDefinition {
  column: string
  label: string
  aggregation: 'sum' | 'count' | 'count_distinct' | 'avg' | 'truthy_count'
  format: 'currency' | 'percent' | 'integer' | 'float'
  goal_direction: 'higher_better' | 'lower_better'
  truthy_expression?: string
}

interface ChartDefinition {
  id: string
  type: 'line' | 'bar' | 'area'
  title: string
  x_column: string
  series: { column: string; label: string; format: string }[]
}

interface RankingDefinition {
  id: string
  title: string
  dimension_column: string
  metric_column: string
  aggregation: 'sum' | 'count' | 'avg'
  limit: number
}

interface DiagnosticsInfo {
  time_column?: string
  time_parse_hints?: string[]
  dimensions_chosen?: string[]
  funnel_stages_chosen?: string[]
  assumptions?: string[]
  warnings?: string[]
}

interface QueryPlan {
  lead_count_expr: string
  stage_aggregations: Record<string, string>
  time_grouping_expr?: string
}

interface DashboardPlan {
  version: number
  title: string
  tabs: TabLayout[]
  kpis: KPIDefinition[]
  charts: ChartDefinition[]
  rankings: RankingDefinition[]
  funnel?: {
    title: string
    stages: { column: string; label: string; expression: string }[]
  }
  time_column: string | null
  id_column: string | null
  labels: Record<string, string>
  formatting: Record<string, string>
  confidence: number
  assumptions: string[]
  warnings?: string[]
  diagnostics?: DiagnosticsInfo
  queryPlan?: QueryPlan
}

// JSON Schema for validation
const DASHBOARD_PLAN_SCHEMA = {
  type: 'object',
  required: ['version', 'title', 'tabs', 'kpis'],
  properties: {
    version: { type: 'number', const: 1 },
    title: { type: 'string', minLength: 1 },
    tabs: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'tiles'],
        properties: {
          name: { type: 'string' },
          tiles: { type: 'array' }
        }
      }
    },
    kpis: {
      type: 'array',
      items: {
        type: 'object',
        required: ['column', 'label', 'aggregation', 'format'],
        properties: {
          column: { type: 'string' },
          label: { type: 'string' },
          aggregation: { type: 'string', enum: ['sum', 'count', 'count_distinct', 'avg', 'truthy_count'] },
          format: { type: 'string', enum: ['currency', 'percent', 'integer', 'float'] }
        }
      }
    },
    charts: { type: 'array' },
    rankings: { type: 'array' },
    funnel: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        stages: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            required: ['column', 'label'],
            properties: {
              column: { type: 'string' },
              label: { type: 'string' },
              expression: { type: 'string' }
            }
          }
        }
      }
    },
    time_column: { type: ['string', 'null'] },
    id_column: { type: ['string', 'null'] },
    labels: { type: 'object' },
    formatting: { type: 'object' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    assumptions: { type: 'array', items: { type: 'string' } },
    diagnostics: { type: 'object' },
    queryPlan: { type: 'object' }
  }
}

// Simple schema validation (without external deps)
function validatePlan(plan: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!plan || typeof plan !== 'object') {
    errors.push('Plan must be a valid object')
    return { valid: false, errors }
  }
  
  if (plan.version !== 1) {
    errors.push(`Invalid version: expected 1, got ${plan.version}`)
  }
  
  if (!plan.title || typeof plan.title !== 'string') {
    errors.push('Missing or invalid title')
  }
  
  if (!Array.isArray(plan.tabs) || plan.tabs.length === 0) {
    errors.push('tabs must be a non-empty array')
  }
  
  if (!Array.isArray(plan.kpis)) {
    errors.push('kpis must be an array')
  }
  
  // Validate that spec is not completely empty
  const hasKpis = Array.isArray(plan.kpis) && plan.kpis.length > 0
  const hasCharts = Array.isArray(plan.charts) && plan.charts.length > 0
  const hasFunnel = plan.funnel?.stages?.length >= 2
  const hasRankings = Array.isArray(plan.rankings) && plan.rankings.length > 0
  
  if (!hasKpis && !hasCharts && !hasFunnel && !hasRankings) {
    errors.push('Spec is empty: must have at least one KPI, chart, funnel or ranking')
  }
  
  return { valid: errors.length === 0, errors }
}

// =====================================================
// PLAN GENERATION HELPERS
// =====================================================

function generateHeuristicPlan(semanticModel: any, userPrompt?: string): DashboardPlan {
  // Safely extract with defaults
  const columns = semanticModel?.columns || []
  const time_column = semanticModel?.time_column
  const id_column = semanticModel?.id_column
  const funnel = semanticModel?.funnel
  const dimensions = semanticModel?.dimensions || []
  const metrics = semanticModel?.metrics || []
  const dataset_name = semanticModel?.dataset_name
  
  const kpis: KPIDefinition[] = []
  const charts: ChartDefinition[] = []
  const rankings: RankingDefinition[] = []
  const tabs: TabLayout[] = []
  const labels: Record<string, string> = {}
  const formatting: Record<string, string> = {}
  const assumptions: string[] = []
  const warnings: string[] = []

  // CRM funnel order for fallback detection
  const CRM_FUNNEL_ORDER = [
    'st_entrada', 'entrada',
    'st_lead_ativo', 'lead_ativo',
    'st_qualificado', 'qualificado',
    'st_exp_agendada', 'exp_agendada', 'agendada',
    'st_exp_realizada', 'exp_realizada', 'realizada',
    'st_venda', 'venda', 'vendas',
    'aluno_ativo',
    'st_perdida', 'perdida'
  ]

  // Build labels and formatting maps
  for (const col of columns) {
    labels[col.name] = col.display_label
    formatting[col.name] = col.format
  }

  // 1. Build KPIs from metrics and stage_flags
  const stageFlags = columns.filter((c: any) => c.semantic_role === 'stage_flag')
  const metricCols = columns.filter((c: any) => c.semantic_role === 'metric' || c.semantic_role === 'rate')
  
  // Get funnel stages - use detected funnel or build from stage_flags
  let funnelStages = funnel?.stages || []
  
  if (funnelStages.length < 2 && stageFlags.length >= 2) {
    // Fallback: build funnel from stage_flag columns, sorted by CRM order
    const sortedStageFlags = [...stageFlags].sort((a: any, b: any) => {
      const aIndex = CRM_FUNNEL_ORDER.findIndex(s => 
        a.name.toLowerCase().includes(s.replace('st_', '')) || a.name.toLowerCase() === s
      )
      const bIndex = CRM_FUNNEL_ORDER.findIndex(s => 
        b.name.toLowerCase().includes(s.replace('st_', '')) || b.name.toLowerCase() === s
      )
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
    })
    
    funnelStages = sortedStageFlags.slice(0, 7).map((c: any) => ({
      column: c.name,
      label: c.display_label || c.name.replace(/^st_/, '').replace(/_/g, ' '),
      truthy_count_expression: `CASE WHEN "${c.name}" IN ('1','true','sim','s','ok','x','yes','y','on') THEN 1 ELSE 0 END`
    }))
    
    assumptions.push('Funil construído a partir de colunas stage_flag detectadas')
  }
  
  // Add funnel stage KPIs
  for (const stage of funnelStages.slice(0, 8)) {
    kpis.push({
      column: stage.column,
      label: stage.label,
      aggregation: 'truthy_count',
      format: 'integer',
      goal_direction: 'higher_better',
      truthy_expression: stage.truthy_count_expression
    })
  }

  // Add currency metrics
  const currencyMetrics = metricCols.filter((c: any) => c.format === 'currency')
  for (const col of currencyMetrics.slice(0, 3)) {
    kpis.push({
      column: col.name,
      label: col.display_label,
      aggregation: col.aggregator || 'sum',
      format: 'currency',
      goal_direction: col.name.includes('custo') || col.name.includes('cpl') || col.name.includes('cac') 
        ? 'lower_better' : 'higher_better'
    })
  }

  // Add rate metrics
  const rateMetrics = metricCols.filter((c: any) => c.format === 'percent')
  for (const col of rateMetrics.slice(0, 3)) {
    kpis.push({
      column: col.name,
      label: col.display_label,
      aggregation: 'avg',
      format: 'percent',
      goal_direction: 'higher_better'
    })
  }

  // 2. Build charts if time column exists
  if (time_column) {
    // Funnel evolution chart
    if (funnel?.stages?.length >= 2) {
      charts.push({
        id: 'funnel_evolution',
        type: 'line',
        title: 'Evolução do Funil',
        x_column: time_column,
        series: funnel.stages.slice(0, 4).map((s: any) => ({
          column: s.column,
          label: s.label,
          format: 'integer'
        }))
      })
    }

    // Cost evolution chart
    if (currencyMetrics.length > 0) {
      charts.push({
        id: 'cost_evolution',
        type: 'line',
        title: 'Investimento',
        x_column: time_column,
        series: currencyMetrics.slice(0, 2).map((c: any) => ({
          column: c.name,
          label: c.display_label,
          format: 'currency'
        }))
      })
    }

    // Rates evolution
    if (rateMetrics.length > 0) {
      charts.push({
        id: 'rates_evolution',
        type: 'line',
        title: 'Taxas de Conversão',
        x_column: time_column,
        series: rateMetrics.slice(0, 3).map((c: any) => ({
          column: c.name,
          label: c.display_label,
          format: 'percent'
        }))
      })
    }
  }

  // 3. Build rankings from dimensions
  for (const dimName of dimensions.slice(0, 3)) {
    const dimCol = columns.find((c: any) => c.name === dimName)
    // Use lead_id for count_distinct if available, otherwise count funnel stages
    const metricCol = funnel?.stages?.[0]?.column || currencyMetrics[0]?.name
    
    if (metricCol) {
      rankings.push({
        id: `ranking_${dimName}`,
        title: `Por ${dimCol?.display_label || dimName}`,
        dimension_column: dimName,
        metric_column: metricCol,
        aggregation: id_column ? 'count' : 'sum',
        limit: 10
      })
    }
  }

  // 4. Build tab layouts
  // Decisões tab (executive summary)
  const decisoesKpis = kpis.slice(0, 6).map(k => k.column)
  tabs.push({
    name: 'Decisões',
    tiles: [
      { id: 'kpi_main', type: 'kpi_row', columns: decisoesKpis },
      ...(funnelStages.length >= 2 ? [{ id: 'funnel_main', type: 'funnel' as const }] : []),
      ...(charts.length > 0 ? [{ id: 'chart_preview', type: 'chart' as const, config: { chart_id: charts[0].id } }] : [])
    ]
  })

  // Executivo tab
  tabs.push({
    name: 'Executivo',
    tiles: [
      { id: 'kpi_all', type: 'kpi_row', columns: kpis.map(k => k.column) },
      ...(funnelStages.length >= 2 ? [{ id: 'funnel_exec', type: 'funnel' as const }] : []),
    ]
  })

  // Funil tab (if funnel detected)
  if (funnelStages.length >= 2) {
    tabs.push({
      name: 'Funil',
      tiles: [
        { id: 'funnel_detail', type: 'funnel' },
        ...(charts.find(c => c.id === 'funnel_evolution') 
          ? [{ id: 'funnel_chart', type: 'chart' as const, config: { chart_id: 'funnel_evolution' } }] 
          : [])
      ]
    })
  }

  // Tendências tab (if charts exist)
  if (charts.length > 0) {
    tabs.push({
      name: 'Tendências',
      tiles: charts.map(c => ({ id: `chart_${c.id}`, type: 'chart' as const, config: { chart_id: c.id } }))
    })
  }

  // Dimensões tab (if rankings exist)
  if (rankings.length > 0) {
    tabs.push({
      name: 'Dimensões',
      tiles: rankings.map(r => ({ id: `ranking_${r.id}`, type: 'ranking' as const, config: { ranking_id: r.id } }))
    })
  }

  // Detalhes tab (always)
  tabs.push({
    name: 'Detalhes',
    tiles: [{ id: 'data_table', type: 'table' }]
  })

  // Calculate confidence based on what we actually generated
  const confidence = (
    (kpis.length > 0 ? 0.3 : 0) +
    (time_column ? 0.2 : 0) +
    (funnelStages.length >= 2 ? 0.3 : 0) +
    (dimensions.length > 0 ? 0.1 : 0) +
    (charts.length > 0 ? 0.1 : 0)
  )

  if (!time_column) {
    assumptions.push('Sem coluna de tempo - gráficos de tendência limitados')
  }
  if (funnelStages.length < 2) {
    assumptions.push('Funil não detectado ou insuficiente (< 2 etapas)')
  }

  return {
    version: 1,
    title: dataset_name || 'Dashboard',
    tabs,
    kpis,
    charts,
    rankings,
    funnel: funnelStages.length >= 2 ? {
      title: 'Funil de Conversão',
      stages: funnelStages.map((s: any) => ({
        column: s.column,
        label: s.label,
        expression: s.truthy_count_expression || 'truthy'
      }))
    } : undefined,
    time_column,
    id_column,
    labels,
    formatting,
    confidence,
    assumptions,
    warnings
  }
}

// =====================================================
// LLM-BASED PLAN GENERATION (robust prompt)
// =====================================================

const ROBUST_SYSTEM_PROMPT = `Você é o BAI Dashboard Architect, especialista em BI para CRM + tráfego pago e em modelagem de funil.
Você gera DashboardSpec v1 (JSON) para um SaaS de dashboards, usando APENAS as colunas fornecidas no semantic_model.
Seu objetivo é criar um dashboard adaptativo: escolher os melhores KPIs, gráficos e quebras (dimensões) de acordo com os dados.

REGRAS DURAS (NÃO QUEBRAR):
1. Nunca referencie colunas inexistentes. Faça match case-insensitive.
2. Se não houver coluna de tempo válida, ainda gere dashboard útil com KPIs agregados + Funil total + Detalhes. NUNCA spec vazio.
3. Para colunas de funil em text (entrada, qualificado, venda, etc.), trate como boolean truthy:
   TRUE se valor ∈ {1,true,sim,s,ok,x,yes,y,on}
   FALSE se valor ∈ {0,false,nao,não,n,no,null,''}
   KPIs de funil devem usar aggregation: "truthy_count" (NÃO count simples).
4. KPIs devem ser poucos (máx 8) e focados em decisão.
5. Gráficos devem ser poucos (máx 4): priorize tendências e visão do funil.
6. Diferencie dimensões (vendedora, origem, unidade) de métricas (valor_venda, custo).

CLASSIFICAÇÃO DE COLUNAS:
- time: created_at, data, dia, inserted_at, updated_at (mesmo se text, se parse_rate alto)
- id: lead_id, ids com alta cardinalidade
- dimension: campos categóricos (unidade, vendedora, origem, modalidade)
- stage_flag: etapas do funil (entrada, lead_ativo, qualificado, exp_*, venda, perdida)
- metric: valores numéricos reais (custo, receita, valor_venda)

ESTRUTURA ESPERADA POR ABA:
- Decisões: 3-6 bullets com mudanças, gargalos, alertas
- Executivo: 4-8 KPIs principais + 1 gráfico resumo
- Funil: 5-7 etapas + taxas de conversão entre etapas
- Tendências: 1-2 gráficos de linha se tempo existir
- Detalhes: tabela completa

SAÍDA OBRIGATÓRIA (JSON válido):
{
  "version": 1,
  "title": "string",
  "tabs": [{ "name": "string", "tiles": [...] }],
  "kpis": [{ "column": "string", "label": "string", "aggregation": "truthy_count|sum|count|avg", "format": "integer|currency|percent", "goal_direction": "higher_better|lower_better" }],
  "charts": [{ "id": "string", "type": "line|bar", "title": "string", "x_column": "string", "series": [...] }],
  "rankings": [{ "id": "string", "dimension_column": "string", "metric_column": "string", "aggregation": "count|sum", "limit": 10 }],
  "funnel": { "title": "string", "stages": [{ "column": "string", "label": "string", "expression": "truthy" }] },
  "time_column": "string|null",
  "id_column": "string|null",
  "labels": {},
  "formatting": {},
  "confidence": 0.0-1.0,
  "assumptions": ["string"],
  "diagnostics": { "time_column": "string", "dimensions_chosen": [], "funnel_stages_chosen": [], "assumptions": [], "warnings": [] },
  "queryPlan": { "lead_count_expr": "count_distinct(lead_id)", "stage_aggregations": {}, "time_grouping_expr": "date(created_at)" }
}

NÃO inclua explicações, apenas JSON válido.`

async function generateLLMPlan(
  semanticModel: any, 
  userPrompt: string,
  crmMode: boolean = false
): Promise<DashboardPlan | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) {
    console.log('No LOVABLE_API_KEY, falling back to heuristic')
    return null
  }

  try {
    const columns = semanticModel?.columns || []
    const columnSummary = columns.map((c: any) => 
      `- ${c.name} (${c.semantic_role}, ${c.format || 'text'}): ${c.display_label}${c.stats?.distinct_count ? ` [${c.stats.distinct_count} unique]` : ''}`
    ).join('\n')

    const funnelInfo = semanticModel.funnel?.detected 
      ? `Etapas: ${semanticModel.funnel.stages?.map((s: any) => `${s.label} (${s.column})`).join(' → ')}`
      : 'Funil não detectado automaticamente'

    const crmHints = crmMode ? `
MODO CRM ATIVO:
- Priorizar truthy_count para etapas (não count simples)
- Priorizar count_distinct(lead_id) para total de leads
- Priorizar dimensões: unidade, vendedora, origem, modalidade
- Tratar colunas text com nomes de etapa como stage_flag` : ''

    const userSection = userPrompt ? `\nREQUISITOS DO USUÁRIO:\n${userPrompt}` : ''

    const prompt = `MODELO SEMÂNTICO DO DATASET:
Dataset: ${semanticModel.dataset_name || 'unknown'}
Coluna de tempo: ${semanticModel.time_column || 'NENHUMA'}
Coluna de ID: ${semanticModel.id_column || 'NENHUMA'}
Funil: ${funnelInfo}
Dimensões detectadas: ${(semanticModel.dimensions || []).join(', ') || 'Nenhuma'}
Métricas detectadas: ${(semanticModel.metrics || []).join(', ') || 'Nenhuma'}
Confiança geral: ${Math.round((semanticModel.confidence || 0) * 100)}%

COLUNAS DISPONÍVEIS:
${columnSummary || 'Nenhuma coluna encontrada'}
${crmHints}${userSection}

Gere o DashboardPlan v1 JSON completo seguindo as regras do sistema.`

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: ROBUST_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 6000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('LLM request failed:', response.status, errorText)
      return null
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content

    if (!content) {
      console.error('No content from LLM')
      return null
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1]
    } else {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonStr = jsonMatch[0]
      }
    }

    const plan = JSON.parse(jsonStr) as DashboardPlan
    
    // Validate the plan
    const validation = validatePlan(plan)
    if (!validation.valid) {
      console.error('LLM plan validation failed:', validation.errors)
      return null
    }
    
    plan.assumptions = plan.assumptions || []
    plan.assumptions.push('Plano gerado via LLM')
    
    console.log(`LLM generated plan: ${plan.kpis?.length || 0} KPIs, ${plan.funnel?.stages?.length || 0} funnel stages`)
    
    return plan
  } catch (error) {
    console.error('LLM plan generation error:', error)
    return null
  }
}

// =====================================================
// DENO SERVE
// =====================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Authenticate
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado')
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager'])

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado')
    }

    // Parse request
    const body = await req.json()
    const { semantic_model, user_prompt, use_llm = false, crm_mode = false } = body

    if (!semantic_model) {
      return errorResponse('VALIDATION_ERROR', 'semantic_model é obrigatório')
    }

    // Generate plan
    let plan: DashboardPlan
    let source: 'llm' | 'heuristic' = 'heuristic'

    if (use_llm) {
      const llmPlan = await generateLLMPlan(semantic_model, user_prompt, crm_mode)
      if (llmPlan) {
        plan = llmPlan
        source = 'llm'
      } else {
        plan = generateHeuristicPlan(semantic_model, user_prompt)
      }
    } else {
      plan = generateHeuristicPlan(semantic_model, user_prompt)
    }

    // Final validation to ensure we never return empty spec
    const validation = validatePlan(plan)
    if (!validation.valid) {
      console.warn('Plan validation warnings:', validation.errors)
      // Add warnings but don't fail - the heuristic should always produce something
      plan.assumptions = plan.assumptions || []
      plan.assumptions.push(...validation.errors.map(e => `AVISO: ${e}`))
    }

    console.log(`Generated dashboard plan: ${plan.tabs?.length || 0} tabs, ${plan.kpis?.length || 0} KPIs, source: ${source}, confidence ${Math.round((plan.confidence || 0) * 100)}%`)

    return successResponse({
      dashboard_plan: plan,
      source,
      validation: { valid: validation.valid, errors: validation.errors }
    })

  } catch (error: any) {
    console.error('Error in generate-dashboard-plan:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message)
  }
})
