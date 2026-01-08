import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({ ok: false, error: { code, message, details } }, 400)
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data })
}

// Encryption helpers
async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!masterKey) throw new Error('MASTER_ENCRYPTION_KEY not configured')
  
  const encoder = new TextEncoder()
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  )
  
  return new TextDecoder().decode(decrypted)
}

// =====================================================
// SEMANTIC TYPE DEFINITIONS
// =====================================================

type SemanticRole = 
  | 'time'           // Primary time axis (date/datetime)
  | 'id'             // Unique identifier (for count_distinct) - NEVER show in UI
  | 'code'           // Internal code/token - NEVER show in UI
  | 'stage_flag'     // Boolean-like indicating funnel stage (entrada, qualificado, venda)
  | 'metric'         // Numeric value to aggregate (custo, receita)
  | 'dimension'      // Categorical for grouping (vendedora, unidade, origem)
  | 'rate'           // Pre-calculated percentage
  | 'text'           // Generic text
  | 'ignore'         // Column to be ignored completely
  | 'unknown'

interface ColumnStats {
  null_rate: number
  distinct_count: number
  boolean_like_rate: number   // % of values that are truthy/falsy
  numeric_parse_rate: number  // % of values that parse as numbers
  date_parse_rate: number     // % of values that parse as dates
  min?: number | string
  max?: number | string
  avg?: number
  sample_values: any[]
}

interface SemanticColumn {
  name: string
  db_type: string
  semantic_role: SemanticRole
  display_label: string
  aggregator: 'sum' | 'count' | 'count_distinct' | 'avg' | 'none' | 'truthy_count'
  format: 'currency' | 'percent' | 'integer' | 'float' | 'date' | 'text'
  stats: ColumnStats
  confidence: number          // 0-1 how confident in the classification
  notes: string[]             // Explanation of why classified this way
  usable_as_filter: boolean   // Can be used as a filter
  usable_in_kpi: boolean      // Can be used in KPIs
  usable_in_chart: boolean    // Can be used in charts
  ignore_in_ui: boolean       // Should be hidden from visualization
}

interface FunnelStage {
  column: string
  label: string
  order: number
  truthy_count_expression: string  // How to count this stage
}

interface SemanticModel {
  version: number
  dataset_id: string
  dataset_name: string
  columns: SemanticColumn[]
  time_column: string | null
  id_column: string | null
  funnel: {
    detected: boolean
    stages: FunnelStage[]
    confidence: number
  }
  dimensions: string[]
  metrics: string[]
  date_range: { min: string | null; max: string | null }
  overall_confidence: number
  warnings: string[]
  assumptions: string[]
}

// =====================================================
// DETECTION HELPERS
// =====================================================

const TRUTHY_VALUES = new Set(['1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'on'])
const FALSY_VALUES = new Set(['0', 'false', 'nao', 'não', 'n', 'no', '', 'off'])

function isBooleanLike(value: any): boolean {
  if (value === null || value === undefined) return false
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v) || FALSY_VALUES.has(v)
}

function isTruthy(value: any): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v)
}

function looksLikeDate(value: any): boolean {
  if (value == null) return false
  if (value instanceof Date) return !isNaN(value.getTime())
  if (typeof value !== 'string') return false
  // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true
  // BR format: dd/MM/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) return true
  return false
}

function looksLikeNumeric(value: any): boolean {
  if (typeof value === 'number') return isFinite(value)
  if (typeof value !== 'string') return false
  const cleaned = value.replace(/[R$\s,]/g, '').replace(',', '.')
  return !isNaN(parseFloat(cleaned))
}

function parseNumeric(value: any): number | null {
  if (typeof value === 'number') return isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[R$\s]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isFinite(num) ? num : null
}

