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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Rate limiting by user
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: 'Muitas requisições. Tente novamente em 1 minuto.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request
    const url = new URL(req.url)
    const dashboardId = url.searchParams.get('dashboard_id')
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')

    if (!dashboardId) {
      return new Response(JSON.stringify({ error: 'dashboard_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role to fetch dashboard and data source info
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch dashboard
    const { data: dashboard, error: dashboardError } = await adminClient
      .from('dashboards')
      .select('*, tenant_data_sources(*)')
      .eq('id', dashboardId)
      .maybeSingle()

    if (dashboardError || !dashboard) {
      console.error('Dashboard error:', dashboardError)
      return new Response(JSON.stringify({ error: 'Dashboard não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if user belongs to the dashboard's tenant
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.tenant_id !== dashboard.tenant_id) {
      // Check if user is admin
      const { data: role } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle()

      if (!role) {
        return new Response(JSON.stringify({ error: 'Acesso negado' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Check if it's a supabase_view dashboard
    if (dashboard.source_kind !== 'supabase_view') {
      return new Response(JSON.stringify({ error: 'Este dashboard não é do tipo supabase_view' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!dashboard.data_source_id || !dashboard.view_name) {
      return new Response(JSON.stringify({ error: 'Dashboard não configurado corretamente' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const dataSource = dashboard.tenant_data_sources
    if (!dataSource || !dataSource.is_active) {
      return new Response(JSON.stringify({ error: 'Data source não encontrado ou inativo' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate view_name is in allowed_views
    if (!dataSource.allowed_views.includes(dashboard.view_name)) {
      return new Response(JSON.stringify({ error: 'View não permitida' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check cache
    const cacheKey = getCacheKey(dashboardId, start || '', end || '')
    const cachedData = getFromCache(cacheKey)
    if (cachedData) {
      console.log('Returning cached data for', cacheKey)
      return new Response(JSON.stringify({ data: cachedData, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get credentials from secrets based on project_ref
    // For now, we support the Afonsina project via env vars
    let remoteUrl = dataSource.project_url
    let remoteKey = ''

    // Check if this is the Afonsina project
    const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
    const afonsinaServiceKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY')
    
    if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
      remoteKey = afonsinaServiceKey || ''
    }

    if (!remoteKey) {
      return new Response(JSON.stringify({ error: 'Credenciais do data source não configuradas' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Build REST API URL
    let restUrl = `${remoteUrl}/rest/v1/${dashboard.view_name}?select=*`
    
    // Add date filters if provided
    if (start) {
      restUrl += `&dia=gte.${start}`
    }
    if (end) {
      restUrl += `&dia=lte.${end}`
    }
    
    // Order by dia
    restUrl += `&order=dia.asc`

    console.log('Fetching from:', restUrl)

    // Fetch data from remote Supabase
    const response = await fetch(restUrl, {
      headers: {
        'apikey': remoteKey,
        'Authorization': `Bearer ${remoteKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Remote Supabase error:', response.status, errorText)
      return new Response(JSON.stringify({ error: 'Erro ao buscar dados do data source', details: errorText }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()

    // Cache the result
    const ttl = dashboard.cache_ttl_seconds || 300
    setCache(cacheKey, data, ttl)

    console.log(`Fetched ${data.length} rows from ${dashboard.view_name}`)

    return new Response(JSON.stringify({ data, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in dashboard-data:', error)
    return new Response(JSON.stringify({ error: 'Erro interno', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
