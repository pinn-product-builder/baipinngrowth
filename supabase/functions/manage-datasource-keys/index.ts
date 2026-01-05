import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Encryption helpers using Web Crypto API
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
    ['encrypt', 'decrypt']
  )
  return keyMaterial
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )
  
  // Combine IV + ciphertext and base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  
  return btoa(String.fromCharCode(...combined))
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey()
  
  // Base64 decode
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  
  // Extract IV and ciphertext
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  )
  
  return new TextDecoder().decode(decrypted)
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

    // Check user is admin
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: adminRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'Apenas administradores podem gerenciar credenciais' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data_source_id, anon_key, service_role_key, action } = await req.json()

    if (!data_source_id) {
      return new Response(JSON.stringify({ error: 'data_source_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify data source exists
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('id, project_url, anon_key_present, service_role_key_present')
      .eq('id', data_source_id)
      .maybeSingle()

    if (dsError || !dataSource) {
      return new Response(JSON.stringify({ error: 'Data source não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Handle actions
    if (action === 'set_keys') {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }

      if (anon_key) {
        updates.anon_key_encrypted = await encrypt(anon_key)
        updates.anon_key_present = true
      }

      if (service_role_key) {
        updates.service_role_key_encrypted = await encrypt(service_role_key)
        updates.service_role_key_present = true
      }

      const { error: updateError } = await adminClient
        .from('tenant_data_sources')
        .update(updates)
        .eq('id', data_source_id)

      if (updateError) {
        console.error('Error updating keys:', updateError)
        return new Response(JSON.stringify({ error: 'Erro ao salvar credenciais' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      console.log(`Keys updated for data source ${data_source_id}`)
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Credenciais salvas com sucesso',
        anon_key_present: !!anon_key || dataSource.anon_key_present,
        service_role_key_present: !!service_role_key || dataSource.service_role_key_present
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'remove_keys') {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }

      if (anon_key === null) {
        updates.anon_key_encrypted = null
        updates.anon_key_present = false
      }

      if (service_role_key === null) {
        updates.service_role_key_encrypted = null
        updates.service_role_key_present = false
      }

      const { error: updateError } = await adminClient
        .from('tenant_data_sources')
        .update(updates)
        .eq('id', data_source_id)

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Erro ao remover credenciais' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Credenciais removidas' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'get_decrypted') {
      // This is only for internal use by other edge functions
      // Never expose this to frontend
      const { data: ds } = await adminClient
        .from('tenant_data_sources')
        .select('anon_key_encrypted, service_role_key_encrypted')
        .eq('id', data_source_id)
        .single()

      if (!ds) {
        return new Response(JSON.stringify({ error: 'Data source não encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const result: Record<string, string | null> = {
        anon_key: null,
        service_role_key: null
      }

      if (ds.anon_key_encrypted) {
        try {
          result.anon_key = await decrypt(ds.anon_key_encrypted)
        } catch (e) {
          console.error('Failed to decrypt anon_key')
        }
      }

      if (ds.service_role_key_encrypted) {
        try {
          result.service_role_key = await decrypt(ds.service_role_key_encrypted)
        } catch (e) {
          console.error('Failed to decrypt service_role_key')
        }
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in manage-datasource-keys:', error)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
