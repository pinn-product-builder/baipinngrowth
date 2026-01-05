import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Check user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: adminRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'Apenas administradores podem testar data sources' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const body = await req.json()
    const { data_source_id, view_name } = body

    if (!data_source_id) {
      return new Response(JSON.stringify({ error: 'data_source_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch data source
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('*')
      .eq('id', data_source_id)
      .maybeSingle()

    if (dsError || !dataSource) {
      return new Response(JSON.stringify({ error: 'Data source não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get credentials
    let remoteUrl = dataSource.project_url
    let remoteKey = ''

    const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
    const afonsinaServiceKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY')
    
    if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
      remoteKey = afonsinaServiceKey || ''
    }

    if (!remoteKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Credenciais não configuradas para este data source' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Test view if provided, otherwise test connection
    const testView = view_name || (dataSource.allowed_views.length > 0 ? dataSource.allowed_views[0] : null)
    
    if (!testView) {
      // Just test basic connection to the API
      const testUrl = `${remoteUrl}/rest/v1/`
      const response = await fetch(testUrl, {
        headers: {
          'apikey': remoteKey,
          'Authorization': `Bearer ${remoteKey}`,
        }
      })

      if (response.ok || response.status === 404) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Conexão estabelecida com sucesso (nenhuma view para testar)' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Erro de conexão: ${response.status}` 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Test the specific view
    const restUrl = `${remoteUrl}/rest/v1/${testView}?select=*&limit=1`
    console.log('Testing:', restUrl)

    const response = await fetch(restUrl, {
      headers: {
        'apikey': remoteKey,
        'Authorization': `Bearer ${remoteKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Test failed:', response.status, errorText)
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Erro ao acessar view: ${response.status}`,
        details: errorText
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    const rowCount = Array.isArray(data) ? data.length : 0
    const columns = rowCount > 0 ? Object.keys(data[0]) : []

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Conexão OK! View "${testView}" acessível.`,
      sample_row_count: rowCount,
      columns: columns
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in test-data-source:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Erro interno', 
      details: String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
