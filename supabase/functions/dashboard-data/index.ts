import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

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

    const url = new URL(req.url)
    const dashboardId = url.searchParams.get('dashboard_id')
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')
    const limit = url.searchParams.get('limit') || '1000'

    if (!dashboardId) {
      return new Response(JSON.stringify({ error: 'dashboard_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

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

    // Handle different data source types
    const dataSourceType = dataSource.type || 'supabase'
    
    let data: any[]

    if (dataSourceType === 'proxy_webhook') {
      // ============================================================
      // PROXY/WEBHOOK MODE - Call the proxy's /query endpoint
      // ============================================================
      console.log('Using proxy_webhook mode for data source:', dataSource.name)
      
      const baseUrl = dataSource.base_url
      if (!baseUrl) {
        return new Response(JSON.stringify({ error: 'Base URL do proxy não configurada' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
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
          return new Response(JSON.stringify({ 
            error: 'Tempo esgotado', 
            details: 'O proxy não respondeu em tempo hábil',
            error_type: 'timeout'
          }), {
            status: 504,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        return new Response(JSON.stringify({ 
          error: 'Falha ao conectar ao proxy', 
          details: errorMessage,
          error_type: 'network'
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (!proxyResponse.ok) {
        const errorText = await proxyResponse.text()
        console.error('Proxy error:', proxyResponse.status, errorText)
        return new Response(JSON.stringify({ 
          error: `Proxy retornou erro ${proxyResponse.status}`, 
          details: errorText.slice(0, 200),
          error_type: 'proxy_error'
        }), {
          status: proxyResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const proxyResult = await proxyResponse.json()
      
      // Handle proxy response format: { ok: true, rows: [...] } or { ok: true, data: [...] }
      if (proxyResult.ok === false) {
        return new Response(JSON.stringify({ 
          error: proxyResult.message || 'Erro do proxy', 
          details: proxyResult.details,
          error_type: 'proxy_error'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Extract rows from response
      data = proxyResult.rows || proxyResult.data || []
      console.log(`Proxy returned ${data.length} rows`)

    } else {
      // ============================================================
      // SUPABASE DIRECT MODE - Use encrypted credentials
      // ============================================================
      console.log('Using supabase direct mode for data source:', dataSource.name)
      
      // Get credentials - try encrypted keys first
      const remoteUrl = dataSource.project_url
      let remoteKey: string | null = null

      // Try anon key first (preferred)
      if (dataSource.anon_key_encrypted) {
        try {
          remoteKey = await decrypt(dataSource.anon_key_encrypted)
        } catch (e) {
          console.error('Failed to decrypt anon_key')
        }
      }

      // Fallback to service role key
      if (!remoteKey && dataSource.service_role_key_encrypted) {
        try {
          remoteKey = await decrypt(dataSource.service_role_key_encrypted)
        } catch (e) {
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
        }
      }

      if (!remoteKey) {
        return new Response(JSON.stringify({ error: 'Credenciais do data source não configuradas' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Build REST API URL
      let restUrl = `${remoteUrl}/rest/v1/${dashboard.view_name}?select=*`
      
      if (start) {
        restUrl += `&dia=gte.${start}`
      }
      if (end) {
        restUrl += `&dia=lte.${end}`
      }
      
      restUrl += `&order=dia.asc`
      restUrl += `&limit=${limit}`

      console.log('Fetching from Supabase:', restUrl)

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
        return new Response(JSON.stringify({ 
          error: 'Erro ao buscar dados do Supabase', 
          details: errorText.slice(0, 200),
          error_type: 'supabase_error'
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      data = await response.json()
      console.log(`Supabase returned ${data.length} rows`)
    }

    // Cache the result
    const ttl = dashboard.cache_ttl_seconds || 300
    setCache(cacheKey, data, ttl)

    return new Response(JSON.stringify({ data, cached: false }), {
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
