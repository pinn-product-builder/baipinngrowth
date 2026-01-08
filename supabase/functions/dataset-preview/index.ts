// Dataset Preview Edge Function - for testing datasets before dashboard creation
import { createClient } from 'npm:@supabase/supabase-js@2'

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

// Validate identifiers to prevent injection
function isValidIdentifier(name: string): boolean {
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

    // Validate relation name
    if (!isValidIdentifier(relationName)) {
      return new Response(JSON.stringify({ 
        ok: false,
        error: { code: 'INVALID_IDENTIFIER', message: 'Nome da view/tabela inválido' },
        trace_id: traceId
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get credentials
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

