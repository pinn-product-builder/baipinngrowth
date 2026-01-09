// Dataset Distinct Values - Edge Function for populating filters
// Returns distinct values for a given column, with search and lazy loading for high-cardinality columns
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

    const body = await req.json()
    const { 
      dashboard_id,
      dataset_id,
      column,
      search = '',
      limit = 100,
      include_count = false
    } = body

    if (!column) {
      return errorResponse('MISSING_PARAM', 'column é obrigatório')
    }

    // Get data source info
    let dataSourceId: string | null = null
    let objectName: string | null = null
    let tenantId: string | null = null

    if (dashboard_id) {
      const { data: dashboard, error: dashError } = await adminClient
        .from('dashboards')
        .select('data_source_id, view_name, tenant_id')
        .eq('id', dashboard_id)
        .single()

      if (dashError || !dashboard) {
        return errorResponse('NOT_FOUND', 'Dashboard não encontrado')
      }

      dataSourceId = dashboard.data_source_id
      objectName = dashboard.view_name
      tenantId = dashboard.tenant_id
    } else if (dataset_id) {
      const { data: dataset, error: dsError } = await adminClient
        .from('datasets')
        .select('datasource_id, object_name, tenant_id')
        .eq('id', dataset_id)
        .single()

      if (dsError || !dataset) {
        return errorResponse('NOT_FOUND', 'Dataset não encontrado')
      }

      dataSourceId = dataset.datasource_id
      objectName = dataset.object_name
      tenantId = dataset.tenant_id
    } else {
      return errorResponse('MISSING_PARAM', 'dashboard_id ou dataset_id é obrigatório')
    }

    // Check tenant access
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (profile?.tenant_id !== tenantId) {
      const { data: roleData } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
      
      if (!roleData || roleData.length === 0) {
        return errorResponse('ACCESS_DENIED', 'Acesso negado')
      }
    }

    // Get data source
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('project_url, anon_key_encrypted, service_role_key_encrypted')
      .eq('id', dataSourceId)
      .single()

    if (dsError || !dataSource) {
      return errorResponse('NOT_FOUND', 'Data source não encontrado')
    }

    // Decrypt API key
    let apiKey: string | null = null

    if (dataSource.service_role_key_encrypted) {
      try { apiKey = await decrypt(dataSource.service_role_key_encrypted) } catch (e) {}
    }

    if (!apiKey && dataSource.anon_key_encrypted) {
      try { apiKey = await decrypt(dataSource.anon_key_encrypted) } catch (e) {}
    }

    if (!apiKey) {
      // Fallback for Afonsina
      const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
      const afonsinaKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
      if (afonsinaUrl && dataSource.project_url === afonsinaUrl && afonsinaKey) {
        apiKey = afonsinaKey
      }
    }

    if (!apiKey) {
      return errorResponse('NO_CREDENTIALS', 'Credenciais do datasource não configuradas')
    }

    // Build query URL - select only the column we need
    let url = `${dataSource.project_url}/rest/v1/${objectName}?select=${encodeURIComponent(column)}`
    
    // Add search filter if provided
    if (search.trim()) {
      url += `&${column}=ilike.*${encodeURIComponent(search.trim())}*`
    }
    
    // Add ordering and limit
    url += `&order=${column}.asc`
    url += `&limit=10000` // Fetch more to get accurate distinct values

    const response = await fetch(url, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      return errorResponse('FETCH_ERROR', `Erro ao consultar dados: ${response.status}`, errorText)
    }

    const rows = await response.json()

    // Extract distinct values
    const valueCounts = new Map<string, number>()
    
    for (const row of rows) {
      const val = row[column]
      if (val !== null && val !== undefined && val !== '') {
        const strVal = String(val).trim()
        if (strVal) {
          valueCounts.set(strVal, (valueCounts.get(strVal) || 0) + 1)
        }
      }
    }

    // Sort by count (most common first) then alphabetically
    const sortedValues = [...valueCounts.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1] // By count desc
        return a[0].localeCompare(b[0]) // Then alphabetically
      })
      .slice(0, limit)

    const values = sortedValues.map(([value, count]) => 
      include_count ? { value, count } : value
    )

    return successResponse({
      column,
      values,
      total_distinct: valueCounts.size,
      has_more: valueCounts.size > limit,
      rows_scanned: rows.length
    })

  } catch (error: any) {
    console.error('Error:', error)
    return errorResponse('INTERNAL_ERROR', error.message || 'Erro interno')
  }
})
