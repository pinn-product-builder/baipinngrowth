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

// Encryption helpers - Google Sheets format (Base64 key)
async function getEncryptionKeyGoogleFormat(): Promise<CryptoKey> {
  const keyB64 = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!keyB64) throw new Error('MASTER_ENCRYPTION_KEY not configured')
  const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
}

// Encryption helpers - Supabase datasource format (raw text padded)
async function getEncryptionKeySupabaseFormat(): Promise<CryptoKey> {
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

async function decryptGoogleFormat(ciphertext: string): Promise<string> {
  const key = await getEncryptionKeyGoogleFormat()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

async function decryptSupabaseFormat(ciphertext: string): Promise<string> {
  const key = await getEncryptionKeySupabaseFormat()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

interface ColumnInfo {
  name: string
  db_type: string
  semantic_type: string | null
  role_hint: string | null
  aggregator_default: string
  format: string | null
  display_label: string
  is_nullable: boolean
}

interface ColumnStats {
  null_count: number
  null_rate: number
  distinct_count: number
  min?: number | string
  max?: number | string
  avg?: number
  sample_values?: any[]
}

// CRM funnel stages - these are boolean/text columns that should be treated as countable
const CRM_FUNNEL_COLUMNS = new Set([
  'entrada', 'lead_ativo', 'qualificado', 'exp_agendada', 'exp_realizada',
  'exp_nao_confirmada', 'faltou_exp', 'reagendou', 'venda', 'perdida', 'aluno_ativo',
  'entrou', 'lead_entrada', 'fechou', 'ganho', 'qualificacao', 'lead_qualificado'
])

// Time column aliases
const TIME_COLUMN_ALIASES = new Set([
  'created_at', 'updated_at', 'inserted_at', 'data', 'dia', 'day', 'date', 'timestamp', 'created', 'updated'
])

// Check if a string value looks like a date
function looksLikeDate(value: any): boolean {
  if (typeof value !== 'string') return false
  // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss or dd/MM/yyyy
  return /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{2}\/\d{2}\/\d{4}/.test(value)
}

// Check if value looks like a CRM truthy value (sim, 1, true, x, etc.)
function isCRMTruthyValue(value: any): boolean {
  if (value === null || value === undefined || value === '') return false
  const v = String(value).toLowerCase().trim()
  return ['1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x'].includes(v)
}

// Semantic type detection based on column name and value patterns
function detectSemanticType(name: string, dbType: string, sampleValues: any[]): {
  semantic_type: string | null
  role_hint: string | null
  aggregator_default: string
  format: string | null
} {
  const lowerName = name.toLowerCase()
  
  // CRM funnel columns - detect by name (even if type is text)
  if (CRM_FUNNEL_COLUMNS.has(lowerName)) {
    return { semantic_type: 'count', role_hint: 'stage', aggregator_default: 'sum', format: 'integer' }
  }
  
  // Time columns by name pattern - check sample values to confirm
  if (TIME_COLUMN_ALIASES.has(lowerName) || ['dia', 'day', 'date', 'data'].some(t => lowerName === t) || 
      lowerName.includes('created') || lowerName.includes('updated') || lowerName.includes('timestamp')) {
    // Check if sample values look like dates (even if db_type is text)
    const nonNull = sampleValues.filter(v => v != null)
    const dateCount = nonNull.filter(v => looksLikeDate(v)).length
    const dateRate = nonNull.length > 0 ? dateCount / nonNull.length : 0
    if (dateRate > 0.5) {
      return { semantic_type: 'time', role_hint: 'x_axis', aggregator_default: 'none', format: 'date' }
    }
  }
  
  // Time columns - standard patterns
  if (['dia', 'day', 'date', 'data', 'created_at', 'updated_at', 'timestamp'].some(t => lowerName === t || lowerName.includes(t))) {
    return { semantic_type: 'time', role_hint: 'x_axis', aggregator_default: 'none', format: 'date' }
  }
  
  // Currency columns - includes v3 'spend' field
  if (lowerName.includes('custo') || lowerName.includes('valor') || lowerName.includes('receita') || 
      lowerName.includes('invest') || lowerName.includes('fatur') || lowerName.includes('spent') ||
      lowerName === 'spend' || lowerName === 'cpl' || lowerName === 'cac' || lowerName.startsWith('custo_por_')) {
    return { semantic_type: 'currency', role_hint: 'y_axis', aggregator_default: 'sum', format: 'brl' }
  }
  
  // Percentage columns - includes v3 rate fields
  if (lowerName.startsWith('taxa_') || lowerName.includes('rate') || lowerName.includes('percent') || 
      lowerName.includes('%') || lowerName.startsWith('conv_') || lowerName.includes('_rate')) {
    return { semantic_type: 'percent', role_hint: 'y_axis', aggregator_default: 'avg', format: 'percent' }
  }
  
  // Count/funnel columns - includes v3 fields
  if (lowerName.endsWith('_total') || lowerName.includes('count') || lowerName.includes('qtd') || 
      lowerName.includes('quantidade') || lowerName.includes('leads') || lowerName.includes('meetings') ||
      lowerName.includes('sales') || lowerName.includes('entrada') || lowerName.includes('reuniao') ||
      lowerName.includes('venda') || lowerName.includes('msg_') || lowerName === 'impressions' ||
      lowerName === 'clicks' || lowerName === 'reach') {
    return { semantic_type: 'count', role_hint: 'y_axis', aggregator_default: 'sum', format: 'integer' }
  }
  
  // Check if text column is actually a CRM boolean (values like 1/0, sim/não, true/false)
  if (dbType === 'text' || dbType === 'varchar') {
    const nonNull = sampleValues.filter(v => v != null)
    const truthyCount = nonNull.filter(v => isCRMTruthyValue(v)).length
    const falsyValues = ['0', 'false', 'nao', 'não', 'n', 'no', '']
    const falsyCount = nonNull.filter(v => falsyValues.includes(String(v).toLowerCase().trim())).length
    // If most values are truthy or falsy boolean-like values, treat as count
    if (nonNull.length > 0 && (truthyCount + falsyCount) / nonNull.length > 0.8) {
      return { semantic_type: 'count', role_hint: 'stage', aggregator_default: 'sum', format: 'integer' }
    }
  }
  
  // ID columns
  if (lowerName === 'id' || lowerName.endsWith('_id') || lowerName === 'uuid') {
    return { semantic_type: 'id', role_hint: null, aggregator_default: 'count_distinct', format: null }
  }
  
  // Boolean columns
  if (dbType === 'boolean') {
    return { semantic_type: 'boolean', role_hint: null, aggregator_default: 'none', format: null }
  }
  
  // Dimension columns (text that's not ID)
  if (dbType === 'text' || dbType === 'varchar') {
    return { semantic_type: 'dimension', role_hint: 'series', aggregator_default: 'none', format: null }
  }
  
  // Generic metric (numeric without specific pattern)
  if (['integer', 'numeric', 'bigint', 'float', 'double', 'real'].includes(dbType)) {
    return { semantic_type: 'metric', role_hint: 'y_axis', aggregator_default: 'sum', format: 'float' }
  }
  
  return { semantic_type: 'text', role_hint: null, aggregator_default: 'none', format: null }
}

// Generate human-readable label from column name
function generateDisplayLabel(name: string): string {
  const labelMap: Record<string, string> = {
    // Legacy fields
    custo_total: 'Investimento',
    leads_total: 'Leads',
    entrada_total: 'Entradas',
    reuniao_agendada_total: 'Reuniões Agendadas',
    reuniao_realizada_total: 'Reuniões Realizadas',
    venda_total: 'Vendas',
    cpl: 'CPL',
    cac: 'CAC',
    falta_total: 'Faltas',
    desmarque_total: 'Desmarques',
    dia: 'Data',
    // V3 fields
    day: 'Data',
    spend: 'Investimento',
    leads_new: 'Novos Leads',
    meetings_scheduled: 'Reuniões Agendadas',
    meetings_completed: 'Reuniões Realizadas',
    meetings_no_show: 'No-Show',
    sales: 'Vendas',
    msg_in: 'Mensagens Recebidas',
    msg_out: 'Mensagens Enviadas',
    impressions: 'Impressões',
    clicks: 'Cliques',
    reach: 'Alcance',
    ctr: 'CTR',
    cpc: 'CPC',
    cpm: 'CPM',
    conv_rate_lead: 'Taxa Conv. Lead',
    conv_rate_meeting: 'Taxa Conv. Reunião',
    conv_rate_sale: 'Taxa Conv. Venda',
  }
  
  if (labelMap[name.toLowerCase()]) {
    return labelMap[name.toLowerCase()]
  }
  
  // Transform snake_case to Title Case
  let label = name
    .replace(/_total$/, '')
    .replace(/_new$/, ' Novos')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  
  // Handle specific prefixes
  if (label.toLowerCase().startsWith('taxa ')) {
    label = 'Taxa de ' + label.slice(5)
  }
  if (label.toLowerCase().startsWith('custo por ')) {
    label = 'Custo por ' + label.slice(10).charAt(0).toUpperCase() + label.slice(11)
  }
  if (label.toLowerCase().startsWith('conv ')) {
    label = 'Conv. ' + label.slice(5)
  }
  
  return label
}

// Detect primary time column
function detectPrimaryTimeColumn(columns: ColumnInfo[]): string | null {
  const timeColumns = columns.filter(c => c.semantic_type === 'time')
  if (timeColumns.length === 0) return null
  
  const preferred = ['dia', 'day', 'date', 'data']
  for (const pref of preferred) {
    const match = timeColumns.find(c => c.name.toLowerCase() === pref)
    if (match) return match.name
  }
  
  return timeColumns[0].name
}

// Detect grain hint from data
function detectGrainHint(sampleData: any[], timeColumn: string | null): string {
  if (!timeColumn || sampleData.length < 2) return 'day'
  
  const dates = sampleData
    .map(row => row[timeColumn])
    .filter(d => d)
    .map(d => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime())
  
  if (dates.length < 2) return 'day'
  
  const diffDays = (dates[1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24)
  
  if (diffDays >= 28 && diffDays <= 31) return 'month'
  if (diffDays >= 6 && diffDays <= 8) return 'week'
  return 'day'
}

// Calculate column statistics
function calculateColumnStats(sampleData: any[], column: string, dbType: string): ColumnStats {
  const values = sampleData.map(row => row[column])
  const nonNullValues = values.filter(v => v !== null && v !== undefined)
  
  const stats: ColumnStats = {
    null_count: values.length - nonNullValues.length,
    null_rate: values.length > 0 ? (values.length - nonNullValues.length) / values.length : 0,
    distinct_count: new Set(nonNullValues.map(v => JSON.stringify(v))).size,
  }
  
  // Numeric stats
  if (['integer', 'numeric', 'bigint', 'float', 'double', 'real'].includes(dbType) || typeof nonNullValues[0] === 'number') {
    const numericValues = nonNullValues.filter(v => typeof v === 'number' && isFinite(v))
    if (numericValues.length > 0) {
      stats.min = Math.min(...numericValues)
      stats.max = Math.max(...numericValues)
      stats.avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length
    }
  }
  
  // Sample values for dimensions
  if (stats.distinct_count <= 20 && dbType === 'text') {
    stats.sample_values = [...new Set(nonNullValues)].slice(0, 10)
  }
  
  return stats
}

// Fetch view SQL definition from remote Supabase
async function fetchViewDefinition(
  projectUrl: string, 
  apiKey: string, 
  schemaName: string, 
  objectName: string
): Promise<string | null> {
  try {
    // Use RPC to get view definition (requires pg_get_viewdef permission)
    // We'll query information_schema as fallback
    const restUrl = `${projectUrl}/rest/v1/rpc/pg_get_viewdef`
    
    // First try: direct query via REST (may not work depending on permissions)
    // Fallback: query information_schema.views
    const viewQueryUrl = `${projectUrl}/rest/v1/information_schema.views?table_schema=eq.${schemaName}&table_name=eq.${objectName}&select=view_definition`
    
    const response = await fetch(viewQueryUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data && data[0]?.view_definition) {
        return data[0].view_definition
      }
    }
    
    console.log('Could not fetch view definition from information_schema')
    return null
  } catch (err) {
    console.error('Error fetching view definition:', err)
    return null
  }
}

// Fetch column metadata from information_schema
async function fetchColumnMetadata(
  projectUrl: string,
  apiKey: string,
  schemaName: string,
  objectName: string
): Promise<any[]> {
  try {
    const url = `${projectUrl}/rest/v1/information_schema.columns?table_schema=eq.${schemaName}&table_name=eq.${objectName}&select=column_name,data_type,is_nullable,column_default`
    
    const response = await fetch(url, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    })
    
    if (response.ok) {
      return await response.json()
    }
    
    return []
  } catch (err) {
    console.error('Error fetching column metadata:', err)
    return []
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

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado')
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check role (admin or manager)
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager'])

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado. Requer role admin ou manager.')
    }

    // Parse request
    const body = await req.json()
    const { 
      dataset_id, 
      datasource_id, 
      object_name, 
      schema_name = 'public',
      kind = 'view', 
      save_columns = false,
      include_sql = true,
      include_stats = true 
    } = body

    // If dataset_id provided, fetch existing dataset info
    let dataSourceId = datasource_id
    let objectName = object_name
    let schemaName = schema_name
    let datasetId = dataset_id
    let relationType = kind

    if (dataset_id) {
      const { data: dataset, error: dsError } = await adminClient
        .from('datasets')
        .select('*')
        .eq('id', dataset_id)
        .single()

      if (dsError || !dataset) {
        return errorResponse('NOT_FOUND', 'Dataset não encontrado')
      }

      dataSourceId = dataset.datasource_id
      objectName = dataset.object_name
      schemaName = dataset.schema_name || 'public'
      relationType = dataset.kind
    }

    if (!dataSourceId || !objectName) {
      return errorResponse('VALIDATION_ERROR', 'datasource_id e object_name são obrigatórios')
    }

    // Fetch data source
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('*')
      .eq('id', dataSourceId)
      .single()

    if (dsError || !dataSource) {
      return errorResponse('NOT_FOUND', 'Data source não encontrado')
    }

    // Detect data source type
    const isGoogleSheets = dataSource.type === 'google_sheets' || 
      Boolean(dataSource.google_spreadsheet_id) || 
      Boolean(dataSource.google_access_token_encrypted)

    let sampleData: any[] = []
    let columnMetadata: any[] = []
    let sqlDefinition: string | null = null

    if (isGoogleSheets) {
      // =====================================================
      // GOOGLE SHEETS DATA SOURCE
      // =====================================================
      console.log(`[introspect-dataset] Google Sheets data source detected`)

      let accessToken: string | null = null
      
      if (dataSource.google_access_token_encrypted) {
        try {
          accessToken = await decryptGoogleFormat(dataSource.google_access_token_encrypted)
        } catch (e) {
          console.error('[introspect-dataset] Failed to decrypt access token:', e)
        }
      }

      // Check if token is expired and refresh if needed
      const tokenExpiresAt = dataSource.google_token_expires_at ? new Date(dataSource.google_token_expires_at) : null
      const isExpired = tokenExpiresAt && tokenExpiresAt <= new Date()

      if ((!accessToken || isExpired) && dataSource.google_refresh_token_encrypted) {
        console.log('[introspect-dataset] Refreshing Google access token...')
        try {
          const refreshToken = await decryptGoogleFormat(dataSource.google_refresh_token_encrypted)
          const clientId = dataSource.google_client_id_encrypted 
            ? await decryptGoogleFormat(dataSource.google_client_id_encrypted) 
            : Deno.env.get('GOOGLE_CLIENT_ID')
          const clientSecret = dataSource.google_client_secret_encrypted 
            ? await decryptGoogleFormat(dataSource.google_client_secret_encrypted) 
            : Deno.env.get('GOOGLE_CLIENT_SECRET')

          if (clientId && clientSecret && refreshToken) {
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
              })
            })

            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json()
              accessToken = tokenData.access_token
              console.log('[introspect-dataset] Token refreshed successfully')
            } else {
              console.error('[introspect-dataset] Token refresh failed:', await tokenResponse.text())
            }
          }
        } catch (e) {
          console.error('[introspect-dataset] Error refreshing token:', e)
        }
      }

      if (!accessToken) {
        return errorResponse('NO_CREDENTIALS', 'Credenciais do Google Sheets não configuradas ou expiradas')
      }

      // Fetch from Google Sheets
      const spreadsheetId = dataSource.google_spreadsheet_id
      const sheetName = objectName || dataSource.google_sheet_name || 'Sheet1'
      
      if (!spreadsheetId) {
        return errorResponse('VALIDATION_ERROR', 'Spreadsheet ID não configurado')
      }

      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`
      
      console.log(`[introspect-dataset] Fetching from Google Sheets: ${sheetName}`)
      
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text()
        console.error('[introspect-dataset] Google Sheets API error:', errorText)
        return errorResponse('FETCH_ERROR', 'Erro ao acessar Google Sheets', errorText.slice(0, 200))
      }

      const sheetsData = await sheetsResponse.json()
      const values = sheetsData.values || []

      if (values.length < 2) {
        return successResponse({
          columns: [],
          row_count: 0,
          primary_time_column: null,
          grain_hint: 'day',
          sql_definition: null,
          message: 'Dataset vazio - não há dados para analisar'
        })
      }

      // Convert to objects: first row is headers
      const headers = values[0].map((h: any) => String(h).trim())
      sampleData = values.slice(1, 201).map((row: any[]) => {
        const obj: Record<string, any> = {}
        headers.forEach((header: string, i: number) => {
          obj[header] = row[i] !== undefined ? row[i] : null
        })
        return obj
      })

      console.log(`[introspect-dataset] Got ${sampleData.length} rows from Google Sheets with ${headers.length} columns`)

    } else {
      // =====================================================
      // SUPABASE DATA SOURCE
      // =====================================================
      
      // Get credentials
      let apiKey: string | null = null

      if (dataSource.anon_key_encrypted) {
        try {
          apiKey = await decryptSupabaseFormat(dataSource.anon_key_encrypted)
        } catch (e) {
          console.error('Failed to decrypt anon_key')
        }
      }

      if (!apiKey && dataSource.service_role_key_encrypted) {
        try {
          apiKey = await decryptSupabaseFormat(dataSource.service_role_key_encrypted)
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
        return errorResponse('NO_CREDENTIALS', 'Credenciais não configuradas para este data source')
      }

      console.log(`Introspecting ${relationType} ${schemaName}.${objectName}...`)

      // Fetch view SQL definition (if view and requested)
      if (include_sql && relationType === 'view') {
        sqlDefinition = await fetchViewDefinition(dataSource.project_url, apiKey, schemaName, objectName)
        if (sqlDefinition) {
          console.log('View SQL definition retrieved')
        }
      }

      // Fetch column metadata from information_schema
      columnMetadata = await fetchColumnMetadata(dataSource.project_url, apiKey, schemaName, objectName)
      console.log(`Found ${columnMetadata.length} columns from information_schema`)

      // Fetch sample data (200 rows)
      const restUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*&limit=200`
      
      console.log('Fetching sample data:', restUrl)

      const response = await fetch(restUrl, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Fetch error:', response.status, errorText)
        return errorResponse('FETCH_ERROR', `Erro ao acessar ${objectName}`, errorText.slice(0, 200))
      }

      sampleData = await response.json()
    }

    if (!sampleData || sampleData.length === 0) {
      return successResponse({
        columns: [],
        row_count: 0,
        primary_time_column: null,
        grain_hint: 'day',
        sql_definition: sqlDefinition,
        message: 'Dataset vazio - não há dados para analisar'
      })
    }

    // Analyze columns
    const firstRow = sampleData[0]
    const columnStats: Record<string, ColumnStats> = {}
    
    const columns: ColumnInfo[] = Object.keys(firstRow).map(key => {
      const sampleValues = sampleData.slice(0, 50).map((row: any) => row[key])
      const value = firstRow[key]
      
      // Get type from information_schema if available
      const metaCol = columnMetadata.find((c: any) => c.column_name === key)
      
      // Detect DB type from value or metadata
      let dbType = metaCol?.data_type || 'text'
      if (!metaCol) {
        if (value === null) {
          dbType = 'nullable'
        } else if (typeof value === 'number') {
          dbType = Number.isInteger(value) ? 'integer' : 'numeric'
        } else if (typeof value === 'boolean') {
          dbType = 'boolean'
        } else if (typeof value === 'string') {
          if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            dbType = 'date'
          }
        }
      }

      const semantic = detectSemanticType(key, dbType, sampleValues)
      
      // Calculate stats if requested
      if (include_stats) {
        columnStats[key] = calculateColumnStats(sampleData, key, dbType)
      }
      
      return {
        name: key,
        db_type: dbType,
        semantic_type: semantic.semantic_type,
        role_hint: semantic.role_hint,
        aggregator_default: semantic.aggregator_default,
        format: semantic.format,
        display_label: generateDisplayLabel(key),
        is_nullable: metaCol?.is_nullable === 'YES' || sampleValues.some((v: any) => v === null)
      }
    })

    const primaryTimeColumn = detectPrimaryTimeColumn(columns)
    const grainHint = detectGrainHint(sampleData, primaryTimeColumn)

    // Detect funnel order
    const funnelOrder = columns
      .filter(c => c.semantic_type === 'count')
      .map(c => c.name)

    console.log('Introspection complete:', columns.length, 'columns,', sampleData.length, 'rows')

    // If save_columns is true and we have a dataset_id, save to dataset_columns
    if (save_columns && datasetId) {
      // Delete existing columns
      await adminClient
        .from('dataset_columns')
        .delete()
        .eq('dataset_id', datasetId)

      // Insert new columns
      const columnsToInsert = columns.map((col, index) => ({
        dataset_id: datasetId,
        column_name: col.name,
        db_type: col.db_type,
        semantic_type: col.semantic_type,
        role_hint: col.role_hint,
        aggregator_default: col.aggregator_default,
        format: col.format,
        display_label: col.display_label,
        is_nullable: col.is_nullable,
        sort_priority: index
      }))

      const { error: insertError } = await adminClient
        .from('dataset_columns')
        .insert(columnsToInsert)

      if (insertError) {
        console.error('Error saving columns:', insertError)
      } else {
        // Update dataset with detected info
        await adminClient
          .from('datasets')
          .update({
            primary_time_column: primaryTimeColumn,
            grain_hint: grainHint,
            last_introspected_at: new Date().toISOString()
          })
          .eq('id', datasetId)

        console.log('Saved', columnsToInsert.length, 'columns to dataset')
      }
    }

    // Build response
    const result: Record<string, any> = {
      columns,
      row_count: sampleData.length,
      primary_time_column: primaryTimeColumn,
      grain_hint: grainHint,
      relation_type: relationType,
      sample_row: firstRow
    }

    // Include SQL definition if available
    if (include_sql && sqlDefinition) {
      result.sql_definition = sqlDefinition
    }

    // Include stats if requested
    if (include_stats) {
      result.column_stats = columnStats
      result.sample_rows = sampleData.slice(0, 10) // Limited sample for debug
    }

    // Include detected roles for dashboard generation
    result.detected_roles = {
      time_columns: columns.filter(c => c.semantic_type === 'time').map(c => c.name),
      metric_columns: columns.filter(c => ['currency', 'count', 'metric'].includes(c.semantic_type || '')).map(c => c.name),
      percent_columns: columns.filter(c => c.semantic_type === 'percent').map(c => c.name),
      dimension_columns: columns.filter(c => c.semantic_type === 'dimension').map(c => c.name),
      funnel_candidates: funnelOrder
    }

    return successResponse(result)

  } catch (error: any) {
    console.error('Error in introspect-dataset:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message)
  }
})
