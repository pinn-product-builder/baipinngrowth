// Dashboard Data Edge Function - v2 with direct view support
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// View configuration with date column info
// Based on official data source documentation
const VIEW_CONFIG: Record<string, { views: Record<string, { name: string; dateColumn?: string; hasDateFilter?: boolean; orderBy?: string }> }> = {
  executive: {
    views: {
      // KPIs - 7d and 30d aggregates
      kpis_7d: { name: 'vw_dashboard_kpis_7d_v3', hasDateFilter: false },
      kpis_30d: { name: 'vw_dashboard_kpis_30d_v3', hasDateFilter: false },
      // Time series - 60 days
      daily: { name: 'vw_dashboard_daily_60d_v3', dateColumn: 'day', hasDateFilter: true, orderBy: 'day.desc' },
      // Funnel
      funnel: { name: 'vw_funnel_current_v3', hasDateFilter: false, orderBy: 'stage_rank.asc' },
      // Upcoming meetings
      meetings: { name: 'vw_meetings_upcoming_v3', hasDateFilter: false, orderBy: 'start_at.asc' },
      // Calls KPIs
      calls_7d: { name: 'vw_calls_kpis_7d', hasDateFilter: false },
      calls_30d: { name: 'vw_calls_kpis_30d', hasDateFilter: false },
      // AI insights
      ai_insights: { name: 'ai_insights', hasDateFilter: false, orderBy: 'created_at.desc' },
    }
  },
  trafego: {
    views: {
      kpis_30d: { name: 'vw_trafego_kpis_30d', hasDateFilter: false },
      daily: { name: 'vw_trafego_daily_30d', dateColumn: 'dia', hasDateFilter: true },
      top_ads: { name: 'vw_spend_top_ads_30d_v2', hasDateFilter: false },
    }
  },
  agente: {
    views: {
      kpis_30d: { name: 'vw_agente_kpis_30d', hasDateFilter: false },
    }
  },
  mensagens: {
    views: {
      heatmap: { name: 'vw_kommo_msg_in_heatmap_30d_v3', hasDateFilter: false },
    }
  },
  reunioes: {
    views: {
      upcoming: { name: 'vw_meetings_upcoming_v3', hasDateFilter: false, orderBy: 'start_at.asc' },
    }
  },
  ligacoes: {
    views: {
      kpis_7d: { name: 'vw_calls_kpis_7d', hasDateFilter: false },
      kpis_30d: { name: 'vw_calls_kpis_30d', hasDateFilter: false },
      daily: { name: 'vw_calls_daily_30d', dateColumn: 'dia', hasDateFilter: true },
      recent: { name: 'vw_calls_last_50', hasDateFilter: false },
    }
  },
  admin: {
    views: {
      coverage: { name: 'vw_funnel_mapping_coverage', hasDateFilter: false },
      unmapped: { name: 'vw_funnel_unmapped_candidates', hasDateFilter: false },
    }
  },
  legacy: {
    views: {
      main: { name: 'vw_afonsina_custos_funil_dia', dateColumn: 'dia', hasDateFilter: true },
    }
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
  dateColumn: string | null = null,
  hasDateFilter: boolean = false,
  orderBy: string | null = null
): Promise<{ data: any[]; error: string | null }> {
  try {
    let restUrl = `${remoteUrl}/rest/v1/${viewName}?select=*`
    
    // Filter by org_id if provided
    if (orgId) {
      restUrl += `&org_id=eq.${orgId}`
    }
    
    // For ai_insights, filter by scope='executivo'
    if (viewName === 'ai_insights') {
      restUrl += `&scope=eq.executivo`
    }
    
    // Date filters - only apply if view has date filtering
    if (hasDateFilter && dateColumn) {
      if (start) {
        restUrl += `&${dateColumn}=gte.${start}`
      }
      if (end) {
        restUrl += `&${dateColumn}=lte.${end}`
      }
    }
    
    // Apply order - use custom orderBy or fallback to dateColumn
    if (orderBy) {
      restUrl += `&order=${orderBy}`
    } else if (hasDateFilter && dateColumn) {
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
      
      // Parse PostgREST error for better messaging
      let errorMessage = `${viewName}: ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.code === 'PGRST205') {
          errorMessage = `View/tabela '${viewName}' não existe no banco externo`
          if (errorJson.hint) {
            errorMessage += `. ${errorJson.hint}`
          }
        } else if (errorJson.message) {
          errorMessage = errorJson.message
        }
      } catch (e) {
        // Keep original error message
      }
      
      return { data: [], error: errorMessage }
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
    let section: string = 'legacy' // Default to legacy for backwards compatibility
    let orgId: string | null = null
    let directView: string | null = null // For direct view access without dashboard

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        dashboardId = body.dashboard_id
        start = body.start
        end = body.end
        limit = body.limit || '1000'
        section = body.section || 'legacy'
        orgId = body.orgId || body.org_id || null
        directView = body.view || null
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
      section = url.searchParams.get('section') || 'legacy'
      orgId = url.searchParams.get('org_id')
      directView = url.searchParams.get('view')
    }

    // Support direct view access (without dashboard_id) - uses user's tenant context
    if (!dashboardId && directView) {
      console.log(`Direct view access: ${directView}, period: ${start} to ${end}, org_id: ${orgId}`)
      
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const adminClient = createClient(supabaseUrl, supabaseServiceKey)
      
      // Get user's tenant and data source
      const { data: profile } = await adminClient
        .from('profiles')
        .select('tenant_id')
        .eq('id', userId)
        .maybeSingle()
      
      if (!profile?.tenant_id) {
        return new Response(JSON.stringify({ error: 'Usuário sem tenant associado' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      // Get the active data source for this tenant
      let dataSource = null
      const { data: tenantDataSource, error: dsError } = await adminClient
        .from('tenant_data_sources')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_active', true)
        .maybeSingle()
      
      if (tenantDataSource) {
        dataSource = tenantDataSource
        console.log(`Using tenant data source: ${tenantDataSource.name}`)
      } else {
        // Fallback: get the Afonsina data source (or any active one) as default
        const { data: defaultDataSource } = await adminClient
          .from('tenant_data_sources')
          .select('*')
          .eq('is_active', true)
          .eq('name', 'Afonsina')
          .maybeSingle()
        
        if (defaultDataSource) {
          dataSource = defaultDataSource
          console.log(`Using default Afonsina data source`)
        } else {
          // Get any active data source
          const { data: anyDataSource } = await adminClient
            .from('tenant_data_sources')
            .select('*')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()
          
          dataSource = anyDataSource
          if (anyDataSource) {
            console.log(`Using fallback data source: ${anyDataSource.name}`)
          }
        }
      }
      
      if (!dataSource) {
        console.error('No active data source found')
        return new Response(JSON.stringify({ error: 'Nenhum data source ativo encontrado' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      // Get credentials
      const remoteUrl = dataSource.project_url
      let remoteKey: string | null = null

      if (dataSource.anon_key_encrypted) {
        try {
          remoteKey = await decrypt(dataSource.anon_key_encrypted)
          console.log('Successfully decrypted anon_key for direct view')
        } catch (e) {
          console.error('Failed to decrypt anon_key:', e)
        }
      }

      if (!remoteKey && dataSource.service_role_key_encrypted) {
        try {
          remoteKey = await decrypt(dataSource.service_role_key_encrypted)
          console.log('Successfully decrypted service_role_key for direct view')
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
          console.log('Using Afonsina fallback keys for direct view')
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
      
      // Fetch the view directly without date filtering first to discover columns
      // Then filter if date column is provided in request
      const url = new URL(req.url)
      const dateColumn = req.method === 'POST' 
        ? (await req.clone().json()).date_column 
        : url.searchParams.get('date_column')
      
      const result = await fetchFromView(
        remoteUrl,
        remoteKey,
        directView,
        null, // Don't filter by org_id - view is already tenant-scoped
        dateColumn ? start : null,  // Only filter by date if column is specified
        dateColumn ? end : null,
        limit,
        dateColumn || null,
        !!dateColumn
      )
      
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      return new Response(JSON.stringify({ 
        data: result.data,
        view: directView,
        tenant_id: profile.tenant_id,
        rows_returned: result.data.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!dashboardId) {
      return new Response(JSON.stringify({ error: 'dashboard_id ou view é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
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

    // Helper to check if view is allowed
    const allowedViews = dataSource.allowed_views || []
    const isAllowed = (view: string) => allowedViews.includes(view)

    // For backwards compatibility: if section is 'legacy' or not specified, 
    // use the dashboard's view_name directly
    if (section === 'legacy' || !section) {
      const viewName = dashboard.view_name
      if (!viewName) {
        return new Response(JSON.stringify({ error: 'Dashboard não tem view_name configurado' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (!isAllowed(viewName)) {
        return new Response(JSON.stringify({ error: 'View não permitida' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Extract time column from dashboard_spec
      let timeColumn = 'dia' // default fallback
      const spec = dashboard.dashboard_spec as Record<string, any> | null
      if (spec?.time?.column) {
        timeColumn = spec.time.column
      } else if (spec?.columns) {
        // Find column with semantic_type 'date' or type containing 'date'
        const dateCol = (spec.columns as any[]).find((c: any) => 
          c.semantic_type === 'date' || 
          c.type?.includes('date') ||
          c.role_hint === 'time' ||
          c.name?.toLowerCase().includes('created') ||
          c.name?.toLowerCase().includes('date') ||
          c.name?.toLowerCase().includes('dia')
        )
        if (dateCol) {
          timeColumn = dateCol.name
        }
      }

      console.log('Using legacy mode with view:', viewName, 'time_column:', timeColumn, 'datasource:', dataSource.name, 'project_url:', remoteUrl)
      
      const { data, error } = await fetchFromView(
        remoteUrl, 
        remoteKey, 
        viewName, 
        orgId, 
        start, 
        end, 
        limit,
        timeColumn,
        true
      )

      if (error) {
        console.error('Legacy view error:', error)
        return new Response(JSON.stringify({ 
          error: `Falha ao buscar dados: ${error}`,
          error_type: 'fetch_error',
          debug: {
            view: viewName,
            time_column: timeColumn,
            datasource: dataSource.name,
            project_url: remoteUrl,
            start,
            end
          }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Cache the result
      const ttl = dashboard.cache_ttl_seconds || 300
      const resultData = { 
        data, 
        rows_returned: data.length,
        debug: {
          view: viewName,
          time_column: timeColumn,
          datasource_name: dataSource.name,
          project_ref: dataSource.project_ref,
          period: { start, end }
        }
      }
      setCache(cacheKey, resultData, ttl)

      return new Response(JSON.stringify({ ...resultData, cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Handle section-based fetching for new views
    const result: Record<string, any> = {}
    const errors: string[] = []

    // Fetch views based on section
    const sectionConfig = VIEW_CONFIG[section]
    if (sectionConfig) {
      for (const [key, viewConfig] of Object.entries(sectionConfig.views)) {
        if (isAllowed(viewConfig.name)) {
          const { data, error } = await fetchFromView(
            remoteUrl,
            remoteKey,
            viewConfig.name,
            orgId,
            start,
            end,
            limit,
            viewConfig.dateColumn || null,
            viewConfig.hasDateFilter || false,
            viewConfig.orderBy || null
          )
          result[key] = data
          if (error) errors.push(error)
        }
      }
    }

    // If section is 'all', fetch from multiple sections
    if (section === 'all') {
      for (const [sectionName, sectionConf] of Object.entries(VIEW_CONFIG)) {
        if (sectionName === 'legacy') continue // Skip legacy in 'all' mode
        
        for (const [key, viewConfig] of Object.entries(sectionConf.views)) {
          if (isAllowed(viewConfig.name)) {
            const resultKey = sectionName === 'executive' ? key : `${sectionName}_${key}`
            const { data, error } = await fetchFromView(
              remoteUrl,
              remoteKey,
              viewConfig.name,
              orgId,
              start,
              end,
              limit,
              viewConfig.dateColumn || null,
              viewConfig.hasDateFilter || false,
              viewConfig.orderBy || null
            )
            result[resultKey] = data
            // For backwards compatibility, set 'data' from daily view
            if (key === 'daily' && sectionName === 'executive') {
              result.data = data
            }
            if (error) errors.push(error)
          }
        }
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
