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

interface ViewInfo {
  name: string
  schema: string
  type: 'view' | 'table'
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

    // Check user is admin
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: adminRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'Apenas administradores podem introspeccionar data sources' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data_source_id, schema = 'public' } = await req.json()

    if (!data_source_id) {
      return new Response(JSON.stringify({ error: 'data_source_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get data source with encrypted keys
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('*')
      .eq('id', data_source_id)
      .single()

    if (dsError || !dataSource) {
      return new Response(JSON.stringify({ error: 'Data source não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determine which key to use
    let apiKey: string | null = null

    // Try anon key first (preferred for readonly)
    if (dataSource.anon_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.anon_key_encrypted)
      } catch (e) {
        console.error('Failed to decrypt anon_key')
      }
    }

    // Fallback to service role if no anon key
    if (!apiKey && dataSource.service_role_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.service_role_key_encrypted)
      } catch (e) {
        console.error('Failed to decrypt service_role_key')
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
      return new Response(JSON.stringify({ 
        error: 'Credenciais não configuradas. Configure a anon_key ou service_role_key.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Query the remote Supabase for views and tables
    // Using the REST API to query pg_catalog
    const introspectUrl = `${dataSource.project_url}/rest/v1/rpc/get_schema_objects`
    
    // First try with RPC function (if exists)
    let views: ViewInfo[] = []
    let tables: ViewInfo[] = []

    // Alternative: Query information_schema via REST
    // We'll use a direct approach - fetch the OpenAPI spec which lists all endpoints
    const openApiUrl = `${dataSource.project_url}/rest/v1/`
    
    console.log('Introspecting:', openApiUrl)

    const response = await fetch(openApiUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Introspection failed:', response.status, errorText)
      return new Response(JSON.stringify({ 
        error: `Erro ao conectar: ${response.status}`,
        details: errorText.slice(0, 200)
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // The REST API root returns an object with all available endpoints
    // Format: { "definitions": {...}, "paths": { "/tablename": {...}, ... } }
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

    return new Response(JSON.stringify({ 
      views,
      tables,
      schema,
      total: views.length + tables.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in introspect-datasource:', error)
    return new Response(JSON.stringify({ error: 'Erro interno', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
