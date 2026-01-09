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

// =====================================================
// ENCRYPTION HELPERS
// =====================================================

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
// TRUTHY PARSER
// =====================================================

const TRUTHY_VALUES = new Set([
  '1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'ativo', 'realizado', 'agendado', 'ganho'
])

function parseTruthy(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  
  const normalized = String(value).toLowerCase().trim()
  if (TRUTHY_VALUES.has(normalized)) return true
  
  // Non-empty string that's not explicitly falsy might still be truthy
  return false
}

// =====================================================
// DATE PARSING
// =====================================================

function parseTextDate(value: any): { date: Date; day: string } | null {
  if (!value) return null
  
  const text = String(value).trim()
  
  // ISO format
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const date = new Date(isoMatch[0])
    if (!isNaN(date.getTime())) {
      return { date, day: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` }
    }
  }
  
  // Brazilian DD/MM/YYYY
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (brMatch) {
    const [_, day, month, year] = brMatch
    const date = new Date(`${year}-${month}-${day}`)
    if (!isNaN(date.getTime())) {
      return { date, day: `${year}-${month}-${day}` }
    }
  }
  
  // Brazilian DD-MM-YYYY
  const brDashMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (brDashMatch) {
    const [_, day, month, year] = brDashMatch
    const date = new Date(`${year}-${month}-${day}`)
    if (!isNaN(date.getTime())) {
      return { date, day: `${year}-${month}-${day}` }
    }
  }
  
  // Native Date parsing
  const date = new Date(text)
  if (!isNaN(date.getTime())) {
    return { date, day: date.toISOString().split('T')[0] }
  }
  
  return null
}

// =====================================================
// CRM PATTERNS
// =====================================================

const CRM_TIME_COLUMNS = ['created_at', 'data', 'dia', 'date', 'data_criacao']

const CRM_FUNNEL_STAGES = [
  { key: 'entrada', label: 'Entradas', order: 1 },
  { key: 'lead_ativo', label: 'Leads Ativos', order: 2 },
  { key: 'qualificado', label: 'Qualificados', order: 3 },
  { key: 'exp_nao_confirmada', label: 'Exp. Não Confirmada', order: 4 },
  { key: 'exp_agendada', label: 'Exp. Agendadas', order: 5 },
  { key: 'faltou_exp', label: 'Faltou Exp.', order: 6 },
  { key: 'reagendou', label: 'Reagendou', order: 7 },
  { key: 'exp_realizada', label: 'Exp. Realizadas', order: 8 },
  { key: 'venda', label: 'Vendas', order: 9 },
  { key: 'perdida', label: 'Perdidas', order: 10 }
]

const CRM_DIMENSIONS = ['unidade', 'vendedora', 'vendedor', 'modalidade', 'origem', 'retencao']

// =====================================================
// COLUMN ANALYSIS
// =====================================================

interface ColumnMapping {
  timeColumn: string | null
  funnelStages: { column: string; key: string; label: string; order: number }[]
  dimensions: string[]
  unitFlags: string[]
}

function analyzeColumns(columnNames: string[]): ColumnMapping {
  const lowerMap = new Map(columnNames.map(c => [c.toLowerCase(), c]))
  
  // Find time column
  let timeColumn: string | null = null
  for (const tc of CRM_TIME_COLUMNS) {
    for (const [lower, original] of lowerMap) {
      if (lower === tc || lower.includes(tc)) {
        timeColumn = original
        break
      }
    }
    if (timeColumn) break
  }
  
  // Find funnel stages
  const funnelStages: ColumnMapping['funnelStages'] = []
  for (const stage of CRM_FUNNEL_STAGES) {
    for (const [lower, original] of lowerMap) {
      if (lower === stage.key || lower.startsWith(stage.key + '_') || lower.endsWith('_' + stage.key)) {
        funnelStages.push({
          column: original,
          key: stage.key,
          label: stage.label,
          order: stage.order
        })
        break
      }
    }
  }
  funnelStages.sort((a, b) => a.order - b.order)
  
  // Find dimensions
  const dimensions: string[] = []
  for (const dim of CRM_DIMENSIONS) {
    for (const [lower, original] of lowerMap) {
      if (lower === dim) {
        dimensions.push(original)
        break
      }
    }
  }
  
  // Find unit flags (unidade_XX_*)
  const unitFlags: string[] = []
  for (const [lower, original] of lowerMap) {
    if (/^unidade_\d{2}_/.test(lower)) {
      unitFlags.push(original)
    }
  }
  
  return { timeColumn, funnelStages, dimensions, unitFlags }
}

// =====================================================
// UNIT RESOLUTION
// =====================================================

function resolveUnit(row: Record<string, any>, unitFlags: string[], fallbackColumn?: string): string | null {
  for (const col of unitFlags.sort()) {
    if (parseTruthy(row[col])) {
      const match = col.match(/^unidade_\d{2}_(.+)$/i)
      if (match) {
        return match[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      }
    }
  }
  
  if (fallbackColumn && row[fallbackColumn]) {
    return String(row[fallbackColumn])
  }
  
  return null
}

// =====================================================
// MAIN HANDLER
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

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado')
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request
    const body = await req.json()
    const {
      datasource_id,
      object_name,
      schema_name = 'public',
      start_date,
      end_date,
      limit = 10000
    } = body

    if (!datasource_id || !object_name) {
      return errorResponse('VALIDATION_ERROR', 'datasource_id e object_name são obrigatórios')
    }

    // Get data source
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('*')
      .eq('id', datasource_id)
      .single()

    if (dsError || !dataSource) {
      return errorResponse('NOT_FOUND', 'Data source não encontrado')
    }

    // Get credentials
    let apiKey: string | null = null
    if (dataSource.anon_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.anon_key_encrypted)
      } catch (e) {
        console.error('Failed to decrypt anon_key')
      }
    }
    if (!apiKey && dataSource.service_role_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.service_role_key_encrypted)
      } catch (e) {
        console.error('Failed to decrypt service_role_key')
      }
    }

    // Fallback to Afonsina keys
    if (!apiKey) {
      const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
      const afonsinaKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
      if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
        apiKey = afonsinaKey || null
      }
    }

    if (!apiKey) {
      return errorResponse('NO_CREDENTIALS', 'Credenciais não configuradas')
    }

    console.log(`Deriving CRM funnel from ${schema_name}.${object_name}...`)

    // Fetch raw data
    let fetchUrl = `${dataSource.project_url}/rest/v1/${object_name}?select=*&limit=${limit}`
    
    const response = await fetch(fetchUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      return errorResponse('FETCH_ERROR', `Erro ao acessar ${object_name}`, errorText.slice(0, 200))
    }

    const rawRows = await response.json()
    
    if (!rawRows || rawRows.length === 0) {
      return successResponse({
        derived_rows: [],
        column_mapping: null,
        stats: { raw_rows: 0, derived_rows: 0, date_format: 'unknown' }
      })
    }

    console.log(`Fetched ${rawRows.length} raw rows`)

    // Analyze columns
    const columnNames = Object.keys(rawRows[0])
    const mapping = analyzeColumns(columnNames)

    if (!mapping.timeColumn) {
      return errorResponse('NO_TIME_COLUMN', 'Não foi possível detectar coluna de data', 
        `Colunas disponíveis: ${columnNames.join(', ')}`)
    }

    const timeColumnName = mapping.timeColumn

    console.log(`Time column: ${timeColumnName}`)
    console.log(`Funnel stages: ${mapping.funnelStages.map(s => s.column).join(', ')}`)
    console.log(`Dimensions: ${mapping.dimensions.join(', ')}`)
    console.log(`Unit flags: ${mapping.unitFlags.length}`)

    // Detect date format
    const dateSamples = rawRows.slice(0, 10).map((r: any) => r[timeColumnName])
    let dateFormat = 'unknown'
    for (const sample of dateSamples) {
      const text = String(sample || '').trim()
      if (/^\d{4}-\d{2}-\d{2}/.test(text)) { dateFormat = 'iso'; break }
      if (/^\d{2}\/\d{2}\/\d{4}/.test(text)) { dateFormat = 'br'; break }
      if (/^\d{2}-\d{2}-\d{4}/.test(text)) { dateFormat = 'br-dash'; break }
    }

    // Group by day
    const dayGroups = new Map<string, Record<string, any>[]>()
    let parseErrors = 0

    for (const row of rawRows) {
      const parsed = parseTextDate(row[timeColumnName])
      if (!parsed) {
        parseErrors++
        continue
      }
      
      // Filter by date range if provided
      if (start_date && parsed.day < start_date) continue
      if (end_date && parsed.day > end_date) continue
      
      if (!dayGroups.has(parsed.day)) {
        dayGroups.set(parsed.day, [])
      }
      dayGroups.get(parsed.day)!.push(row)
    }

    if (parseErrors > 0) {
      console.warn(`Failed to parse ${parseErrors} dates`)
    }

    console.log(`Grouped into ${dayGroups.size} days`)

    // Aggregate by day
    const derivedRows: Record<string, any>[] = []

    for (const [day, dayRows] of dayGroups) {
      const leadsTotal = dayRows.length
      
      // Count each funnel stage
      const stageCounts: Record<string, number> = {}
      for (const stage of mapping.funnelStages) {
        stageCounts[stage.key] = dayRows.filter(r => parseTruthy(r[stage.column])).length
      }
      
      // Safe division helper
      const safeDiv = (a: number, b: number) => b > 0 ? a / b : 0
      
      // Build derived row
      const derived: Record<string, any> = {
        dia: day,
        leads_total: leadsTotal,
        entrada_total: stageCounts['entrada'] || 0,
        lead_ativo_total: stageCounts['lead_ativo'] || 0,
        qualificado_total: stageCounts['qualificado'] || 0,
        exp_nao_confirmada_total: stageCounts['exp_nao_confirmada'] || 0,
        exp_agendada_total: stageCounts['exp_agendada'] || 0,
        faltou_exp_total: stageCounts['faltou_exp'] || 0,
        reagendou_total: stageCounts['reagendou'] || 0,
        exp_realizada_total: stageCounts['exp_realizada'] || 0,
        venda_total: stageCounts['venda'] || 0,
        perdida_total: stageCounts['perdida'] || 0,
      }
      
      // Calculate rates
      derived.taxa_entrada = safeDiv(derived.entrada_total, leadsTotal)
      derived.taxa_qualificado = safeDiv(derived.qualificado_total, leadsTotal)
      derived.taxa_agendada = safeDiv(derived.exp_agendada_total, leadsTotal)
      derived.taxa_comparecimento = safeDiv(derived.exp_realizada_total, derived.exp_agendada_total)
      derived.taxa_venda = safeDiv(derived.venda_total, derived.exp_realizada_total)
      derived.taxa_perda = safeDiv(derived.perdida_total, leadsTotal)
      derived.taxa_venda_total = safeDiv(derived.venda_total, leadsTotal)
      
      derivedRows.push(derived)
    }

    // Sort by date
    derivedRows.sort((a, b) => a.dia.localeCompare(b.dia))

    console.log(`Generated ${derivedRows.length} derived rows`)

    // Build dimension breakdowns (aggregated totals per dimension value)
    const dimensionBreakdowns: Record<string, Record<string, Record<string, number>>> = {}

    for (const dim of mapping.dimensions) {
      const breakdown: Record<string, Record<string, number>> = {}
      
      for (const row of rawRows) {
        let dimValue = row[dim] || 'N/A'
        
        // Resolve unit from flags if this is the unidade dimension
        if (dim === 'unidade' && mapping.unitFlags.length > 0) {
          const resolved = resolveUnit(row, mapping.unitFlags, dim)
          if (resolved) dimValue = resolved
        }
        
        dimValue = String(dimValue).trim() || 'N/A'
        
        if (!breakdown[dimValue]) {
          breakdown[dimValue] = { count: 0 }
          for (const stage of mapping.funnelStages) {
            breakdown[dimValue][stage.key] = 0
          }
        }
        
        breakdown[dimValue].count++
        for (const stage of mapping.funnelStages) {
          if (parseTruthy(row[stage.column])) {
            breakdown[dimValue][stage.key]++
          }
        }
      }
      
      dimensionBreakdowns[dim] = breakdown
    }

    return successResponse({
      derived_rows: derivedRows,
      column_mapping: {
        time_column: mapping.timeColumn,
        funnel_stages: mapping.funnelStages,
        dimensions: mapping.dimensions,
        unit_flags: mapping.unitFlags.length
      },
      dimension_breakdowns: dimensionBreakdowns,
      stats: {
        raw_rows: rawRows.length,
        derived_rows: derivedRows.length,
        days: dayGroups.size,
        date_format: dateFormat,
        parse_errors: parseErrors,
        funnel_stages_found: mapping.funnelStages.length,
        dimensions_found: mapping.dimensions.length
      }
    })

  } catch (error: any) {
    console.error('Error in derive-crm-funnel:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message)
  }
})