// Stage name patterns (ordered by typical funnel position)
const STAGE_PATTERNS: { pattern: RegExp; order: number; label: string }[] = [
  { pattern: /^(st_)?entrada$/i, order: 1, label: 'Entrada' },
  { pattern: /^(st_)?entrou$/i, order: 1, label: 'Entrada' },
  { pattern: /^(st_)?lead_entrada$/i, order: 1, label: 'Entrada' },
  { pattern: /^(st_)?lead_ativo$/i, order: 2, label: 'Lead Ativo' },
  { pattern: /^(st_)?ativo$/i, order: 2, label: 'Lead Ativo' },
  { pattern: /^(st_)?qualificado$/i, order: 3, label: 'Qualificado' },
  { pattern: /^(st_)?qualificacao$/i, order: 3, label: 'Qualificado' },
  { pattern: /^(st_)?lead_qualificado$/i, order: 3, label: 'Qualificado' },
  { pattern: /^(st_)?exp_agendada$/i, order: 4, label: 'Exp. Agendada' },
  { pattern: /^(st_)?agendado$/i, order: 4, label: 'Exp. Agendada' },
  { pattern: /^(st_)?agendamento$/i, order: 4, label: 'Exp. Agendada' },
  { pattern: /^(st_)?exp_realizada$/i, order: 5, label: 'Exp. Realizada' },
  { pattern: /^(st_)?realizada$/i, order: 5, label: 'Exp. Realizada' },
  { pattern: /^(st_)?compareceu$/i, order: 5, label: 'Exp. Realizada' },
  { pattern: /^(st_)?venda$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?fechou$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?ganho$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?vendido$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?convertido$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?perdida$/i, order: 99, label: 'Perdido' },
  { pattern: /^(st_)?perdido$/i, order: 99, label: 'Perdido' },
  { pattern: /^(st_)?perdeu$/i, order: 99, label: 'Perdido' },
  { pattern: /^(st_)?aluno_ativo$/i, order: 100, label: 'Aluno Ativo' },
  { pattern: /^(st_)?cliente_ativo$/i, order: 100, label: 'Cliente Ativo' },
]

const TIME_PATTERNS = [
  'created_at', 'updated_at', 'inserted_at', 'data', 'dia', 'day', 'date', 
  'timestamp', 'created', 'updated', 'dt_', 'data_', 'created_at_ts'
]

// ID patterns - columns that should be IGNORED in visualization
const ID_PATTERNS = ['lead_id', 'id', 'uuid', '_id', 'codigo', 'code', 'idd', 'token', 'hash', 'key', 'ref']

// Columns to ALWAYS ignore in UI (codes, internal IDs, etc.)
const IGNORE_PATTERNS = [
  'token', 'hash', 'secret', 'password', 'api_key', 
  'internal_id', 'external_id', 'legacy_id', 'old_id'
]

const CURRENCY_PATTERNS = ['custo', 'valor', 'preco', 'price', 'spend', 'investimento', 'receita', 'faturamento']

const RATE_PATTERNS = ['taxa_', 'rate', 'conv_', 'pct_', 'percent']

const DIMENSION_PATTERNS = ['vendedor', 'vendedora', 'unidade', 'origem', 'fonte', 'source', 'canal', 'modalidade', 'categoria', 'tipo', 'campanha', 'campaign', 'retencao']

