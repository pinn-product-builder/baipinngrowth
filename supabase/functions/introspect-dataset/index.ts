import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// Semantic type detection based on column name and value patterns
function detectSemanticType(name: string, dbType: string, sampleValues: any[]): {
  semantic_type: string | null
  role_hint: string | null
  aggregator_default: string
  format: string | null
} {
  const lowerName = name.toLowerCase()
  
  // Time columns
  if (['dia', 'date', 'data', 'created_at', 'updated_at', 'timestamp'].some(t => lowerName.includes(t))) {
    return { semantic_type: 'time', role_hint: 'x_axis', aggregator_default: 'none', format: 'date' }
  }
  
  // Currency columns
  if (lowerName.includes('custo') || lowerName.includes('valor') || lowerName.includes('receita') || 
      lowerName.includes('invest') || lowerName.includes('fatur') || lowerName.includes('spent') ||
      lowerName === 'cpl' || lowerName === 'cac' || lowerName.startsWith('custo_por_')) {
    return { semantic_type: 'currency', role_hint: 'y_axis', aggregator_default: 'sum', format: 'brl' }
  }
  
  // Percentage columns
  if (lowerName.startsWith('taxa_') || lowerName.includes('rate') || lowerName.includes('percent') || lowerName.includes('%')) {
    return { semantic_type: 'percent', role_hint: 'y_axis', aggregator_default: 'avg', format: 'percent' }
  }
  
  // Count columns
  if (lowerName.endsWith('_total') || lowerName.includes('count') || lowerName.includes('qtd') || lowerName.includes('quantidade')) {
    return { semantic_type: 'count', role_hint: 'y_axis', aggregator_default: 'sum', format: 'integer' }
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
  // Known mappings
  const labelMap: Record<string, string> = {
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
  }
  
  if (labelMap[name.toLowerCase()]) {
    return labelMap[name.toLowerCase()]
  }
  
  // Transform snake_case to Title Case
  let label = name
    .replace(/_total$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  
  // Handle specific prefixes
  if (label.toLowerCase().startsWith('taxa ')) {
    label = 'Taxa de ' + label.slice(5)
  }
  if (label.toLowerCase().startsWith('custo por ')) {
    label = 'Custo por ' + label.slice(10).charAt(0).toUpperCase() + label.slice(11)
  }
  
  return label
}

// Detect primary time column
function detectPrimaryTimeColumn(columns: ColumnInfo[]): string | null {
  const timeColumns = columns.filter(c => c.semantic_type === 'time')
  if (timeColumns.length === 0) return null
  
  // Prefer 'dia', 'date', 'data' over 'created_at', 'updated_at'
  const preferred = ['dia', 'date', 'data']
  for (const pref of preferred) {
    const match = timeColumns.find(c => c.name.toLowerCase() === pref)
    if (match) return match.name
  }
  
  return timeColumns[0].name
}

// Detect grain hint from data
function detectGrainHint(sampleData: any[], timeColumn: string | null): string {
  if (!timeColumn || sampleData.length < 2) return 'day'
  
  // Try to detect if data is daily, weekly, or monthly
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
    const { dataset_id, datasource_id, object_name, kind = 'view', save_columns = false } = body

    // If dataset_id provided, fetch existing dataset info
    let dataSourceId = datasource_id
    let objectName = object_name
    let datasetId = dataset_id

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
      return errorResponse('NO_CREDENTIALS', 'Credenciais não configuradas para este data source')
    }

    // Fetch sample data (200 rows)
    const restUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*&limit=200`
    
    console.log('Introspecting dataset:', restUrl)

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

    const sampleData = await response.json()

    if (!sampleData || sampleData.length === 0) {
      return successResponse({
        columns: [],
        row_count: 0,
        primary_time_column: null,
        grain_hint: 'day',
        message: 'Dataset vazio - não há dados para analisar'
      })
    }

    // Analyze columns
    const firstRow = sampleData[0]
    const columns: ColumnInfo[] = Object.keys(firstRow).map(key => {
      const sampleValues = sampleData.slice(0, 50).map((row: any) => row[key])
      const value = firstRow[key]
      
      // Detect DB type from value
      let dbType = 'text'
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

      const semantic = detectSemanticType(key, dbType, sampleValues)
      
      return {
        name: key,
        db_type: dbType,
        semantic_type: semantic.semantic_type,
        role_hint: semantic.role_hint,
        aggregator_default: semantic.aggregator_default,
        format: semantic.format,
        display_label: generateDisplayLabel(key),
        is_nullable: sampleValues.some((v: any) => v === null)
      }
    })

    const primaryTimeColumn = detectPrimaryTimeColumn(columns)
    const grainHint = detectGrainHint(sampleData, primaryTimeColumn)

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

    return successResponse({
      columns,
      row_count: sampleData.length,
      primary_time_column: primaryTimeColumn,
      grain_hint: grainHint,
      sample_row: firstRow
    })

  } catch (error: any) {
    console.error('Error in introspect-dataset:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message)
  }
})
