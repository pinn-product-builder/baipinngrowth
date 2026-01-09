import { createClient } from 'npm:@supabase/supabase-js@2'

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
    if (!authHeader?.startsWith('Bearer ')) {
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

    // Create client for JWT validation
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    
    // Validate user with getUser
    const { data: { user }, error: userError } = await authClient.auth.getUser()
    
    if (userError || !user) {
      console.log('JWT validation failed:', userError?.message)
      return errorResponse('AUTH_FAILED', 'Token inválido ou expirado', userError?.message)
    }

    const userId = user.id
    console.log(`Test data source request from user: ${userId}`)

    // Check user is admin using service role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: adminRole, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle()

    if (roleError) {
      console.error('Role check error:', roleError)
      return errorResponse('DB_ERROR', 'Erro ao verificar permissões', roleError.message)
    }

    if (!adminRole) {
      return errorResponse('FORBIDDEN', 'Apenas administradores podem testar data sources')
    }

    // Parse and validate request body
    let body: any
    try {
      body = await req.json()
    } catch (e) {
      return errorResponse('INVALID_JSON', 'Corpo da requisição inválido')
    }

    const { data_source_id, view_name } = body

    if (!data_source_id) {
      return errorResponse('VALIDATION_ERROR', 'data_source_id é obrigatório')
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

    // Check MASTER_ENCRYPTION_KEY
    if (!Deno.env.get('MASTER_ENCRYPTION_KEY')) {
      console.error('MASTER_ENCRYPTION_KEY not set')
      return errorResponse('CONFIG_ERROR', 'Chave de criptografia não configurada. Configure MASTER_ENCRYPTION_KEY nos secrets.')
    }

    // Get credentials - try encrypted keys first
    const remoteUrl = dataSource.project_url
    let remoteKey: string | null = null

    // Try anon key first (preferred)
    if (dataSource.anon_key_encrypted) {
      try {
        remoteKey = await decrypt(dataSource.anon_key_encrypted)
        console.log('Successfully decrypted anon_key')
      } catch (e) {
        console.error('Failed to decrypt anon_key:', e)
      }
    }

    // Fallback to service role key
    if (!remoteKey && dataSource.service_role_key_encrypted) {
      try {
        remoteKey = await decrypt(dataSource.service_role_key_encrypted)
        console.log('Successfully decrypted service_role_key')
      } catch (e) {
        console.error('Failed to decrypt service_role_key:', e)
      }
    }

    // Fallback to hardcoded Afonsina keys for compatibility
    if (!remoteKey) {
      const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
      const afonsinaServiceKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY')
      const afonsinaAnonKey = Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
      
      if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
        remoteKey = afonsinaAnonKey || afonsinaServiceKey || null
        console.log('Using Afonsina fallback keys')
      }
    }

    if (!remoteKey) {
      return errorResponse(
        'NO_CREDENTIALS', 
        'Credenciais não configuradas',
        'Configure a anon_key ou service_role_key para este data source.'
      )
    }

    // Test view if provided, otherwise test connection
    const testView = view_name || (dataSource.allowed_views?.length > 0 ? dataSource.allowed_views[0] : null)
    
    if (!testView) {
      // Just test basic connectivity
      const testUrl = `${remoteUrl}/rest/v1/`
      console.log('Testing basic connectivity:', testUrl)

      try {
        const response = await fetchWithTimeout(testUrl, {
          headers: {
            'apikey': remoteKey,
            'Authorization': `Bearer ${remoteKey}`,
            'Accept': 'application/json'
          }
        })

        if (response.ok || response.status === 404) {
          return successResponse({ 
            message: 'Conexão estabelecida com sucesso (nenhuma view para testar)',
            status: response.status
          })
        } else if (response.status === 401) {
          return errorResponse('INVALID_KEY', 'anon_key inválida ou sem permissão', `Status: ${response.status}`)
        } else if (response.status === 403) {
          return errorResponse('FORBIDDEN', 'Acesso negado pelo servidor remoto', `Status: ${response.status}`)
        } else {
          const errorText = await response.text().catch(() => '')
          return errorResponse('CONNECTION_ERROR', `Erro de conexão: ${response.status}`, errorText.slice(0, 200))
        }
      } catch (fetchError: any) {
        console.error('Fetch error:', fetchError)
        return errorResponse('NETWORK_ERROR', 'Erro de rede ao conectar', fetchError.message)
      }
    }

    // Test the specific view
    const restUrl = `${remoteUrl}/rest/v1/${testView}?select=*&limit=1`
    console.log('Testing view:', restUrl)

    try {
      const response = await fetchWithTimeout(restUrl, {
        headers: {
          'apikey': remoteKey,
          'Authorization': `Bearer ${remoteKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        console.error('Test failed:', response.status, errorText)
        
        if (response.status === 401) {
          return errorResponse('INVALID_KEY', 'anon_key inválida ou sem permissão para esta view', errorText.slice(0, 200))
        } else if (response.status === 404) {
          return errorResponse('VIEW_NOT_FOUND', `View "${testView}" não encontrada`, 'Verifique o nome da view e o schema.')
        } else if (response.status === 403) {
          return errorResponse('FORBIDDEN', 'Acesso negado à view', errorText.slice(0, 200))
        } else {
          return errorResponse('VIEW_ERROR', `Erro ao acessar view: ${response.status}`, errorText.slice(0, 200))
        }
      }

      const data = await response.json()
      const rowCount = Array.isArray(data) ? data.length : 0
      const columns = rowCount > 0 ? Object.keys(data[0]) : []

      return successResponse({ 
        message: `Conexão OK! View "${testView}" acessível.`,
        view: testView,
        sample_row_count: rowCount,
        columns: columns,
        has_data: rowCount > 0
      })

    } catch (fetchError: any) {
      console.error('Fetch error:', fetchError)
      return errorResponse('NETWORK_ERROR', 'Erro de rede ao acessar view', fetchError.message)
    }

  } catch (error: any) {
    console.error('Unhandled error in test-data-source:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno do servidor', error.message)
  }
})
