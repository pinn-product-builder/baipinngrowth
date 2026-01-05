import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ALWAYS return 200 with structured JSON to avoid generic "non-2xx" errors
function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200, // Always 200 - error info goes in the body
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(code: string, message: string, details?: string, suggestion?: string) {
  console.error(`[ERROR] ${code}: ${message}`, details || '')
  return jsonResponse({
    ok: false,
    error: { 
      code, 
      message, 
      details: details?.slice(0, 500),
      suggestion 
    }
  })
}

function successResponse(data: Record<string, unknown>) {
  return jsonResponse({ ok: true, ...data })
}

// Encryption helpers
async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY not configured')
  }
  
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  return keyMaterial
}

async function decrypt(ciphertext: string): Promise<string> {
  try {
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
  } catch (e) {
    console.error('Decryption failed:', e)
    throw new Error('DECRYPT_FAILED')
  }
}

// Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(id)
    return response
  } catch (error: unknown) {
    clearTimeout(id)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('TIMEOUT: A requisição demorou mais de 15 segundos')
    }
    throw error
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido')
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return errorResponse('CONFIG_ERROR', 'Configuração do servidor incompleta')
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.log('Auth failed:', userError?.message)
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado', userError?.message)
    }

    // Check user is admin OR belongs to the tenant
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    const { data: adminRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    const isAdmin = !!adminRole
    const userTenantId = profile?.tenant_id

    // Parse request body
    let body: {
      data_source_id?: string
      tenant_id?: string
      view_name?: string
      schema?: string
      start?: string
      end?: string
      limit?: number
      date_column?: string
    }
    
    try {
      body = await req.json()
    } catch {
      return errorResponse('INVALID_JSON', 'Corpo da requisição inválido')
    }

    const { 
      data_source_id, 
      tenant_id,
      view_name, 
      schema = 'public', 
      start, 
      end, 
      limit = 500,
      date_column = 'dia'
    } = body

    if (!data_source_id) {
      return errorResponse('VALIDATION_ERROR', 'data_source_id é obrigatório')
    }

    if (!view_name) {
      return errorResponse('VALIDATION_ERROR', 'view_name é obrigatório')
    }

    // Fetch data source
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('*')
      .eq('id', data_source_id)
      .maybeSingle()

    if (dsError) {
      console.error('Data source fetch error:', dsError)
      return errorResponse('DB_ERROR', 'Erro ao buscar data source', dsError.message)
    }

    if (!dataSource) {
      return errorResponse('NOT_FOUND', 'Data source não encontrado')
    }

    // Check access: user must be admin OR belong to the tenant
    if (!isAdmin && userTenantId !== dataSource.tenant_id) {
      return errorResponse('FORBIDDEN', 'Acesso negado a este data source')
    }

    // Check view is allowed
    if (!dataSource.allowed_views?.includes(view_name)) {
      return errorResponse(
        'VIEW_NOT_ALLOWED', 
        `View "${view_name}" não está na lista de views permitidas`,
        `Views permitidas: ${dataSource.allowed_views?.join(', ') || 'nenhuma'}`,
        'Adicione a view à lista de allowed_views do data source.'
      )
    }

    // Check data source type
    if (dataSource.type === 'proxy_webhook') {
      return errorResponse(
        'WRONG_TYPE', 
        'Este data source é do tipo proxy_webhook',
        'Use o endpoint direto do proxy para consultas.',
        'Mude para um data source do tipo "supabase" ou use o proxy.'
      )
    }

    // Check MASTER_ENCRYPTION_KEY
    if (!Deno.env.get('MASTER_ENCRYPTION_KEY')) {
      console.error('MASTER_ENCRYPTION_KEY not set')
      return errorResponse(
        'CONFIG_ERROR', 
        'Chave de criptografia não configurada',
        undefined,
        'Configure MASTER_ENCRYPTION_KEY nos secrets do projeto.'
      )
    }

    // Get credentials - try encrypted keys first
    const remoteUrl = dataSource.project_url
    let remoteKey: string | null = null
    let keySource = 'none'

    // Try anon key first (preferred)
    if (dataSource.anon_key_encrypted) {
      try {
        remoteKey = await decrypt(dataSource.anon_key_encrypted)
        keySource = 'anon_key_encrypted'
      } catch {
        console.error('Failed to decrypt anon_key')
      }
    }

    // Fallback to service role key
    if (!remoteKey && dataSource.service_role_key_encrypted) {
      try {
        remoteKey = await decrypt(dataSource.service_role_key_encrypted)
        keySource = 'service_role_key_encrypted'
      } catch {
        console.error('Failed to decrypt service_role_key')
      }
    }

    // Fallback to hardcoded Afonsina keys for compatibility
    if (!remoteKey) {
      const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
      const afonsinaServiceKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY')
      const afonsinaAnonKey = Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
      
      if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
        remoteKey = afonsinaAnonKey || afonsinaServiceKey || null
        keySource = 'afonsina_fallback'
      }
    }

    if (!remoteKey) {
      return errorResponse(
        'DECRYPT_FAILED', 
        'Credenciais inválidas ou indisponíveis',
        'Não foi possível obter uma chave válida para este data source.',
        'Configure a anon_key ou service_role_key usando "Configurar Credenciais".'
      )
    }

    // Build REST API URL
    let restUrl = `${remoteUrl}/rest/v1/${view_name}?select=*`
    
    if (start) {
      restUrl += `&${date_column}=gte.${start}`
    }
    if (end) {
      restUrl += `&${date_column}=lte.${end}`
    }
    
    restUrl += `&order=${date_column}.asc`
    restUrl += `&limit=${Math.min(limit, 10000)}` // Cap at 10k rows

    console.log(`Querying external Supabase: ${remoteUrl}/rest/v1/${view_name} (key source: ${keySource})`)

    let response: Response
    try {
      response = await fetchWithTimeout(restUrl, {
        method: 'GET',
        headers: {
          'apikey': remoteKey,
          'Authorization': `Bearer ${remoteKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error('Fetch error:', errorMsg)
      
      if (errorMsg.includes('TIMEOUT')) {
        return errorResponse(
          'TIMEOUT', 
          'Tempo esgotado ao consultar o Supabase externo',
          errorMsg,
          'Verifique se o projeto Supabase está online e acessível.'
        )
      }
      
      return errorResponse('NETWORK_ERROR', 'Erro de rede ao conectar', errorMsg)
    }

    // Handle upstream errors with detailed messages
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Erro desconhecido')
      console.error(`Upstream error: ${response.status}`, errorText.slice(0, 200))
      
      let suggestion = ''
      
      if (response.status === 401) {
        suggestion = 'A chave de API pode estar inválida ou expirada. Reconfigure as credenciais.'
      } else if (response.status === 403) {
        suggestion = `Execute no Supabase do cliente:\nGRANT USAGE ON SCHEMA ${schema} TO anon, authenticated;\nGRANT SELECT ON ${schema}.${view_name} TO anon, authenticated;`
      } else if (response.status === 404) {
        suggestion = `A view "${view_name}" pode não existir. Verifique o nome e o schema (${schema}).`
      } else if (response.status === 400) {
        suggestion = 'Verifique se a coluna de data está correta (padrão: "dia").'
      }

      return errorResponse(
        `UPSTREAM_${response.status}`,
        `Supabase externo retornou erro ${response.status}`,
        errorText.slice(0, 300),
        suggestion
      )
    }

    // Parse response
    let data: unknown[]
    try {
      data = await response.json()
    } catch {
      return errorResponse(
        'PARSE_ERROR',
        'Resposta do Supabase não é JSON válido',
        undefined,
        'Verifique se a view retorna dados no formato esperado.'
      )
    }

    if (!Array.isArray(data)) {
      return errorResponse(
        'INVALID_RESPONSE',
        'Resposta do Supabase não é um array',
        `Tipo recebido: ${typeof data}`,
        'Views devem retornar um array de objetos.'
      )
    }

    // Extract column info from first row
    const columns = data.length > 0 
      ? Object.keys(data[0] as Record<string, unknown>).map(name => ({
          name,
          type: typeof (data[0] as Record<string, unknown>)[name]
        }))
      : []

    console.log(`Query successful: ${data.length} rows, ${columns.length} columns`)

    return successResponse({
      rows: data,
      meta: {
        view: view_name,
        schema,
        data_source_id,
        row_count: data.length,
        key_source: keySource
      },
      columns
    })

  } catch (error) {
    console.error('Unhandled error in external-supabase-query:', error)
    return errorResponse(
      'INTERNAL_ERROR', 
      'Erro interno do servidor', 
      error instanceof Error ? error.message : String(error)
    )
  }
})
