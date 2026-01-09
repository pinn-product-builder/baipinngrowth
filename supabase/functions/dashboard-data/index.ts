// Dashboard Data Edge Function - v3 with explicit dataset binding
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// In-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW_MS = 60000
const MAX_REQUESTS_PER_WINDOW = 60

function checkRateLimit(identifier: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false
  }
  
  record.count++
  return true
}

// Simple in-memory cache
const cache = new Map<string, { data: any; expiresAt: number }>()

function getCacheKey(dashboardId: string, start: string, end: string): string {
  return `${dashboardId}:${start}:${end}`
}

function getFromCache(key: string): any | null {
  const cached = cache.get(key)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    cache.delete(key)
    return null
  }
  return cached.data
}

function setCache(key: string, data: any, ttlSeconds: number): void {
  cache.set(key, { data, expiresAt: Date.now() + (ttlSeconds * 1000) })
}

// Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// Validate schema/relation names to prevent injection
function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
}

// Get decrypted key from data source
async function getDataSourceKey(dataSource: any): Promise<string | null> {
  let remoteKey: string | null = null

  if (dataSource.anon_key_encrypted) {
    try {
      remoteKey = await decryptSupabaseFormat(dataSource.anon_key_encrypted)
    } catch (e) {
      console.error('Failed to decrypt anon_key:', e)
    }
  }

  if (!remoteKey && dataSource.service_role_key_encrypted) {
    try {
      remoteKey = await decryptSupabaseFormat(dataSource.service_role_key_encrypted)
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

// Fetch data from external view
async function fetchFromExternalView(
  projectUrl: string,
  apiKey: string,
  schemaName: string,
  relationName: string,
  timeColumn: string | null,
  start: string | null,
  end: string | null,
  limit: number = 1000
): Promise<{ data: any[]; error: string | null; debug: any }> {
  // Validate identifiers
  if (!isValidIdentifier(schemaName) || !isValidIdentifier(relationName)) {
    return { 
      data: [], 
      error: 'INVALID_IDENTIFIER: schema ou relation contém caracteres inválidos',
      debug: { schemaName, relationName }
    }
  }

  // Build query URL - PostgREST uses relation name directly, schema is handled by search_path
  let restUrl = `${projectUrl}/rest/v1/${relationName}?select=*`
  
  // Apply date filters if time column is specified
  if (timeColumn && isValidIdentifier(timeColumn)) {
    if (start) {
      restUrl += `&${timeColumn}=gte.${start}`
    }
    if (end) {
      restUrl += `&${timeColumn}=lte.${end}`
    }
    restUrl += `&order=${timeColumn}.asc`
  }
  
  restUrl += `&limit=${limit}`

  const debug = {
    url: restUrl.replace(apiKey, '***'),
    schema: schemaName,
    relation: relationName,
    time_column: timeColumn,
    period: { start, end }
  }

  console.log(`Fetching: ${schemaName}.${relationName} from ${projectUrl}`)

  try {
    const response = await fetchWithTimeout(restUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }, 15000)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Fetch error ${response.status}:`, errorText)
      
      // Parse PostgREST error for better messaging
      let errorMessage = `Erro ${response.status} ao consultar ${schemaName}.${relationName}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.code === 'PGRST205') {
          errorMessage = `VIEW_NOT_FOUND: A view/tabela '${schemaName}.${relationName}' não existe no banco de dados externo`
          if (errorJson.hint) {
            errorMessage += `. Sugestão: ${errorJson.hint}`
          }
        } else if (errorJson.code === 'PGRST204') {
          errorMessage = `COLUMN_NOT_FOUND: Coluna '${timeColumn}' não existe em ${schemaName}.${relationName}`
        } else if (errorJson.message) {
          errorMessage = `POSTGREST_ERROR: ${errorJson.message}`
        }
      } catch (e) {
        // Keep original error message
      }
      
      return { data: [], error: errorMessage, debug }
    }

    const data = await response.json()
    console.log(`Fetched ${data.length} rows from ${schemaName}.${relationName}`)
    
    return { data, error: null, debug }
  } catch (error) {
    console.error('Fetch exception:', error)
    return { 
      data: [], 
      error: `FETCH_EXCEPTION: ${String(error)}`,
      debug 
    }
  }
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

    const userId = user.id

    // Rate limiting
    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Aguarde 1 minuto.' },
        trace_id: traceId
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request - dashboard_id is REQUIRED
    let dashboardId: string | null = null
    let start: string | null = null
    let end: string | null = null
    let limit: number = 1000

    if (req.method === 'POST') {
      const body = await req.json()
      dashboardId = body.dashboard_id
      start = body.start
      end = body.end
      limit = parseInt(body.limit) || 1000
    } else {
      const url = new URL(req.url)
      dashboardId = url.searchParams.get('dashboard_id')
      start = url.searchParams.get('start')
      end = url.searchParams.get('end')
      limit = parseInt(url.searchParams.get('limit') || '1000')
    }

    if (!dashboardId) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { 
          code: 'MISSING_PARAM', 
          message: 'dashboard_id é obrigatório. Para preview de datasets, use /dataset-preview' 
        },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[${traceId}] Dashboard ${dashboardId}, period: ${start} to ${end}`)

    // Use service role for admin queries
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Get user's profile and tenant
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .maybeSingle()

    const { data: userRoleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle()
    
    const isAdmin = !!userRoleData

    // Variables for dashboard data
    let dataSource: any
    let viewName: string
    let timeColumn: string | null = null
    let dashboardName: string | null = null
    let tenantId: string | null = null
    let cacheTtl = 300

    // Fetch dashboard with all data source fields including Google Sheets
    console.log(`[${traceId}] Fetching dashboard: ${dashboardId}`)
    
    const { data: dashboard, error: dashboardError } = await adminClient
      .from('dashboards')
      .select(`
        *, 
        tenant_data_sources(
          *, 
          google_access_token_encrypted, google_refresh_token_encrypted,
          google_client_id_encrypted, google_client_secret_encrypted,
          google_spreadsheet_id, google_sheet_name, google_token_expires_at
        )
      `)
      .eq('id', dashboardId)
      .maybeSingle()

    if (dashboardError || !dashboard) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'DASHBOARD_NOT_FOUND', message: 'Dashboard não encontrado' },
        trace_id: traceId
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify tenant access
    if (!isAdmin && profile?.tenant_id !== dashboard.tenant_id) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'ACCESS_DENIED', message: 'Sem permissão para acessar este dashboard' },
        trace_id: traceId
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate data source binding
    if (!dashboard.data_source_id) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { 
          code: 'NO_DATASOURCE', 
          message: 'Dashboard não possui data source vinculado',
          fix: 'Configure o data_source_id no dashboard'
        },
        binding: {
          dashboard_id: dashboardId,
          dashboard_name: dashboard.name,
          data_source_id: null
        },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    dataSource = dashboard.tenant_data_sources
    if (!dataSource || !dataSource.is_active) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { 
          code: 'DATASOURCE_INACTIVE', 
          message: 'Data source não encontrado ou inativo' 
        },
        binding: {
          dashboard_id: dashboardId,
          data_source_id: dashboard.data_source_id
        },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    viewName = dashboard.view_name
    if (!viewName) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { 
          code: 'NO_VIEW_NAME', 
          message: 'Dashboard não possui view_name configurado',
          fix: 'Configure o view_name no dashboard'
        },
        binding: {
          dashboard_id: dashboardId,
          dashboard_name: dashboard.name,
          data_source_id: dashboard.data_source_id,
          data_source_name: dataSource.name,
          view_name: null
        },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate view is in allowed_views
    const allowedViews = dataSource.allowed_views || []
    if (!allowedViews.includes(viewName)) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { 
          code: 'VIEW_NOT_ALLOWED', 
          message: `A view '${viewName}' não está na lista de views permitidas do data source '${dataSource.name}'`,
          fix: `Adicione '${viewName}' em allowed_views do data source ou corrija o view_name do dashboard`
        },
        binding: {
          dashboard_id: dashboardId,
          dashboard_name: dashboard.name,
          view_name: viewName,
          data_source_id: dataSource.id,
          data_source_name: dataSource.name,
          allowed_views: allowedViews
        },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Extract time column from dashboard_spec
    const spec = dashboard.dashboard_spec as Record<string, any> | null
    if (spec?.time?.column) {
      timeColumn = spec.time.column
    } else if (spec?.columns) {
      const dateCol = (spec.columns as any[]).find((c: any) => 
        c.semantic_type === 'date' || 
        c.role_hint === 'time' ||
        c.name?.toLowerCase().includes('created') ||
        c.name?.toLowerCase().includes('date') ||
        c.name?.toLowerCase().includes('dia')
      )
      if (dateCol) {
        timeColumn = dateCol.name
      }
    }

    dashboardName = dashboard.name
    tenantId = dashboard.tenant_id
    cacheTtl = dashboard.cache_ttl_seconds || 300

    // Check if this is a Google Sheets data source
    const isGoogleSheets = dataSource.type === 'google_sheets'
    let remoteKey: string | null = null
    let googleAccessToken: string | null = null

    if (isGoogleSheets) {
      // Try to get Google Sheets access token
      if (dataSource.google_access_token_encrypted) {
        try { googleAccessToken = await decryptGoogleFormat(dataSource.google_access_token_encrypted) } catch (e) {
          console.error(`[${traceId}] Failed to decrypt Google access token:`, e)
        }
      }
      
      // Refresh token if needed
      if (!googleAccessToken && dataSource.google_refresh_token_encrypted) {
        try {
          const refreshToken = await decryptGoogleFormat(dataSource.google_refresh_token_encrypted)
          const clientId = dataSource.google_client_id_encrypted 
            ? await decryptGoogleFormat(dataSource.google_client_id_encrypted) 
            : Deno.env.get('GOOGLE_CLIENT_ID')
          const clientSecret = dataSource.google_client_secret_encrypted 
            ? await decryptGoogleFormat(dataSource.google_client_secret_encrypted) 
            : Deno.env.get('GOOGLE_CLIENT_SECRET')
          
          if (refreshToken && clientId && clientSecret) {
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
              googleAccessToken = tokenData.access_token
              console.log(`[${traceId}] Refreshed Google access token`)
            } else {
              console.error(`[${traceId}] Failed to refresh token:`, await tokenResponse.text())
            }
          }
        } catch (e) {
          console.error(`[${traceId}] Token refresh error:`, e)
        }
      }
      
      if (!googleAccessToken) {
        return new Response(JSON.stringify({ 
          ok: false,
          error: { 
            code: 'NO_CREDENTIALS', 
            message: 'Credenciais do Google Sheets não configuradas ou expiradas' 
          },
          binding: {
            data_source_id: dataSource.id,
            data_source_name: dataSource.name
          },
          trace_id: traceId
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      // Get Supabase data source credentials
      remoteKey = await getDataSourceKey(dataSource)
      if (!remoteKey) {
        return new Response(JSON.stringify({ 
          ok: false,
          error: { 
            code: 'NO_CREDENTIALS', 
            message: 'Credenciais do data source não configuradas' 
          },
          binding: {
            data_source_id: dataSource.id,
            data_source_name: dataSource.name
          },
          trace_id: traceId
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Check cache
    const cacheKey = getCacheKey(dashboardId, start || '', end || '')
    const cachedData = getFromCache(cacheKey)
    if (cachedData) {
      console.log(`[${traceId}] Returning cached data`)
      return new Response(JSON.stringify({ 
        ok: true,
        ...cachedData, 
        cached: true,
        trace_id: traceId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let resultData: any[] = []
    let resultError: string | null = null
    let resultDebug: any = {}

    if (isGoogleSheets) {
      // Fetch from Google Sheets
      const spreadsheetId = dataSource.google_spreadsheet_id
      const sheetName = viewName
      
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`
      
      console.log(`[${traceId}] Fetching Google Sheet: ${sheetName} from ${spreadsheetId}`)
      
      try {
        const sheetsResponse = await fetch(sheetsUrl, {
          headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        })
        
        if (!sheetsResponse.ok) {
          const errorText = await sheetsResponse.text()
          console.error(`[${traceId}] Google Sheets error ${sheetsResponse.status}:`, errorText)
          resultError = `Erro ao acessar planilha: ${sheetsResponse.status}`
        } else {
          const sheetsData = await sheetsResponse.json()
          const rawRows = sheetsData.values || []
          
          if (rawRows.length > 0) {
            // Convert to objects using first row as headers
            const headers = rawRows[0]
            resultData = rawRows.slice(1, limit + 1).map((row: string[]) => {
              const obj: Record<string, any> = {}
              headers.forEach((h: string, i: number) => {
                obj[h] = row[i] ?? null
              })
              return obj
            })
          }
        }
        
        resultDebug = {
          type: 'google_sheets',
          spreadsheet_id: spreadsheetId,
          sheet_name: sheetName,
          period: { start, end }
        }
      } catch (error) {
        console.error(`[${traceId}] Google Sheets fetch error:`, error)
        resultError = `Erro ao acessar Google Sheets: ${String(error)}`
      }
    } else {
      // Fetch from Supabase external database
      console.log(`[${traceId}] Querying ${dataSource.name} (${dataSource.project_ref}): public.${viewName}`)
      
      const result = await fetchFromExternalView(
        dataSource.project_url,
        remoteKey!,
        'public',
        viewName,
        timeColumn,
        start,
        end,
        limit
      )
      
      resultData = result.data
      resultError = result.error
      resultDebug = result.debug
    }

    if (resultError) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { 
          code: 'FETCH_ERROR', 
          message: resultError 
        },
        binding: {
          dashboard_id: dashboardId,
          dashboard_name: dashboardName,
          view_name: viewName,
          time_column: timeColumn,
          data_source_id: dataSource.id,
          data_source_name: dataSource.name,
          project_ref: dataSource.project_ref
        },
        debug: resultDebug,
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Cache and return
    const responseData = {
      data: resultData,
      rows_returned: resultData.length,
      binding: {
        dashboard_id: dashboardId,
        view_name: viewName,
        time_column: timeColumn,
        data_source_name: dataSource.name,
        data_source_type: isGoogleSheets ? 'google_sheets' : 'supabase',
        project_ref: dataSource.project_ref,
        period: { start, end }
      }
    }
    
    setCache(cacheKey, responseData, cacheTtl)

    return new Response(JSON.stringify({ 
      ok: true,
      ...responseData, 
      cached: false,
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
