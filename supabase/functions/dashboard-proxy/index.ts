import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW_MS = 60000
const DEFAULT_RATE_LIMIT = 30

function checkRateLimit(identifier: string, limit: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  
  if (record.count >= limit) {
    return false
  }
  
  record.count++
  return true
}

// Anti-SSRF: Validate URL is safe
function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  try {
    const url = new URL(urlString)
    
    // Must be HTTPS
    if (url.protocol !== 'https:') {
      return { safe: false, reason: 'Apenas HTTPS é permitido' }
    }
    
    // Block private IPs and localhost
    const hostname = url.hostname.toLowerCase()
    
    // Block localhost variants
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.localhost')) {
      return { safe: false, reason: 'Acesso a localhost não permitido' }
    }
    
    // Block private IP ranges
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
    if (ipPattern.test(hostname)) {
      const parts = hostname.split('.').map(Number)
      
      // 10.x.x.x
      if (parts[0] === 10) {
        return { safe: false, reason: 'Acesso a IPs privados não permitido' }
      }
      
      // 172.16.x.x - 172.31.x.x
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
        return { safe: false, reason: 'Acesso a IPs privados não permitido' }
      }
      
      // 192.168.x.x
      if (parts[0] === 192 && parts[1] === 168) {
        return { safe: false, reason: 'Acesso a IPs privados não permitido' }
      }
      
      // 169.254.x.x (link-local)
      if (parts[0] === 169 && parts[1] === 254) {
        return { safe: false, reason: 'Acesso a IPs link-local não permitido' }
      }
    }
    
    // Block internal cloud metadata endpoints
    if (hostname === '169.254.169.254' || 
        hostname === 'metadata.google.internal' ||
        hostname.includes('.internal')) {
      return { safe: false, reason: 'Acesso a endpoints de metadata não permitido' }
    }
    
    return { safe: true }
  } catch {
    return { safe: false, reason: 'URL inválida' }
  }
}

// Check if domain is in allowlist
function isDomainAllowed(urlString: string, allowlist: string[]): boolean {
  if (!allowlist || allowlist.length === 0) {
    return true // No restrictions
  }
  
  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase()
    
    return allowlist.some(allowed => {
      const normalizedAllowed = allowed.toLowerCase().trim()
      // Exact match or subdomain match
      return hostname === normalizedAllowed || 
             hostname.endsWith('.' + normalizedAllowed)
    })
  } catch {
    return false
  }
}

const TIMEOUT_MS = 15000

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
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

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request
    const { dashboard_id } = await req.json()

    if (!dashboard_id) {
      return new Response(JSON.stringify({ error: 'dashboard_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role for admin queries
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch dashboard
    const { data: dashboard, error: dashboardError } = await adminClient
      .from('dashboards')
      .select('*, tenants(rate_limit_per_minute, domain_allowlist)')
      .eq('id', dashboard_id)
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

    // Rate limit by tenant
    const tenantRateLimit = dashboard.tenants?.rate_limit_per_minute || DEFAULT_RATE_LIMIT
    const rateLimitKey = `tenant:${dashboard.tenant_id}`
    if (!checkRateLimit(rateLimitKey, tenantRateLimit)) {
      return new Response(JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em 1 minuto.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate proxy is enabled
    if (!dashboard.use_proxy) {
      return new Response(JSON.stringify({ error: 'Proxy não habilitado para este dashboard' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate webhook URL
    if (!dashboard.webhook_url) {
      return new Response(JSON.stringify({ error: 'URL não configurada' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Anti-SSRF validation
    const urlCheck = isUrlSafe(dashboard.webhook_url)
    if (!urlCheck.safe) {
      console.warn(`SSRF attempt blocked: ${dashboard.webhook_url} - ${urlCheck.reason}`)
      return new Response(JSON.stringify({ error: urlCheck.reason }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check domain allowlist (tenant-level + dashboard-level)
    const tenantAllowlist = dashboard.tenants?.domain_allowlist || []
    const dashboardAllowlist = dashboard.allowed_domains || []
    const combinedAllowlist = [...tenantAllowlist, ...dashboardAllowlist]
    
    if (combinedAllowlist.length > 0 && !isDomainAllowed(dashboard.webhook_url, combinedAllowlist)) {
      console.warn(`Domain not in allowlist: ${dashboard.webhook_url}`)
      return new Response(JSON.stringify({ error: 'Domínio não está na lista de permitidos' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Proxying request for dashboard ${dashboard_id} to ${dashboard.webhook_url}`)

    // Make proxied request
    let response: Response
    try {
      response = await fetchWithTimeout(dashboard.webhook_url, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/json,*/*',
          'User-Agent': 'BAI-Analytics-Proxy/1.0'
        }
      }, TIMEOUT_MS)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      
      if (error instanceof Error && error.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Tempo esgotado',
          details: `Requisição expirou após ${TIMEOUT_MS / 1000} segundos`,
          error_type: 'timeout'
        }), {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      return new Response(JSON.stringify({ 
        error: 'Falha na conexão',
        details: errorMessage,
        error_type: 'network'
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!response.ok) {
      return new Response(JSON.stringify({ 
        error: `Servidor retornou ${response.status}`,
        error_type: 'server_error'
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const contentType = response.headers.get('content-type') || ''
    
    // Return content based on type
    if (contentType.includes('application/json')) {
      const jsonData = await response.json()
      return new Response(JSON.stringify({ 
        content: jsonData, 
        content_type: 'json' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      const htmlContent = await response.text()
      return new Response(JSON.stringify({ 
        content: htmlContent, 
        content_type: 'html' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('Error in dashboard-proxy:', error)
    return new Response(JSON.stringify({ error: 'Erro interno', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
