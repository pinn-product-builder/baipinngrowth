// Dataset Preview Edge Function - for testing datasets before dashboard creation
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Encryption helpers - MUST match google-sheets-connect encryption format (Base64 key)
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyB64 = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!keyB64) throw new Error('MASTER_ENCRYPTION_KEY not set')
  const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey()
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext))
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

// Validate identifiers to prevent injection
// For Supabase: strict SQL identifier format
// For Google Sheets: allow unicode letters, numbers, spaces (sheet names)
function isValidIdentifier(name: string, type: 'supabase' | 'google_sheets' = 'supabase'): boolean {
  if (type === 'google_sheets') {
    // Google Sheets: allow letters (including unicode), numbers, spaces, underscores, hyphens
    // Max 100 chars, no control characters
    return name.length > 0 && name.length <= 100 && !/[\x00-\x1f]/.test(name)
  }
  // Supabase: strict SQL identifier
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
}

// Get decrypted key from data source
async function getDataSourceKey(dataSource: any): Promise<string | null> {
  let remoteKey: string | null = null

  if (dataSource.anon_key_encrypted) {
    try {
      remoteKey = await decrypt(dataSource.anon_key_encrypted)
    } catch (e) {
      console.error('Failed to decrypt anon_key:', e)
    }
  }

  if (!remoteKey && dataSource.service_role_key_encrypted) {
    try {
      remoteKey = await decrypt(dataSource.service_role_key_encrypted)
    } catch (e) {
      console.error('Failed to decrypt service_role_key:', e)
    }
  }

  // Fallback to env keys for known projects
  if (!remoteKey) {
    const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
    if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
      remoteKey = Deno.env.get('AFONSINA_SUPABASE_ANON_KEY') || 
                  Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || null
    }
  }

  return remoteKey
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const traceId = crypto.randomUUID().slice(0, 8)
  
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Token de autorização ausente' },
        trace_id: traceId
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Validate user
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'AUTH_FAILED', message: 'Token inválido ou expirado' },
        trace_id: traceId
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request
    let datasetId: string | null = null
    let datasourceId: string | null = null
    let viewName: string | null = null
    let limit = 100

    if (req.method === 'POST') {
      const body = await req.json()
      datasetId = body.dataset_id
      datasourceId = body.datasource_id
      viewName = body.view
      limit = parseInt(body.limit) || 100
    } else {
      const url = new URL(req.url)
      datasetId = url.searchParams.get('dataset_id')
      datasourceId = url.searchParams.get('datasource_id')
      viewName = url.searchParams.get('view')
      limit = parseInt(url.searchParams.get('limit') || '100')
    }

    // Require either dataset_id OR (view + datasource_id)
    if (!datasetId && (!viewName || !datasourceId)) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'MISSING_PARAM', message: 'Informe dataset_id ou (view + datasource_id)' },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[${traceId}] Dataset preview: dataset_id=${datasetId}, view=${viewName}, limit=${limit}`)

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Get user info for access control
    const { data: userRoleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()
    
    const isAdmin = !!userRoleData

    let dataSource: any
    let relationName: string

    if (datasetId) {
      // Mode 1: Fetch by dataset_id
      const { data: dataset, error: datasetError } = await adminClient
        .from('datasets')
        .select('*, tenant_data_sources(*)')
        .eq('id', datasetId)
        .maybeSingle()

      if (datasetError || !dataset) {
        return new Response(JSON.stringify({ 
          ok: false,
          error: { code: 'DATASET_NOT_FOUND', message: 'Dataset não encontrado' },
          trace_id: traceId
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Access check
      if (!isAdmin) {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle()

        if (profile?.tenant_id !== dataset.tenant_id) {
          return new Response(JSON.stringify({ 
            ok: false,
            error: { code: 'ACCESS_DENIED', message: 'Sem permissão para acessar este dataset' },
            trace_id: traceId
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }

      dataSource = dataset.tenant_data_sources
      relationName = dataset.object_name || dataset.name
    } else {
      // Mode 2: Direct view + datasource_id
      const { data: ds, error: dsError } = await adminClient
        .from('tenant_data_sources')
        .select('*')
        .eq('id', datasourceId)
        .eq('is_active', true)
        .maybeSingle()

      if (dsError || !ds) {
        return new Response(JSON.stringify({ 
          ok: false,
          error: { code: 'DATASOURCE_NOT_FOUND', message: 'Data source não encontrado' },
          trace_id: traceId
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Access check
      if (!isAdmin) {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle()

        if (profile?.tenant_id !== ds.tenant_id) {
          return new Response(JSON.stringify({ 
            ok: false,
            error: { code: 'ACCESS_DENIED', message: 'Sem permissão para acessar este data source' },
            trace_id: traceId
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }

      dataSource = ds
      relationName = viewName!
    }

    if (!dataSource || !dataSource.is_active) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'DATASOURCE_INACTIVE', message: 'Data source não encontrado ou inativo' },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determine data source type for validation
    const dsType = dataSource.type === 'google_sheets' ? 'google_sheets' : 'supabase'
    
    // Validate relation name
    if (!isValidIdentifier(relationName, dsType)) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'INVALID_IDENTIFIER', message: 'Nome da view/tabela inválido' },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Handle Google Sheets data sources
    if (dataSource.type === 'google_sheets') {
      let accessToken: string | null = null
      
      // Check if token is expired based on stored expiry time
      const tokenExpired = dataSource.google_token_expires_at 
        ? new Date(dataSource.google_token_expires_at) <= new Date() 
        : true // Assume expired if no expiry time
      
      // Try to get access token if not expired
      if (!tokenExpired && dataSource.google_access_token_encrypted) {
        try {
          accessToken = await decrypt(dataSource.google_access_token_encrypted)
          console.log(`[${traceId}] Using stored access token (expires: ${dataSource.google_token_expires_at})`)
        } catch (e) {
          console.error(`[${traceId}] Failed to decrypt access token:`, e)
        }
      }
      
      // Refresh token if needed (expired or no valid token)
      if (!accessToken && dataSource.google_refresh_token_encrypted) {
        console.log(`[${traceId}] Attempting to refresh Google OAuth token...`)
        try {
          const refreshToken = await decrypt(dataSource.google_refresh_token_encrypted)
          const clientId = dataSource.google_client_id_encrypted ? await decrypt(dataSource.google_client_id_encrypted) : Deno.env.get('GOOGLE_CLIENT_ID')
          const clientSecret = dataSource.google_client_secret_encrypted ? await decrypt(dataSource.google_client_secret_encrypted) : Deno.env.get('GOOGLE_CLIENT_SECRET')
          
          if (refreshToken && clientId && clientSecret) {
            console.log(`[${traceId}] Refreshing token with client ID: ${clientId.substring(0, 20)}...`)
            
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
              const expiresIn = tokenData.expires_in || 3600
              const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
              
              console.log(`[${traceId}] Successfully refreshed access token, expires in ${expiresIn}s`)
              
              // Save the new access token to the database
              try {
                const encryptedToken = await encrypt(accessToken!)
                
                await adminClient
                  .from('tenant_data_sources')
                  .update({
                    google_access_token_encrypted: encryptedToken,
                    google_token_expires_at: newExpiresAt
                  })
                  .eq('id', dataSource.id)
                
                console.log(`[${traceId}] Saved refreshed token to database`)
              } catch (saveErr) {
                console.error(`[${traceId}] Failed to save refreshed token:`, saveErr)
              }
            } else {
              const errorText = await tokenResponse.text()
              console.error(`[${traceId}] Token refresh failed:`, errorText)
            }
          } else {
            console.error(`[${traceId}] Missing credentials for token refresh`)
          }
        } catch (e) {
          console.error(`[${traceId}] Failed to refresh token:`, e)
        }
      }
      
      if (!accessToken) {
        return new Response(JSON.stringify({ 
          ok: false,
          error: { code: 'NO_CREDENTIALS', message: 'Credenciais do Google Sheets não configuradas ou expiradas. Por favor, reconecte a fonte de dados.' },
          trace_id: traceId
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      // Fetch data from Google Sheets
      const spreadsheetId = dataSource.google_spreadsheet_id
      const sheetName = relationName
      
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`
      
      console.log(`[${traceId}] Fetching Google Sheet: ${sheetName} from ${spreadsheetId}`)
      
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text()
        console.error(`[${traceId}] Google Sheets error ${sheetsResponse.status}:`, errorText)
        return new Response(JSON.stringify({ 
          ok: false,
          error: { code: 'FETCH_ERROR', message: `Erro ao acessar planilha: ${sheetsResponse.status}` },
          trace_id: traceId
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      const sheetsData = await sheetsResponse.json()
      const rows = sheetsData.values || []
      
      if (rows.length < 1) {
        return new Response(JSON.stringify({ 
          ok: true,
          data: [],
          rows_returned: 0,
          binding: {
            view_name: sheetName,
            data_source_name: dataSource.name,
            type: 'google_sheets'
          },
          trace_id: traceId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      // Convert to objects using first row as headers
      const headers = rows[0]
      const dataRows = rows.slice(1, limit + 1).map((row: string[]) => {
        const obj: Record<string, any> = {}
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i] ?? null
        })
        return obj
      })
      
      console.log(`[${traceId}] Fetched ${dataRows.length} rows from Google Sheet ${sheetName}`)
      
      return new Response(JSON.stringify({ 
        ok: true,
        data: dataRows,
        rows_returned: dataRows.length,
        binding: {
          view_name: sheetName,
          data_source_name: dataSource.name,
          type: 'google_sheets'
        },
        trace_id: traceId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get credentials for Supabase
    const remoteKey = await getDataSourceKey(dataSource)
    if (!remoteKey) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'NO_CREDENTIALS', message: 'Credenciais do data source não configuradas' },
        trace_id: traceId
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch sample data
    const restUrl = `${dataSource.project_url}/rest/v1/${relationName}?select=*&limit=${limit}`
    
    console.log(`[${traceId}] Fetching: ${relationName} from ${dataSource.project_url}`)

    const response = await fetch(restUrl, {
      headers: {
        'apikey': remoteKey,
        'Authorization': `Bearer ${remoteKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${traceId}] Fetch error ${response.status}:`, errorText)
      
      let errorMessage = `Erro ${response.status} ao consultar ${relationName}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.code === 'PGRST205') {
          errorMessage = `VIEW_NOT_FOUND: A view/tabela '${relationName}' não existe no banco de dados externo`
        } else if (errorJson.message) {
          errorMessage = errorJson.message
        }
      } catch (e) {
        // Keep original error message
      }
      
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'FETCH_ERROR', message: errorMessage },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    console.log(`[${traceId}] Fetched ${data.length} rows from ${relationName}`)

    return new Response(JSON.stringify({ 
      ok: true,
      data,
      rows_returned: data.length,
      binding: {
        view_name: relationName,
        data_source_name: dataSource.name,
        project_ref: dataSource.project_ref
      },
      trace_id: traceId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Internal error:', error)
    return new Response(JSON.stringify({ 
      ok: false,
      error: { 
        code: 'INTERNAL_ERROR', 
        message: 'Erro interno no servidor',
        details: String(error)
      },
      trace_id: crypto.randomUUID().slice(0, 8)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

