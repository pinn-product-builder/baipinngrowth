import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Standard response helper - ALWAYS returns 200 with JSON
function jsonResponse(data: Record<string, any>) {
  return new Response(JSON.stringify(data), {
    status: 200, // Always 200 to avoid generic client errors
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({
    ok: false,
    error: { code, message, details }
  })
}

function successResponse(data: Record<string, any>) {
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

interface ViewInfo {
  name: string
  schema: string
  type: 'view' | 'table'
}

// Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(id)
    return response
  } catch (error: any) {
    clearTimeout(id)
    if (error.name === 'AbortError') {
      throw new Error('Timeout: A requisição demorou mais de 10 segundos')
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

    // Check user is admin using service role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: adminRole, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (roleError) {
      console.error('Role check error:', roleError)
      return errorResponse('DB_ERROR', 'Erro ao verificar permissões', roleError.message)
    }

    if (!adminRole) {
      return errorResponse('FORBIDDEN', 'Apenas administradores podem introspeccionar data sources')
    }

    // Parse and validate request body
    let body: any
    try {
      body = await req.json()
    } catch (e) {
      return errorResponse('INVALID_JSON', 'Corpo da requisição inválido')
    }

    const { data_source_id, schema = 'public' } = body

    if (!data_source_id) {
      return errorResponse('VALIDATION_ERROR', 'data_source_id é obrigatório')
    }

    // Check MASTER_ENCRYPTION_KEY
    if (!Deno.env.get('MASTER_ENCRYPTION_KEY')) {
      console.error('MASTER_ENCRYPTION_KEY not set')
      return errorResponse('CONFIG_ERROR', 'Chave de criptografia não configurada. Configure MASTER_ENCRYPTION_KEY nos secrets.')
    }

    // Get data source with encrypted keys
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('*')
      .eq('id', data_source_id)
      .single()

    if (dsError) {
      console.error('Data source fetch error:', dsError)
      return errorResponse('DB_ERROR', 'Erro ao buscar data source', dsError.message)
    }

    if (!dataSource) {
      return errorResponse('NOT_FOUND', 'Data source não encontrado')
    }

    // Determine which key to use
    let apiKey: string | null = null

    // Try anon key first (preferred for readonly)
    if (dataSource.anon_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.anon_key_encrypted)
      } catch (e) {
        console.error('Failed to decrypt anon_key:', e)
      }
    }

    // Fallback to service role if no anon key
    if (!apiKey && dataSource.service_role_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.service_role_key_encrypted)
      } catch (e) {
        console.error('Failed to decrypt service_role_key:', e)
      }
    }

    // Fallback to hardcoded Afonsina keys for compatibility
    if (!apiKey) {
      const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
      const afonsinaKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
      
      if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
        apiKey = afonsinaKey || null
      }
    }

    if (!apiKey) {
      return errorResponse(
        'NO_CREDENTIALS', 
        'Credenciais não configuradas',
        'Configure a anon_key ou service_role_key para este data source.'
      )
    }

    // Query the remote Supabase for views and tables
    // Using the OpenAPI spec which lists all endpoints
    const openApiUrl = `${dataSource.project_url}/rest/v1/`
    
    console.log('Introspecting:', openApiUrl)

    let views: ViewInfo[] = []
    let tables: ViewInfo[] = []

    try {
      const response = await fetchWithTimeout(openApiUrl, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        console.error('Introspection failed:', response.status, errorText)
        
        if (response.status === 401) {
          return errorResponse('INVALID_KEY', 'anon_key inválida ou sem permissão', errorText.slice(0, 200))
        } else if (response.status === 403) {
          return errorResponse('FORBIDDEN', 'Acesso negado pelo servidor remoto', errorText.slice(0, 200))
        } else {
          return errorResponse('CONNECTION_ERROR', `Erro ao conectar: ${response.status}`, errorText.slice(0, 200))
        }
      }

      // The REST API root returns an object with all available endpoints
      const apiSpec = await response.json()
      
      // Extract table/view names from paths or definitions
      if (apiSpec.definitions) {
        for (const name of Object.keys(apiSpec.definitions)) {
          // Skip internal tables
          if (name.startsWith('_') || name.startsWith('pg_') || name === 'spatial_ref_sys') continue
          
          // Heuristic: views often start with 'vw_' or 'v_'
          if (name.startsWith('vw_') || name.startsWith('v_')) {
            views.push({ name, schema, type: 'view' })
          } else {
            tables.push({ name, schema, type: 'table' })
          }
        }
      } else if (apiSpec.paths) {
        for (const path of Object.keys(apiSpec.paths)) {
          const name = path.replace(/^\//, '')
          if (!name || name.startsWith('_') || name.startsWith('rpc/')) continue
          
          if (name.startsWith('vw_') || name.startsWith('v_')) {
            views.push({ name, schema, type: 'view' })
          } else {
            tables.push({ name, schema, type: 'table' })
          }
        }
      }

      // Sort alphabetically
      views.sort((a, b) => a.name.localeCompare(b.name))
      tables.sort((a, b) => a.name.localeCompare(b.name))

      console.log(`Found ${views.length} views and ${tables.length} tables`)

      return successResponse({ 
        views,
        tables,
        schema,
        total: views.length + tables.length
      })

    } catch (fetchError: any) {
      console.error('Fetch error:', fetchError)
      return errorResponse('NETWORK_ERROR', 'Erro de rede ao conectar', fetchError.message)
    }

  } catch (error: any) {
    console.error('Unhandled error in introspect-datasource:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno do servidor', error.message)
  }
})
