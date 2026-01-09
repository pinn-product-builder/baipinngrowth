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

// Encryption helpers - MUST match google-sheets-connect encryption format
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyB64 = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!keyB64) throw new Error('MASTER_ENCRYPTION_KEY not set')
  const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
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

    // Handle Google Sheets data sources
    if (dataSource.type === 'google_sheets') {
      console.log('Introspecting Google Sheets data source')
      
      // For Google Sheets, the "table" is the spreadsheet and the sheets are our objects
      // We need to fetch sheet names from the spreadsheet
      const spreadsheetId = dataSource.google_spreadsheet_id
      
      if (!spreadsheetId) {
        return errorResponse(
          'NO_SPREADSHEET',
          'Planilha não configurada',
          'Este data source não tem uma planilha Google associada.'
        )
      }

      // Get OAuth tokens
      let accessToken: string | null = null
      
      if (dataSource.google_access_token_encrypted) {
        try {
          accessToken = await decrypt(dataSource.google_access_token_encrypted)
        } catch (e) {
          console.error('Failed to decrypt access token:', e)
        }
      }

      if (!accessToken) {
        // Try to refresh the token if we have a refresh token
        if (dataSource.google_refresh_token_encrypted) {
          try {
            const refreshToken = await decrypt(dataSource.google_refresh_token_encrypted)
            const clientId = dataSource.google_client_id_encrypted 
              ? await decrypt(dataSource.google_client_id_encrypted) 
              : null
            const clientSecret = dataSource.google_client_secret_encrypted 
              ? await decrypt(dataSource.google_client_secret_encrypted) 
              : null
            
            if (clientId && clientSecret && refreshToken) {
              // Refresh the access token
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
                console.log('Successfully refreshed access token')
              } else {
                const errText = await tokenResponse.text()
                console.error('Token refresh failed:', errText)
              }
            }
          } catch (e) {
            console.error('Failed to refresh token:', e)
          }
        }
      }

      if (!accessToken) {
        return errorResponse(
          'NO_CREDENTIALS',
          'Credenciais OAuth não configuradas',
          'O token de acesso do Google expirou ou não está disponível. Reconecte a planilha.'
        )
      }

      // Fetch sheet names from the spreadsheet
      try {
        const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
        
        const sheetsResponse = await fetchWithTimeout(sheetsUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!sheetsResponse.ok) {
          const errText = await sheetsResponse.text()
          console.error('Sheets API error:', errText)
          
          if (sheetsResponse.status === 401 || sheetsResponse.status === 403) {
            return errorResponse('TOKEN_EXPIRED', 'Token de acesso expirado', 'Reconecte a planilha Google.')
          }
          
          return errorResponse('SHEETS_ERROR', 'Erro ao buscar planilha', errText.slice(0, 200))
        }

        const sheetsData = await sheetsResponse.json()
        
        // Each sheet in the spreadsheet becomes a "table" in our data model
        const tables: ViewInfo[] = (sheetsData.sheets || []).map((sheet: any) => ({
          name: sheet.properties?.title || 'Sheet1',
          schema: 'google_sheets',
          type: 'table' as const
        }))

        console.log(`Found ${tables.length} sheets in spreadsheet`)

        return successResponse({
          views: [],
          tables,
          schema: 'google_sheets',
          total: tables.length
        })
      } catch (fetchError: any) {
        console.error('Sheets fetch error:', fetchError)
        return errorResponse('NETWORK_ERROR', 'Erro ao conectar com Google Sheets', fetchError.message)
      }
    }

    // Handle Supabase data sources
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
