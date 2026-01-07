import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// View mapping by context/section
const VIEW_CONFIG = {
  // Main executive dashboard
  executive: {
    kpis: 'vw_dashboard_kpis_30d_v3',
    daily: 'vw_dashboard_daily_60d_v3',
    funnel: 'vw_funnel_current_exec',
  },
  // Traffic/Ads section
  trafego: {
    kpis_7d: 'vw_trafego_kpis_7d',
    kpis_30d: 'vw_trafego_kpis_30d',
    daily: 'vw_trafego_daily_30d',
    top_ads: 'vw_spend_top_ads_30d_v2',
  },
  // AI Agent section
  agente: {
    kpis_7d: 'vw_agente_kpis_7d',
    kpis_30d: 'vw_agente_kpis_30d',
  },
  // Messages/Conversations
  mensagens: {
    heatmap: 'vw_kommo_msg_in_heatmap_30d_v3',
  },
  // Meetings
  reunioes: {
    upcoming: 'vw_meetings_upcoming_v3',
  },
  // Calls (VAPI)
  ligacoes: {
    kpis_7d: 'vw_calls_kpis_7d',
    kpis_30d: 'vw_calls_kpis_30d',
    daily: 'vw_calls_daily_30d',
    recent: 'vw_calls_last_50',
  },
  // Admin/Mapping
  admin: {
    coverage: 'vw_funnel_mapping_coverage',
    unmapped: 'vw_funnel_unmapped_candidates',
  },
  // Legacy compatibility - original view
  legacy: {
    main: 'vw_afonsina_custos_funil_dia',
  },
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

function getCacheKey(dashboardId: string, section: string, start: string, end: string): string {
  return `${dashboardId}:${section}:${start}:${end}`
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

// Fetch data from a specific view
async function fetchFromView(
  remoteUrl: string,
  remoteKey: string,
  viewName: string,
  orgId: string | null,
  start: string | null,
  end: string | null,
  limit: string,
  dateColumn: string = 'dia'
): Promise<{ data: any[]; error: string | null }> {
  try {
    let restUrl = `${remoteUrl}/rest/v1/${viewName}?select=*`
    
    // Filter by org_id if provided
    if (orgId) {
      restUrl += `&org_id=eq.${orgId}`
    }
    
    // Date filters - only apply if the view likely has the date column
    const hasDateColumn = !viewName.includes('upcoming') && 
                          !viewName.includes('last_50') && 
                          !viewName.includes('coverage') &&
                          !viewName.includes('unmapped') &&
                          !viewName.includes('heatmap')
    
    if (hasDateColumn && start) {
      restUrl += `&${dateColumn}=gte.${start}`
    }
    if (hasDateColumn && end) {
      restUrl += `&${dateColumn}=lte.${end}`
    }
    
    // Order by date if applicable
    if (hasDateColumn) {
      restUrl += `&order=${dateColumn}.asc`
    }
    
    restUrl += `&limit=${limit}`

    console.log(`Fetching view ${viewName}:`, restUrl)

    const response = await fetchWithTimeout(restUrl, {
      headers: {
        'apikey': remoteKey,
        'Authorization': `Bearer ${remoteKey}`,
        'Content-Type': 'application/json'
      }
    }, 10000)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`View ${viewName} error:`, response.status, errorText)
      return { data: [], error: `${viewName}: ${response.status}` }
    }

    const data = await response.json()
    console.log(`View ${viewName} returned ${data.length} rows`)
    return { data, error: null }
  } catch (error) {
    console.error(`View ${viewName} fetch error:`, error)
    return { data: [], error: String(error) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('No authorization header provided')
      return new Response(JSON.stringify({ error: 'Não autorizado', error_type: 'auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create client with the user's JWT for validation
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Validate user with getUser
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.log('JWT validation failed:', userError?.message)
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado', error_type: 'auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = user.id
    console.log(`Authenticated user: ${userId}`)

    // Rate limiting by user
    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: 'Muitas requisições. Tente novamente em 1 minuto.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse parameters
    let dashboardId: string | null = null
    let start: string | null = null
    let end: string | null = null
    let limit: string = '1000'
    let section: string = 'all' // New: which section to fetch
    let orgId: string | null = null // New: org_id filter

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        dashboardId = body.dashboard_id
        start = body.start
        end = body.end
        limit = body.limit || '1000'
        section = body.section || 'all'
        orgId = body.org_id || null
      } catch (e) {
        console.error('Failed to parse request body:', e)
        return new Response(JSON.stringify({ error: 'Corpo da requisição inválido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      const url = new URL(req.url)
      dashboardId = url.searchParams.get('dashboard_id')
      start = url.searchParams.get('start')
      end = url.searchParams.get('end')
      limit = url.searchParams.get('limit') || '1000'
      section = url.searchParams.get('section') || 'all'
      orgId = url.searchParams.get('org_id')
    }

    if (!dashboardId) {
      return new Response(JSON.stringify({ error: 'dashboard_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Fetching dashboard ${dashboardId}, section: ${section}, period: ${start} to ${end}, org_id: ${orgId}`)

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

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

    // Check user access
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .maybeSingle()

    if (!profile || profile.tenant_id !== dashboard.tenant_id) {
      const { data: role } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle()

      if (!role) {
        return new Response(JSON.stringify({ error: 'Acesso negado' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    if (dashboard.source_kind !== 'supabase_view') {
      return new Response(JSON.stringify({ error: 'Este dashboard não é do tipo supabase_view' }), {
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

    // Check cache
    const cacheKey = getCacheKey(dashboardId, section, start || '', end || '')
    const cachedData = getFromCache(cacheKey)
    if (cachedData) {
      console.log('Returning cached data for', cacheKey)
      return new Response(JSON.stringify({ ...cachedData, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get credentials
    const remoteUrl = dataSource.project_url
    let remoteKey: string | null = null

    if (dataSource.anon_key_encrypted) {
      try {
        remoteKey = await decrypt(dataSource.anon_key_encrypted)
        console.log('Successfully decrypted anon_key')
      } catch (e) {
        console.error('Failed to decrypt anon_key:', e)
      }
    }

    if (!remoteKey && dataSource.service_role_key_encrypted) {
      try {
        remoteKey = await decrypt(dataSource.service_role_key_encrypted)
        console.log('Successfully decrypted service_role_key')
      } catch (e) {
        console.error('Failed to decrypt service_role_key:', e)
      }
    }

    // Fallback to Afonsina env keys
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
      return new Response(JSON.stringify({ 
        error: 'Credenciais do data source não configuradas',
        error_type: 'config'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determine which views to fetch based on section
    const allowedViews = dataSource.allowed_views || []
    const result: Record<string, any> = {}
    const errors: string[] = []

    // Helper to check if view is allowed
    const isAllowed = (view: string) => allowedViews.includes(view)

    if (section === 'all' || section === 'executive') {
      // Fetch executive views
      const execViews = VIEW_CONFIG.executive
      
      if (isAllowed(execViews.kpis)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, execViews.kpis, orgId, null, null, '100')
        result.kpis = data
        if (error) errors.push(error)
      }
      
      if (isAllowed(execViews.daily)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, execViews.daily, orgId, start, end, limit)
        result.daily = data
        // Also set as main 'data' for backwards compatibility
        result.data = data
        if (error) errors.push(error)
      }
      
      if (isAllowed(execViews.funnel)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, execViews.funnel, orgId, null, null, '50')
        result.funnel = data
        if (error) errors.push(error)
      }
    }

    if (section === 'all' || section === 'trafego') {
      const trafegoViews = VIEW_CONFIG.trafego
      
      if (isAllowed(trafegoViews.kpis_30d)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, trafegoViews.kpis_30d, orgId, null, null, '100')
        result.trafego_kpis = data
        if (error) errors.push(error)
      }
      
      if (isAllowed(trafegoViews.daily)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, trafegoViews.daily, orgId, start, end, limit)
        result.trafego_daily = data
        if (error) errors.push(error)
      }
      
      if (isAllowed(trafegoViews.top_ads)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, trafegoViews.top_ads, orgId, null, null, '20')
        result.top_ads = data
        if (error) errors.push(error)
      }
    }

    if (section === 'all' || section === 'agente') {
      const agenteViews = VIEW_CONFIG.agente
      
      if (isAllowed(agenteViews.kpis_30d)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, agenteViews.kpis_30d, orgId, null, null, '100')
        result.agente_kpis = data
        if (error) errors.push(error)
      }
    }

    if (section === 'all' || section === 'mensagens') {
      const msgViews = VIEW_CONFIG.mensagens
      
      if (isAllowed(msgViews.heatmap)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, msgViews.heatmap, orgId, null, null, '500')
        result.heatmap = data
        if (error) errors.push(error)
      }
    }

    if (section === 'all' || section === 'reunioes') {
      const reunioesViews = VIEW_CONFIG.reunioes
      
      if (isAllowed(reunioesViews.upcoming)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, reunioesViews.upcoming, orgId, null, null, '50')
        result.reunioes = data
        if (error) errors.push(error)
      }
    }

    if (section === 'all' || section === 'ligacoes') {
      const ligacoesViews = VIEW_CONFIG.ligacoes
      
      if (isAllowed(ligacoesViews.kpis_30d)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, ligacoesViews.kpis_30d, orgId, null, null, '100')
        result.ligacoes_kpis = data
        if (error) errors.push(error)
      }
      
      if (isAllowed(ligacoesViews.daily)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, ligacoesViews.daily, orgId, start, end, limit)
        result.ligacoes_daily = data
        if (error) errors.push(error)
      }
      
      if (isAllowed(ligacoesViews.recent)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, ligacoesViews.recent, orgId, null, null, '50')
        result.ligacoes_recent = data
        if (error) errors.push(error)
      }
    }

    if (section === 'admin') {
      const adminViews = VIEW_CONFIG.admin
      
      if (isAllowed(adminViews.coverage)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, adminViews.coverage, orgId, null, null, '500')
        result.coverage = data
        if (error) errors.push(error)
      }
      
      if (isAllowed(adminViews.unmapped)) {
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, adminViews.unmapped, orgId, null, null, '500')
        result.unmapped = data
        if (error) errors.push(error)
      }
    }

    // Legacy fallback: if no data yet and legacy view is allowed, fetch it
    if (!result.data && !result.daily && dashboard.view_name) {
      if (isAllowed(dashboard.view_name)) {
        console.log('Using legacy view:', dashboard.view_name)
        const { data, error } = await fetchFromView(remoteUrl, remoteKey, dashboard.view_name, orgId, start, end, limit)
        result.data = data
        if (error) errors.push(error)
      }
    }

    // Cache the result
    const ttl = dashboard.cache_ttl_seconds || 300
    setCache(cacheKey, result, ttl)

    // Log any errors but still return data
    if (errors.length > 0) {
      console.warn('Some views had errors:', errors)
    }

    return new Response(JSON.stringify({ ...result, cached: false, errors: errors.length > 0 ? errors : undefined }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in dashboard-data:', error)
    return new Response(JSON.stringify({ 
      error: 'Erro interno', 
      details: String(error),
      error_type: 'internal'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
