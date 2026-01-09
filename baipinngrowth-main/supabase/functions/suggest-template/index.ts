import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: Record<string, any>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({ ok: false, error: { code, message, details } })
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data })
}

interface ColumnMeta {
  column_name: string
  db_type: string
  semantic_type: string | null
  role_hint: string | null
  format: string | null
  display_label: string
}

interface TemplateMatch {
  template_id: string
  template_name: string
  confidence: number
  reasoning: string[]
  suggested_tiles: any[]
}

// Template detection rules
function detectCostsFunnelDaily(columns: ColumnMeta[]): TemplateMatch | null {
  const colNames = columns.map(c => c.column_name.toLowerCase())
  const reasoning: string[] = []
  let score = 0

  // Check for date column
  const hasDateColumn = colNames.some(c => ['dia', 'date', 'data', 'created_at'].includes(c))
  if (hasDateColumn) {
    score += 20
    reasoning.push('✓ Coluna de data encontrada')
  }

  // Check for custo/investment
  const hasCusto = colNames.some(c => c.includes('custo') || c.includes('invest'))
  if (hasCusto) {
    score += 25
    reasoning.push('✓ Coluna de custo/investimento encontrada')
  }

  // Check for *_total columns (funnel stages)
  const totalColumns = colNames.filter(c => c.endsWith('_total'))
  if (totalColumns.length >= 3) {
    score += 30
    reasoning.push(`✓ ${totalColumns.length} colunas de etapas (*_total) encontradas`)
  }

  // Check for CPL/CAC
  const hasCplCac = colNames.some(c => c === 'cpl' || c === 'cac')
  if (hasCplCac) {
    score += 15
    reasoning.push('✓ Métricas CPL/CAC encontradas')
  }

  // Check for taxa_* columns
  const hasTaxas = colNames.filter(c => c.startsWith('taxa_')).length >= 2
  if (hasTaxas) {
    score += 10
    reasoning.push('✓ Taxas de conversão encontradas')
  }

  if (score < 50) return null

  // Generate suggested tiles
  const tiles = []
  
  // KPI Row
  const kpiColumns = ['custo_total', 'leads_total', 'reuniao_realizada_total', 'venda_total', 'cpl', 'cac']
    .filter(k => colNames.includes(k))
  
  tiles.push({
    type: 'kpi_row',
    columns: kpiColumns,
    tab: 'executivo'
  })

  // Funnel
  const funnelStages = ['leads_total', 'entrada_total', 'reuniao_agendada_total', 'reuniao_realizada_total', 'venda_total']
    .filter(s => colNames.includes(s))
  
  if (funnelStages.length >= 2) {
    tiles.push({
      type: 'funnel',
      stages: funnelStages,
      tab: 'executivo'
    })
  }

  // Trend charts
  tiles.push({
    type: 'line_chart',
    series: ['custo_total'].filter(s => colNames.includes(s)),
    x_axis: 'dia',
    tab: 'executivo'
  })

  tiles.push({
    type: 'line_chart',
    series: ['cpl', 'cac'].filter(s => colNames.includes(s)),
    x_axis: 'dia',
    tab: 'eficiencia'
  })

  // Table
  tiles.push({
    type: 'data_table',
    columns: colNames.filter(c => !['id', 'created_at', 'updated_at'].includes(c)),
    tab: 'detalhes'
  })

  return {
    template_id: 'costs_funnel_daily',
    template_name: 'Custo x Funil (Diário)',
    confidence: score,
    reasoning,
    suggested_tiles: tiles
  }
}

function detectFinanceTemplate(columns: ColumnMeta[]): TemplateMatch | null {
  const colNames = columns.map(c => c.column_name.toLowerCase())
  const reasoning: string[] = []
  let score = 0

  // Check for currency columns
  const currencyColumns = columns.filter(c => c.semantic_type === 'currency')
  if (currencyColumns.length >= 3) {
    score += 30
    reasoning.push(`✓ ${currencyColumns.length} colunas monetárias encontradas`)
  }

  // Check for receita/faturamento
  const hasReceita = colNames.some(c => c.includes('receita') || c.includes('fatur') || c.includes('revenue'))
  if (hasReceita) {
    score += 25
    reasoning.push('✓ Coluna de receita/faturamento encontrada')
  }

  // Check for ROI/ROAS
  const hasRoi = colNames.some(c => c.includes('roi') || c.includes('roas') || c.includes('retorno'))
  if (hasRoi) {
    score += 20
    reasoning.push('✓ Métricas de retorno (ROI/ROAS) encontradas')
  }

  // Check for date
  const hasDate = colNames.some(c => ['dia', 'date', 'data', 'mes', 'month'].includes(c))
  if (hasDate) {
    score += 15
    reasoning.push('✓ Coluna temporal encontrada')
  }

  if (score < 50) return null

  const tiles = [
    {
      type: 'kpi_row',
      columns: currencyColumns.slice(0, 6).map(c => c.column_name),
      tab: 'executivo'
    },
    {
      type: 'bar_chart',
      series: currencyColumns.slice(0, 4).map(c => c.column_name),
      x_axis: colNames.find(c => ['dia', 'date', 'data', 'mes'].includes(c)) || 'dia',
      tab: 'executivo'
    },
    {
      type: 'data_table',
      columns: colNames.filter(c => !['id'].includes(c)),
      tab: 'detalhes'
    }
  ]

  return {
    template_id: 'finance',
    template_name: 'Financeiro',
    confidence: score,
    reasoning,
    suggested_tiles: tiles
  }
}

