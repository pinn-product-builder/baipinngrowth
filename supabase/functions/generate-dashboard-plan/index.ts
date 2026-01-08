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

interface LayoutTile {
  id: string
  type: 'kpi_row' | 'funnel' | 'chart' | 'ranking' | 'table'
  title?: string
  columns?: string[]     // For kpi_row: which KPIs to show
  config?: Record<string, any>  // Type-specific config
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
  truthy_expression?: string  // For stage flags
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

  // Build labels and formatting maps
  for (const col of columns) {
    labels[col.name] = col.display_label
    formatting[col.name] = col.format
  }

  // 1. Build KPIs from metrics and stage_flags
  const stageFlags = columns.filter((c: any) => c.semantic_role === 'stage_flag')
  const metricCols = columns.filter((c: any) => c.semantic_role === 'metric' || c.semantic_role === 'rate')
  
  // Add funnel stage KPIs
  for (const stage of funnel?.stages || []) {
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
      ...(funnel?.stages?.length >= 2 ? [{ id: 'funnel_main', type: 'funnel' as const }] : []),
      ...(charts.length > 0 ? [{ id: 'chart_preview', type: 'chart' as const, config: { chart_id: charts[0].id } }] : [])
    ]
  })

  // Executivo tab
  tabs.push({
    name: 'Executivo',
    tiles: [
      { id: 'kpi_all', type: 'kpi_row', columns: kpis.map(k => k.column) },
      ...(funnel?.stages?.length >= 2 ? [{ id: 'funnel_exec', type: 'funnel' as const }] : []),
    ]
  })

  // Funil tab (if funnel detected)
  if (funnel?.stages?.length >= 2) {
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

  // Calculate confidence
  const confidence = (
    (kpis.length > 0 ? 0.3 : 0) +
    (time_column ? 0.2 : 0) +
    (funnel?.stages?.length >= 2 ? 0.3 : 0) +
    (dimensions.length > 0 ? 0.1 : 0) +
    (charts.length > 0 ? 0.1 : 0)
  )

  if (!time_column) {
    assumptions.push('Sem coluna de tempo - gráficos de tendência limitados')
  }
  if (!funnel?.detected) {
    assumptions.push('Funil não detectado automaticamente')
  }

  return {
    version: 1,
    title: dataset_name || 'Dashboard',
    tabs,
    kpis,
    charts,
    rankings,
    funnel: funnel?.detected ? {
      title: 'Funil de Conversão',
      stages: funnel.stages.map((s: any) => ({
        column: s.column,
        label: s.label,
        expression: s.truthy_count_expression
      }))
    } : undefined,
    time_column,
    id_column,
    labels,
    formatting,
    confidence,
    assumptions
  }
}

// =====================================================
// LLM-BASED PLAN GENERATION (optional enhancement)
// =====================================================

async function generateLLMPlan(
  semanticModel: any, 
  userPrompt: string
): Promise<DashboardPlan | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) {
    console.log('No LOVABLE_API_KEY, falling back to heuristic')
    return null
  }

  try {
    // Build context for LLM
    const columnSummary = semanticModel.columns.map((c: any) => 
      `- ${c.name} (${c.semantic_role}): ${c.display_label}`
    ).join('\n')

    const prompt = `Você é um especialista em dashboards de negócios. Dado o modelo semântico abaixo, gere um plano de dashboard otimizado.

MODELO SEMÂNTICO:
Dataset: ${semanticModel.dataset_name}
Coluna de tempo: ${semanticModel.time_column || 'NENHUMA'}
Coluna de ID: ${semanticModel.id_column || 'NENHUMA'}
Funil detectado: ${semanticModel.funnel?.detected ? 'Sim' : 'Não'}
Etapas do funil: ${semanticModel.funnel?.stages?.map((s: any) => s.label).join(' → ') || 'N/A'}
Dimensões: ${semanticModel.dimensions.join(', ') || 'Nenhuma'}
Métricas: ${semanticModel.metrics.join(', ') || 'Nenhuma'}

COLUNAS:
${columnSummary}

OBJETIVO DO USUÁRIO:
${userPrompt || 'Criar um dashboard executivo com KPIs, funil e tendências'}

Responda APENAS com um JSON válido no formato DashboardPlan. Priorize:
1. KPIs mais relevantes primeiro
2. Funil se detectado
3. Gráficos de tendência se houver coluna de tempo
4. Rankings por dimensão

NÃO inclua explicações, apenas o JSON.`

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é um gerador de planos de dashboard. Responda apenas com JSON válido.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    })

    if (!response.ok) {
      console.error('LLM request failed:', response.status)
      return null
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content

    if (!content) {
      console.error('No content from LLM')
      return null
    }

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON found in LLM response')
      return null
    }

    const plan = JSON.parse(jsonMatch[0]) as DashboardPlan
    plan.assumptions = plan.assumptions || []
    plan.assumptions.push('Plano gerado via LLM')
    
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
    const { semantic_model, user_prompt, use_llm = false } = body

    if (!semantic_model) {
      return errorResponse('VALIDATION_ERROR', 'semantic_model é obrigatório')
    }

    // Generate plan
    let plan: DashboardPlan

    if (use_llm) {
      const llmPlan = await generateLLMPlan(semantic_model, user_prompt)
      plan = llmPlan || generateHeuristicPlan(semantic_model, user_prompt)
    } else {
      plan = generateHeuristicPlan(semantic_model, user_prompt)
    }

    console.log(`Generated dashboard plan: ${plan.tabs.length} tabs, ${plan.kpis.length} KPIs, confidence ${Math.round(plan.confidence * 100)}%`)

    return successResponse({
      dashboard_plan: plan,
      source: plan.assumptions.includes('Plano gerado via LLM') ? 'llm' : 'heuristic'
    })

  } catch (error: any) {
    console.error('Error in generate-dashboard-plan:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message)
  }
})
