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

// CRM funnel stage names
const CRM_FUNNEL_STAGES = [
  'entrada', 'lead_ativo', 'qualificado', 'exp_agendada', 'exp_realizada',
  'exp_nao_confirmada', 'faltou_exp', 'reagendou', 'venda', 'perdida', 'aluno_ativo'
]

// Time column aliases
const TIME_ALIASES = [
  'created_at', 'updated_at', 'inserted_at', 'data', 'dia', 'day', 'date', 
  'timestamp', 'created', 'updated'
]

// Check if value looks like a date
function looksLikeDate(value: any): boolean {
  if (value == null) return false
  if (typeof value !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{2}\/\d{2}\/\d{4}/.test(value)
}

// Check if value is CRM truthy
function isCRMTruthy(value: any): boolean {
  if (value == null || value === '') return false
  const v = String(value).toLowerCase().trim()
  return ['1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x'].includes(v)
}

// Check if value is CRM falsy (but defined)
function isCRMFalsy(value: any): boolean {
  if (value === null || value === undefined) return false
  const v = String(value).toLowerCase().trim()
  return ['0', 'false', 'nao', 'não', 'n', 'no', ''].includes(v)
}

interface ColumnProfile {
  name: string
  db_type: string
  semantic_type: string | null
  display_label: string
  role_hint: string | null
  stats: {
    null_rate: number
    distinct_count: number
    min?: number | string
    max?: number | string
    avg?: number
    date_parseable_rate?: number
    boolean_rate?: number
    sample_values?: any[]
  }
}

interface DetectedCandidates {
  time_columns: { name: string; confidence: number; parseable_rate: number }[]
  id_columns: string[]
  dimension_columns: string[]
  funnel_stages: { name: string; label: string; order: number }[]
  metric_columns: string[]
  currency_columns: string[]
  percent_columns: string[]
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

    // Fetch existing columns from dataset_columns
    const { data: columnsData } = await adminClient
      .from('dataset_columns')
      .select('*')
      .eq('dataset_id', dataset_id)
      .order('sort_priority')

    const existingColumns = columnsData || []

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

    // Fetch sample data from remote source
    const objectName = dataset.object_name
    const schemaName = dataset.schema_name || 'public'
    
    const sampleUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*&limit=${sample_limit}`
    
    console.log(`Fetching sample from ${objectName}, limit ${sample_limit}`)
    
    const sampleResponse = await fetch(sampleUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Prefer': 'count=exact'
      }
    })

    if (!sampleResponse.ok) {
      const errorText = await sampleResponse.text()
      return errorResponse('FETCH_ERROR', 'Erro ao buscar dados', errorText)
    }

    const sampleRows = await sampleResponse.json()
    const totalCount = parseInt(sampleResponse.headers.get('content-range')?.split('/')[1] || '0')

    if (!Array.isArray(sampleRows) || sampleRows.length === 0) {
      return errorResponse('NO_DATA', 'Nenhum dado encontrado na view/tabela')
    }

    console.log(`Got ${sampleRows.length} sample rows, total count: ${totalCount}`)

    // Build column profiles
    const columnProfiles: ColumnProfile[] = []
    const detectedCandidates: DetectedCandidates = {
      time_columns: [],
      id_columns: [],
      dimension_columns: [],
      funnel_stages: [],
      metric_columns: [],
      currency_columns: [],
      percent_columns: []
    }

    // P0 HOTFIX: Robust column extraction
    let sampleColumnNames: string[] = []
    const firstRow = sampleRows[0]
    
    if (typeof firstRow === 'string') {
      // Row might be stringified JSON
      try {
        const parsed = JSON.parse(firstRow)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          sampleColumnNames = Object.keys(parsed)
          console.log('P0: Parsed stringified JSON row')
        }
      } catch {
        console.warn('P0: First row is string but not valid JSON')
      }
    } else if (Array.isArray(firstRow)) {
      // CSV-like
      const looksLikeHeaders = firstRow.every((v: any) => typeof v === 'string' && !/^\d+$/.test(String(v)))
      if (looksLikeHeaders) {
        sampleColumnNames = firstRow.map((v: any) => String(v))
      } else {
        sampleColumnNames = firstRow.map((_: any, i: number) => `col_${i}`)
      }
    } else if (typeof firstRow === 'object' && firstRow !== null) {
      // Normal object row - get union of keys from first 20 rows
      const allKeys = new Set<string>()
      for (let i = 0; i < Math.min(sampleRows.length, 20); i++) {
        const row = sampleRows[i]
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          Object.keys(row).forEach(k => allKeys.add(String(k)))
        }
      }
      sampleColumnNames = Array.from(allKeys)
    }
    
    // P0: Fallback if still no columns
    if (sampleColumnNames.length === 0) {
      console.error('P0 CRITICAL: No columns detected from rows!', {
        firstRowType: typeof firstRow,
        rowsCount: sampleRows.length
      })
      return errorResponse('NO_COLUMNS', 'Nenhuma coluna detectada no dataset')
    }
    
    console.log(`P0: Detected ${sampleColumnNames.length} columns: ${sampleColumnNames.slice(0, 5).join(', ')}...`)

    for (const colName of sampleColumnNames) {
      const values = sampleRows.map(row => row[colName])
      const nonNull = values.filter(v => v !== null && v !== undefined)
      const nullRate = values.length > 0 ? (values.length - nonNull.length) / values.length : 0
      const distinctValues = [...new Set(nonNull.map(v => JSON.stringify(v)))]
      
      // Find existing column metadata
      const existingCol = existingColumns.find(c => c.column_name === colName)
      
      // Detect db_type from values
      let dbType = existingCol?.db_type || 'text'
      const firstVal = nonNull[0]
      if (typeof firstVal === 'number') {
        dbType = Number.isInteger(firstVal) ? 'integer' : 'numeric'
      } else if (typeof firstVal === 'boolean') {
        dbType = 'boolean'
      }

      // Calculate stats
      const stats: ColumnProfile['stats'] = {
        null_rate: nullRate,
        distinct_count: distinctValues.length
      }

      // Numeric stats
      if (['integer', 'numeric', 'bigint', 'float', 'double', 'real'].includes(dbType)) {
        const nums = nonNull.filter(v => typeof v === 'number' && isFinite(v))
        if (nums.length > 0) {
          stats.min = Math.min(...nums)
          stats.max = Math.max(...nums)
          stats.avg = nums.reduce((a, b) => a + b, 0) / nums.length
        }
      }

      // Date parseable rate
      const dateParseable = nonNull.filter(v => looksLikeDate(v)).length
      if (dateParseable > 0) {
        stats.date_parseable_rate = dateParseable / nonNull.length
      }

      // Boolean rate (CRM truthy/falsy)
      const booleanLike = nonNull.filter(v => isCRMTruthy(v) || isCRMFalsy(v)).length
      if (booleanLike > 0) {
        stats.boolean_rate = booleanLike / nonNull.length
      }

      // Sample values for low-cardinality
      if (distinctValues.length <= 20 && nonNull.length > 0) {
        stats.sample_values = [...new Set(nonNull)].slice(0, 10)
      }

      // Detect semantic type
      const lowerName = colName.toLowerCase()
      let semanticType: string | null = existingCol?.semantic_type || null
      let roleHint: string | null = existingCol?.role_hint || null
      
      // Time column detection
      const isTimeByName = TIME_ALIASES.some(t => lowerName === t || lowerName.includes('created') || lowerName.includes('updated'))
      const isTimeByValue = (stats.date_parseable_rate || 0) > 0.7
      
      if (isTimeByName || isTimeByValue) {
        semanticType = 'time'
        roleHint = 'x_axis'
        detectedCandidates.time_columns.push({
          name: colName,
          confidence: isTimeByName && isTimeByValue ? 1.0 : isTimeByValue ? 0.8 : 0.6,
          parseable_rate: stats.date_parseable_rate || 0
        })
      }

      // CRM funnel stage detection
      const funnelIdx = CRM_FUNNEL_STAGES.findIndex(s => lowerName === s || lowerName.includes(s))
      if (funnelIdx >= 0 || (stats.boolean_rate && stats.boolean_rate > 0.8)) {
        semanticType = 'count'
        roleHint = 'stage'
        if (funnelIdx >= 0) {
          detectedCandidates.funnel_stages.push({
            name: colName,
            label: existingCol?.display_label || generateLabel(colName),
            order: funnelIdx
          })
        }
      }

      // Currency detection
      if (lowerName.includes('custo') || lowerName.includes('valor') || lowerName.includes('spend') || 
          lowerName.includes('invest') || lowerName === 'cpl' || lowerName === 'cac') {
        semanticType = 'currency'
        roleHint = 'y_axis'
        detectedCandidates.currency_columns.push(colName)
      }

      // Percent detection
      if (lowerName.startsWith('taxa_') || lowerName.includes('rate') || lowerName.includes('conv_')) {
        semanticType = 'percent'
        roleHint = 'y_axis'
        detectedCandidates.percent_columns.push(colName)
      }

      // Count/metric columns
      if (lowerName.endsWith('_total') || lowerName.includes('leads') || lowerName.includes('count') ||
          lowerName.includes('sales') || lowerName.includes('meetings')) {
        semanticType = 'count'
        roleHint = 'y_axis'
        detectedCandidates.metric_columns.push(colName)
      }

      // ID columns
      if (lowerName === 'id' || lowerName.endsWith('_id') || lowerName === 'uuid') {
        semanticType = 'id'
        detectedCandidates.id_columns.push(colName)
      }

      // Dimension columns (text with low cardinality)
      if (dbType === 'text' && distinctValues.length <= 50 && !semanticType) {
        semanticType = 'dimension'
        roleHint = 'series'
        detectedCandidates.dimension_columns.push(colName)
      }

      columnProfiles.push({
        name: colName,
        db_type: dbType,
        semantic_type: semanticType,
        display_label: existingCol?.display_label || generateLabel(colName),
        role_hint: roleHint,
        stats
      })
    }

    // Sort funnel stages by order
    detectedCandidates.funnel_stages.sort((a, b) => a.order - b.order)

    // Sort time columns by confidence
    detectedCandidates.time_columns.sort((a, b) => b.confidence - a.confidence)

    // Build basic stats summary
    const basicStats = {
      total_rows: totalCount,
      sample_rows: sampleRows.length,
      column_count: columnProfiles.length,
      has_time_column: detectedCandidates.time_columns.length > 0,
      has_funnel: detectedCandidates.funnel_stages.length >= 2,
      funnel_step_count: detectedCandidates.funnel_stages.length,
      metric_count: detectedCandidates.metric_columns.length + detectedCandidates.currency_columns.length
    }

    return successResponse({
      dataset: {
        id: dataset.id,
        name: dataset.name,
        object_name: dataset.object_name
      },
      columns: columnProfiles,
      sample_rows: sampleRows.slice(0, 50), // Limit to 50 for response size
      basic_stats: basicStats,
      detected_candidates: detectedCandidates
    })

  } catch (error: any) {
    console.error('Error in dataset-profile:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message)
  }
})

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
    dia: 'Data',
    day: 'Data',
    spend: 'Investimento',
    sales: 'Vendas',
    leads_new: 'Novos Leads',
    meetings_scheduled: 'Reuniões Agendadas',
    meetings_completed: 'Reuniões Realizadas',
    cpl: 'CPL',
    cac: 'CAC'
  }

  if (labelMap[name.toLowerCase()]) {
    return labelMap[name.toLowerCase()]
  }

  return name
    .replace(/_total$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