function detectOperationalTemplate(columns: ColumnMeta[]): TemplateMatch | null {
  const colNames = columns.map(c => c.column_name.toLowerCase())
  const reasoning: string[] = []
  let score = 0

  // Check for dimension columns
  const dimensionColumns = columns.filter(c => c.semantic_type === 'dimension')
  if (dimensionColumns.length >= 2) {
    score += 30
    reasoning.push(`✓ ${dimensionColumns.length} dimensões encontradas`)
  }

  // Check for count/metric columns
  const countColumns = columns.filter(c => c.semantic_type === 'count' || c.semantic_type === 'metric')
  if (countColumns.length >= 2) {
    score += 25
    reasoning.push(`✓ ${countColumns.length} métricas/contagens encontradas`)
  }

  // Check for status column
  const hasStatus = colNames.some(c => c.includes('status') || c.includes('estado') || c.includes('situacao'))
  if (hasStatus) {
    score += 15
    reasoning.push('✓ Coluna de status encontrada')
  }

  if (score < 40) return null

  const tiles = [
    {
      type: 'kpi_row',
      columns: countColumns.slice(0, 6).map(c => c.column_name),
      tab: 'executivo'
    },
    {
      type: 'data_table',
      columns: colNames.filter(c => c !== 'id'),
      tab: 'detalhes'
    }
  ]

  return {
    template_id: 'operational',
    template_name: 'Operacional',
    confidence: score,
    reasoning,
    suggested_tiles: tiles
  }
}

function detectTimeSeriesTemplate(columns: ColumnMeta[]): TemplateMatch | null {
  const colNames = columns.map(c => c.column_name.toLowerCase())
  const reasoning: string[] = []
  let score = 0

  // Check for time column
  const timeColumns = columns.filter(c => c.semantic_type === 'time')
  if (timeColumns.length >= 1) {
    score += 40
    reasoning.push('✓ Coluna temporal encontrada')
  } else {
    return null // Must have time for time series
  }

  // Check for metrics
  const metricColumns = columns.filter(c => 
    c.semantic_type === 'metric' || c.semantic_type === 'count' || c.semantic_type === 'currency'
  )
  if (metricColumns.length >= 1) {
    score += 30
    reasoning.push(`✓ ${metricColumns.length} métricas encontradas`)
  }

  if (score < 50) return null

  const xAxis = timeColumns[0].column_name

  const tiles = [
    {
      type: 'line_chart',
      series: metricColumns.slice(0, 4).map(c => c.column_name),
      x_axis: xAxis,
      tab: 'executivo'
    },
    {
      type: 'data_table',
      columns: colNames.filter(c => c !== 'id'),
      tab: 'detalhes'
    }
  ]

  return {
    template_id: 'time_series',
    template_name: 'Série Temporal',
    confidence: score,
    reasoning,
    suggested_tiles: tiles
  }
}

Deno.serve(async (req) => {
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
    const { dataset_id } = body

    if (!dataset_id) {
      return errorResponse('VALIDATION_ERROR', 'dataset_id é obrigatório')
    }

    // Fetch dataset columns
    const { data: columns, error: colError } = await adminClient
      .from('dataset_columns')
      .select('*')
      .eq('dataset_id', dataset_id)
      .order('sort_priority')

    if (colError) {
      return errorResponse('DB_ERROR', 'Erro ao buscar colunas', colError.message)
    }

    if (!columns || columns.length === 0) {
      return errorResponse('NO_COLUMNS', 'Dataset sem colunas. Execute a introspecção primeiro.')
    }

    console.log('Analyzing', columns.length, 'columns for template suggestion')

    // Try each template detector in order of specificity
    const detectors = [
      detectCostsFunnelDaily,
      detectFinanceTemplate,
      detectOperationalTemplate,
      detectTimeSeriesTemplate
    ]

    const matches: TemplateMatch[] = []

    for (const detector of detectors) {
      const match = detector(columns as ColumnMeta[])
      if (match) {
        matches.push(match)
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence)

    // Always include a "custom" fallback
    const customTemplate: TemplateMatch = {
      template_id: 'custom',
      template_name: 'Personalizado',
      confidence: 0,
      reasoning: ['Template genérico para configuração manual'],
      suggested_tiles: [
        {
          type: 'data_table',
          columns: columns.filter(c => c.column_name !== 'id').map(c => c.column_name),
          tab: 'detalhes'
        }
      ]
    }

    const suggestions = matches.length > 0 ? matches : [customTemplate]
    const recommended = suggestions[0]

    console.log('Template recommendation:', recommended.template_id, 'confidence:', recommended.confidence)

    return successResponse({
      recommended,
      alternatives: suggestions.slice(1),
      all_suggestions: suggestions
    })

  } catch (error: any) {
    console.error('Error in suggest-template:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message)
  }
})