function generateLabel(name: string): string {
  const labelMap: Record<string, string> = {
    custo_total: 'Investimento',
    leads_total: 'Leads',
    entrada_total: 'Entradas',
    entrada: 'Entrada',
    venda_total: 'Vendas',
    venda: 'Venda',
    qualificado: 'Qualificado',
    exp_agendada: 'Exp. Agendada',
    exp_realizada: 'Exp. Realizada',
    lead_ativo: 'Lead Ativo',
    dia: 'Data',
    day: 'Data',
    spend: 'Investimento',
    sales: 'Vendas',
    leads_new: 'Novos Leads',
    cpl: 'CPL',
    cac: 'CAC',
    vendedora: 'Vendedora',
    unidade: 'Unidade',
    origem: 'Origem',
    modalidade: 'Modalidade',
  }

  const lower = name.toLowerCase()
  if (labelMap[lower]) return labelMap[lower]

  return name
    .replace(/_total$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// =====================================================
// MAIN SEMANTIC MODEL BUILDER
// =====================================================

function buildSemanticModel(
  datasetId: string,
  datasetName: string,
  sampleRows: Record<string, any>[],
  existingColumns?: { column_name: string; db_type: string; display_label?: string }[]
): SemanticModel {
  const warnings: string[] = []
  const assumptions: string[] = []
  const columns: SemanticColumn[] = []
  
  if (sampleRows.length === 0) {
    return {
      version: 1,
      dataset_id: datasetId,
      dataset_name: datasetName,
      columns: [],
      time_column: null,
      id_column: null,
      funnel: { detected: false, stages: [], confidence: 0 },
      dimensions: [],
      metrics: [],
      date_range: { min: null, max: null },
      overall_confidence: 0,
      warnings: ['Nenhuma linha de amostra disponível'],
      assumptions: []
    }
  }

  const columnNames = Object.keys(sampleRows[0])
  const funnelStages: FunnelStage[] = []
  let timeColumn: string | null = null
  let idColumn: string | null = null
  const dimensions: string[] = []
  const metrics: string[] = []
  let dateMin: string | null = null
  let dateMax: string | null = null

  for (const colName of columnNames) {
    const values = sampleRows.map(row => row[colName])
    const nonNull = values.filter(v => v !== null && v !== undefined && v !== '')
    const notes: string[] = []
    
    // Calculate stats
    const nullRate = values.length > 0 ? (values.length - nonNull.length) / values.length : 0
    const distinctCount = new Set(nonNull.map(v => JSON.stringify(v))).size
    
    const booleanLikeCount = nonNull.filter(v => isBooleanLike(v)).length
    const booleanLikeRate = nonNull.length > 0 ? booleanLikeCount / nonNull.length : 0
    
    const numericCount = nonNull.filter(v => looksLikeNumeric(v)).length
    const numericParseRate = nonNull.length > 0 ? numericCount / nonNull.length : 0
    
    const dateCount = nonNull.filter(v => looksLikeDate(v)).length
    const dateParseRate = nonNull.length > 0 ? dateCount / nonNull.length : 0

    // Numeric stats
    let min: number | string | undefined
    let max: number | string | undefined
    let avg: number | undefined
    
    if (numericParseRate > 0.8) {
      const nums = nonNull.map(v => parseNumeric(v)).filter((n): n is number => n !== null)
      if (nums.length > 0) {
        min = Math.min(...nums)
        max = Math.max(...nums)
        avg = nums.reduce((a, b) => a + b, 0) / nums.length
      }
    }

    // Sample values
    const sampleValues = [...new Set(nonNull)].slice(0, 10)

    const stats: ColumnStats = {
      null_rate: nullRate,
      distinct_count: distinctCount,
      boolean_like_rate: booleanLikeRate,
      numeric_parse_rate: numericParseRate,
      date_parse_rate: dateParseRate,
      min,
      max,
      avg,
      sample_values: sampleValues
    }

    // Find existing column metadata
    const existingCol = existingColumns?.find(c => c.column_name === colName)
    const dbType = existingCol?.db_type || (numericParseRate > 0.8 ? 'numeric' : 'text')
    
    // Detect semantic role
    const lowerName = colName.toLowerCase()
    let role: SemanticRole = 'unknown'
    let aggregator: SemanticColumn['aggregator'] = 'none'
    let format: SemanticColumn['format'] = 'text'
    let confidence = 0.5
    let usable_as_filter = false
    let usable_in_kpi = false
    let usable_in_chart = false
    let ignore_in_ui = false

    // 0. Check if this column should be IGNORED completely
    const shouldIgnore = IGNORE_PATTERNS.some(p => lowerName.includes(p))
    if (shouldIgnore) {
      role = 'ignore'
      confidence = 1.0
      ignore_in_ui = true
      notes.push('Coluna ignorada por conter padrão sensível/interno')
    }

    // 1. Check for TIME column
    if (role === 'unknown' || role === 'ignore') {
      const isTimeByName = TIME_PATTERNS.some(p => lowerName === p || lowerName.startsWith(p) || lowerName.includes('created') || lowerName.includes('updated'))
      const isTimeByValue = dateParseRate > 0.7
      
      if (isTimeByName && isTimeByValue) {
        role = 'time'
        aggregator = 'none'
        format = 'date'
        confidence = 1.0
        usable_as_filter = true
        usable_in_chart = true
        ignore_in_ui = false
        notes.push('Nome e valores confirmam coluna de tempo')
        
        if (!timeColumn) {
          timeColumn = colName
          // Extract date range
          const dates = nonNull.filter(v => looksLikeDate(v)).sort()
          if (dates.length > 0) {
            dateMin = String(dates[0])
            dateMax = String(dates[dates.length - 1])
          }
        }
      } else if (isTimeByValue && !isTimeByName && role !== 'ignore') {
        role = 'time'
        format = 'date'
        confidence = 0.8
        usable_as_filter = true
        usable_in_chart = true
        notes.push('Valores parecem datas mas nome não é típico')
        assumptions.push(`Coluna ${colName} classificada como tempo por valores`)
      } else if (isTimeByName && !isTimeByValue) {
        warnings.push(`Coluna ${colName} tem nome de tempo mas valores não parseiam (${Math.round(dateParseRate * 100)}% válidos)`)
      }
    }

    // 2. Check for ID/CODE column - MUST be ignored in UI but can be used for count_distinct
    if (role === 'unknown') {
      const isIdByName = ID_PATTERNS.some(p => lowerName === p || lowerName.endsWith(p) || lowerName.startsWith(p))
      const highCardinality = distinctCount > sampleRows.length * 0.5
      const veryHighCardinality = distinctCount > sampleRows.length * 0.8
      
      if (isIdByName && highCardinality) {
        // Check if this is the PRIMARY ID (lead_id preferred)
        const isPreferredId = lowerName.includes('lead') || lowerName === 'id'
        
        if (isPreferredId && !idColumn) {
          idColumn = colName
          role = 'id'
          aggregator = 'count_distinct'
          format = 'integer'
          confidence = 0.95
          usable_in_kpi = true  // For count_distinct(lead_id)
          ignore_in_ui = true   // Never show in tables/charts
          notes.push('ID primário escolhido para count_distinct')
        } else {
          // Secondary ID - completely ignore
          role = 'code'
          aggregator = 'none'
          format = 'text'
          confidence = 0.9
          ignore_in_ui = true
          notes.push('ID/código secundário - ignorado na visualização')
        }
      } else if (veryHighCardinality && !isIdByName) {
        // High cardinality without ID pattern - likely code/token
        role = 'code'
        aggregator = 'none'
        format = 'text'
        confidence = 0.7
        ignore_in_ui = true
        notes.push('Alta cardinalidade sugere código interno - ignorado')
        assumptions.push(`Coluna ${colName} tem ${distinctCount}/${sampleRows.length} valores únicos, tratada como código`)
      }
    }

    // 3. Check for STAGE_FLAG (funnel stages) - USE truthy_count aggregation
    if (role === 'unknown') {
      const stageMatch = STAGE_PATTERNS.find(s => s.pattern.test(lowerName))
      
      if (stageMatch) {
        role = 'stage_flag'
        aggregator = 'truthy_count'  // CRITICAL: use truthy_count, not sum
        format = 'integer'
        confidence = booleanLikeRate > 0.7 ? 0.95 : 0.8
        usable_in_kpi = true
        usable_in_chart = true
        usable_as_filter = true
        notes.push(`Etapa de funil: ${stageMatch.label} (truthy_count)`)
        
        funnelStages.push({
          column: colName,
          label: stageMatch.label,
          order: stageMatch.order,
          truthy_count_expression: `SUM(CASE WHEN ${colName} IN ('1','true','sim','s','yes','y','ok','x') THEN 1 ELSE 0 END)`
        })
      } else if (booleanLikeRate > 0.8 && distinctCount <= 5) {
        // Boolean-like but not a known stage
        role = 'stage_flag'
        aggregator = 'truthy_count'
        format = 'integer'
        confidence = 0.7
        usable_in_kpi = true
        usable_as_filter = true
        notes.push('Parece flag booleano (alto boolean_like_rate)')
        assumptions.push(`Coluna ${colName} tratada como flag por ter ${Math.round(booleanLikeRate * 100)}% valores booleanos`)
      }
    }

    // 4. Check for CURRENCY/METRIC
    if (role === 'unknown' && numericParseRate > 0.8) {
      const isCurrency = CURRENCY_PATTERNS.some(p => lowerName.includes(p))
      const isRate = RATE_PATTERNS.some(p => lowerName.startsWith(p) || lowerName.includes(p))
      
      if (isCurrency) {
        role = 'metric'
        aggregator = 'sum'
        format = 'currency'
        confidence = 0.9
        usable_in_kpi = true
        usable_in_chart = true
        notes.push('Padrão de moeda por nome')
        metrics.push(colName)
      } else if (isRate) {
        role = 'rate'
        aggregator = 'avg'
        format = 'percent'
        confidence = 0.9
        usable_in_kpi = true
        usable_in_chart = true
        notes.push('Padrão de taxa/percentual')
        metrics.push(colName)
      } else if (lowerName.endsWith('_total') || lowerName.includes('count') || lowerName.includes('qtd')) {
        role = 'metric'
        aggregator = 'sum'
        format = 'integer'
        confidence = 0.85
        usable_in_kpi = true
        usable_in_chart = true
        notes.push('Padrão de contagem/total')
        metrics.push(colName)
      } else {
        // Generic numeric
        role = 'metric'
        aggregator = 'sum'
        format = 'float'
        confidence = 0.6
        usable_in_kpi = true
        usable_in_chart = true
        notes.push('Numérico genérico')
        metrics.push(colName)
      }
    }

    // 5. Check for DIMENSION (categorical columns for grouping/filtering)
    if (role === 'unknown') {
      const isDimensionByName = DIMENSION_PATTERNS.some(p => lowerName.includes(p))
      const isCategorical = distinctCount >= 2 && distinctCount <= 100 && distinctCount < sampleRows.length * 0.3
      const hasReasonableCardinalityForFilter = distinctCount >= 2 && distinctCount <= 500
      
      if (isDimensionByName || isCategorical) {
        role = 'dimension'
        aggregator = 'none'
        format = 'text'
        confidence = isDimensionByName ? 0.9 : 0.7
        usable_as_filter = hasReasonableCardinalityForFilter
        usable_in_chart = true
        notes.push(isDimensionByName ? 'Padrão de dimensão por nome' : 'Baixa cardinalidade sugere dimensão')
        if (hasReasonableCardinalityForFilter) {
          notes.push(`Adequado para filtro (${distinctCount} valores distintos)`)
        }
        dimensions.push(colName)
      }
    }

    // 6. Fallback to text
    if (role === 'unknown') {
      role = 'text'
      format = 'text'
      confidence = 0.3
      notes.push('Classificação padrão')
    }

    columns.push({
      name: colName,
      db_type: dbType,
      semantic_role: role,
      display_label: existingCol?.display_label || generateLabel(colName),
      aggregator,
      format,
      stats,
      confidence,
      notes,
      usable_as_filter,
      usable_in_kpi,
      usable_in_chart,
      ignore_in_ui
    })
  }

  // Sort funnel stages by order
  funnelStages.sort((a, b) => a.order - b.order)
  
  // Calculate overall confidence
  const avgConfidence = columns.length > 0 
    ? columns.reduce((sum, c) => sum + c.confidence, 0) / columns.length 
    : 0
  
  const funnelConfidence = funnelStages.length >= 2 ? 0.9 : 0
  const overallConfidence = (avgConfidence * 0.6) + (timeColumn ? 0.2 : 0) + (funnelConfidence * 0.2)

  // Add warnings for low confidence classifications
  columns.filter(c => c.confidence < 0.6).forEach(c => {
    if (c.semantic_role !== 'text' && c.semantic_role !== 'unknown') {
      warnings.push(`Baixa confiança em ${c.name} como ${c.semantic_role} (${Math.round(c.confidence * 100)}%)`)
    }
  })

  if (!timeColumn) {
    warnings.push('Nenhuma coluna de tempo detectada - gráficos de tendência não disponíveis')
  }

  if (funnelStages.length < 2) {
    warnings.push('Menos de 2 etapas de funil detectadas - funil não disponível')
  }

  return {
    version: 1,
    dataset_id: datasetId,
    dataset_name: datasetName,
    columns,
    time_column: timeColumn,
    id_column: idColumn,
    funnel: {
      detected: funnelStages.length >= 2,
      stages: funnelStages,
      confidence: funnelStages.length >= 3 ? 0.9 : funnelStages.length >= 2 ? 0.7 : 0
    },
    dimensions,
    metrics,
    date_range: { min: dateMin, max: dateMax },
    overall_confidence: overallConfidence,
    warnings,
    assumptions
  }
}

// =====================================================
// DENO SERVE
// =====================================================

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
    const { dataset_id, sample_limit = 200 } = body

    if (!dataset_id) {
      return errorResponse('VALIDATION_ERROR', 'dataset_id é obrigatório')
    }

    // Fetch dataset
    const { data: dataset, error: dsError } = await adminClient
      .from('datasets')
      .select('*, tenant_data_sources(*)')
      .eq('id', dataset_id)
      .single()

    if (dsError || !dataset) {
      return errorResponse('NOT_FOUND', 'Dataset não encontrado')
    }

    // Fetch existing columns
    const { data: columnsData } = await adminClient
      .from('dataset_columns')
      .select('column_name, db_type, display_label')
      .eq('dataset_id', dataset_id)

    // Get data source credentials
    const dataSource = dataset.tenant_data_sources
    if (!dataSource) {
      return errorResponse('NO_DATASOURCE', 'Data source não encontrado')
    }

    let apiKey: string | null = null

    if (dataSource.service_role_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.service_role_key_encrypted)
      } catch (e) {
        console.error('Failed to decrypt service_role_key')
      }
    }

    if (!apiKey && dataSource.anon_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.anon_key_encrypted)
      } catch (e) {
        console.error('Failed to decrypt anon_key')
      }
    }

    // Fallback to Afonsina keys
    if (!apiKey) {
      const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
      const afonsinaKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
      
      if (afonsinaUrl && dataSource.project_url === afonsinaUrl && afonsinaKey) {
        apiKey = afonsinaKey
      }
    }

    if (!apiKey) {
      return errorResponse('NO_CREDENTIALS', 'Credenciais não configuradas')
    }

    // Fetch sample data
    const objectName = dataset.object_name
    const sampleUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*&limit=${sample_limit}`
    
    console.log(`Fetching sample from ${objectName}, limit ${sample_limit}`)
    
    const sampleResponse = await fetch(sampleUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    })

    if (!sampleResponse.ok) {
      const errorText = await sampleResponse.text()
      return errorResponse('FETCH_ERROR', 'Erro ao buscar dados', errorText)
    }

    const sampleRows = await sampleResponse.json()

    if (!Array.isArray(sampleRows)) {
      return errorResponse('INVALID_DATA', 'Resposta inválida do data source')
    }

    // Build semantic model
    const semanticModel = buildSemanticModel(
      dataset_id,
      dataset.name,
      sampleRows,
      columnsData || undefined
    )

    console.log(`Built semantic model: ${semanticModel.columns.length} columns, confidence ${Math.round(semanticModel.overall_confidence * 100)}%`)

    return successResponse({
      semantic_model: semanticModel,
      sample_count: sampleRows.length
    })

  } catch (error: any) {
    console.error('Error in build-semantic-model:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message)
  }
})
