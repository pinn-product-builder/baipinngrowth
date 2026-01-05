import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// In-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW_MS = 60000
const MAX_REQUESTS_PER_WINDOW = 30

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
const cache = new Map<string, { data: unknown; expiresAt: number }>()

function getCacheKey(dashboardId: string, start: string, end: string): string {
  return `${dashboardId}:${start}:${end}`
}

function getFromCache(key: string): unknown | null {
  const cached = cache.get(key)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    cache.delete(key)
    return null
  }
  return cached.data
}

function setCache(key: string, data: unknown, ttlSeconds: number): void {
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

// Standard error response - ALWAYS returns 200 with structured error in body
function errorJson(code: string, message: string, details?: string, suggestion?: string) {
  return new Response(JSON.stringify({ 
    ok: false,
    error: { code, message, details, suggestion },
    error_type: code.toLowerCase()
  }), {
    status: 200, // Always 200 to avoid generic "non-2xx" errors
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function successJson(data: unknown, cached = false) {
  return new Response(JSON.stringify({ ok: true, data, cached }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return errorJson('UNAUTHORIZED', 'Não autorizado', 'Token de autorização não fornecido')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorJson('AUTH_FAILED', 'Usuário não autenticado', userError?.message)
    }

    // Rate limiting by user
    if (!checkRateLimit(user.id)) {
      return errorJson('RATE_LIMIT', 'Muitas requisições', 'Tente novamente em 1 minuto.')
    }

    const url = new URL(req.url)
    const dashboardId = url.searchParams.get('dashboard_id')
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')
    const limit = url.searchParams.get('limit') || '1000'

    if (!dashboardId) {
      return errorJson('VALIDATION_ERROR', 'dashboard_id é obrigatório')
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: dashboard, error: dashboardError } = await adminClient
      .from('dashboards')
      .select('*, tenant_data_sources(*)')
      .eq('id', dashboardId)
      .maybeSingle()

    if (dashboardError || !dashboard) {
      console.error('Dashboard error:', dashboardError)
      return errorJson('NOT_FOUND', 'Dashboard não encontrado', dashboardError?.message)
    }

    // Check if user belongs to the dashboard's tenant
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.tenant_id !== dashboard.tenant_id) {
      const { data: role } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle()

      if (!role) {
        return errorJson('FORBIDDEN', 'Acesso negado', 'Você não tem permissão para acessar este dashboard.')
      }
    }

    if (dashboard.source_kind !== 'supabase_view') {
      return errorJson('INVALID_SOURCE', 'Este dashboard não é do tipo supabase_view')
    }

    if (!dashboard.data_source_id || !dashboard.view_name) {
      return errorJson('CONFIG_ERROR', 'Dashboard não configurado corretamente', 'data_source_id ou view_name está faltando.')
    }

    const dataSource = dashboard.tenant_data_sources
    if (!dataSource || !dataSource.is_active) {
      return errorJson('DATASOURCE_ERROR', 'Data source não encontrado ou inativo')
    }

    if (!dataSource.allowed_views.includes(dashboard.view_name)) {
      return errorJson('VIEW_NOT_ALLOWED', 'View não permitida', `A view "${dashboard.view_name}" não está na lista de views permitidas.`)
    }

    // Check cache
    const cacheKey = getCacheKey(dashboardId, start || '', end || '')
    const cachedData = getFromCache(cacheKey)
    if (cachedData) {
      console.log('Returning cached data for', cacheKey)
      return successJson(cachedData, true)
    }

    // Handle different data source types
    const dataSourceType = dataSource.type || 'supabase'
    
    let data: unknown[]

    if (dataSourceType === 'proxy_webhook') {
      // ============================================================
      // PROXY/WEBHOOK MODE - Call the proxy's /query endpoint
      // ============================================================
      console.log('Using proxy_webhook mode for data source:', dataSource.name)
      
      const baseUrl = dataSource.base_url
      if (!baseUrl) {
        return errorJson('CONFIG_ERROR', 'Base URL do proxy não configurada')
      }

      // Build query URL
      const queryUrl = new URL(`${baseUrl}/query`)
      queryUrl.searchParams.set('view', dashboard.view_name)
      if (start) queryUrl.searchParams.set('start', start)
      if (end) queryUrl.searchParams.set('end', end)
      queryUrl.searchParams.set('limit', limit)

      // Build headers
      const proxyHeaders: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }

      if (dataSource.auth_mode === 'bearer_token' && dataSource.bearer_token) {
        proxyHeaders['Authorization'] = `Bearer ${dataSource.bearer_token}`
      }

      console.log('Calling proxy:', queryUrl.toString())

      let proxyResponse: Response
      try {
        proxyResponse = await fetchWithTimeout(queryUrl.toString(), {
          method: 'GET',
          headers: proxyHeaders
        }, 15000)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
        console.error('Proxy fetch error:', errorMessage)
        
        if (error instanceof Error && error.name === 'AbortError') {
          return errorJson('TIMEOUT', 'Tempo esgotado', 'O proxy não respondeu em tempo hábil.')
        }
        
        return errorJson('NETWORK_ERROR', 'Falha ao conectar ao proxy', errorMessage)
      }

      if (!proxyResponse.ok) {
        const errorText = await proxyResponse.text()
        console.error('Proxy error:', proxyResponse.status, errorText)
        return errorJson(
          `PROXY_${proxyResponse.status}`, 
          `Proxy retornou erro ${proxyResponse.status}`, 
          errorText.slice(0, 300)
        )
      }

      const proxyResult = await proxyResponse.json()
      
      // Handle proxy response format: { ok: true, rows: [...] } or { ok: true, data: [...] }
      if (proxyResult.ok === false) {
        return errorJson('PROXY_ERROR', proxyResult.message || 'Erro do proxy', proxyResult.details)
      }

      // Extract rows from response
      data = proxyResult.rows || proxyResult.data || []
      console.log(`Proxy returned ${data.length} rows`)

    } else {
      // ============================================================
      // SUPABASE DIRECT MODE - Use internal edge function for decryption
      // ============================================================
      console.log('Using supabase direct mode via external-supabase-query for data source:', dataSource.name)
      
      // Call the external-supabase-query function internally
      // We make an internal HTTP call to keep credentials decryption isolated
      const queryBody = {
        data_source_id: dataSource.id,
        view_name: dashboard.view_name,
        start: start,
        end: end,
        limit: parseInt(limit, 10),
        date_column: 'dia' // Default date column
      }

      console.log('Calling external-supabase-query with:', JSON.stringify({ 
        data_source_id: dataSource.id, 
        view_name: dashboard.view_name 
      }))

      // Make internal call to the external-supabase-query function
      const internalUrl = `${supabaseUrl}/functions/v1/external-supabase-query`
      
      let internalResponse: Response
      try {
        internalResponse = await fetchWithTimeout(internalUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey
          },
          body: JSON.stringify(queryBody)
        }, 20000)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
        console.error('Internal function call failed:', errorMessage)
        
        if (error instanceof Error && error.name === 'AbortError') {
          return errorJson('TIMEOUT', 'Tempo esgotado', 'A consulta ao Supabase externo demorou demais.')
        }
        
        return errorJson('INTERNAL_ERROR', 'Falha ao executar query', errorMessage)
      }

      // The external-supabase-query always returns 200
      const result = await internalResponse.json()
      
      if (!result.ok) {
        console.error('External query failed:', result.error)
        return errorJson(
          result.error?.code || 'QUERY_ERROR',
          result.error?.message || 'Erro ao consultar dados',
          result.error?.details,
          result.error?.suggestion
        )
      }

      data = result.rows || []
      console.log(`External query returned ${data.length} rows`)
    }

    // Cache the result
    const ttl = dashboard.cache_ttl_seconds || 300
    setCache(cacheKey, data, ttl)

    return successJson(data, false)

  } catch (error) {
    console.error('Error in dashboard-data:', error)
    return errorJson(
      'INTERNAL_ERROR', 
      'Erro interno', 
      error instanceof Error ? error.message : String(error)
    )
  }
})
