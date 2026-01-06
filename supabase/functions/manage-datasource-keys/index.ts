import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Standard response helper - ALWAYS returns 200 with JSON
function jsonResponse(data: Record<string, any>) {
  return new Response(JSON.stringify(data), {
    status: 200, // Always 200 to avoid generic client errors
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({
    ok: false,
    error: { code, message, details }
  })
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data })
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido')
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return errorResponse('CONFIG_ERROR', 'Configuração do servidor incompleta')
    }

    // Check MASTER_ENCRYPTION_KEY exists
    if (!Deno.env.get('MASTER_ENCRYPTION_KEY')) {
      console.error('MASTER_ENCRYPTION_KEY not set')
      return errorResponse('CONFIG_ERROR', 'Chave de criptografia não configurada. Configure MASTER_ENCRYPTION_KEY nos secrets.')
    }

    // Create client for JWT validation
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Validate user with getUser
    const { data: { user }, error: userError } = await authClient.auth.getUser()
    
    if (userError || !user) {
      console.log('JWT validation failed:', userError?.message)
      return errorResponse('AUTH_FAILED', 'Token inválido ou expirado', userError?.message)
    }

    const userId = user.id
    console.log(`Manage datasource keys request from user: ${userId}`)

    // Check user is admin using service role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: adminRole, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle()

    if (roleError) {
      console.error('Role check error:', roleError)
      return errorResponse('DB_ERROR', 'Erro ao verificar permissões', roleError.message)
    }

    if (!adminRole) {
      return errorResponse('FORBIDDEN', 'Apenas administradores podem gerenciar credenciais')
    }

    // Parse and validate request body
    let body: any
    try {
      body = await req.json()
    } catch (e) {
      return errorResponse('INVALID_JSON', 'Corpo da requisição inválido')
    }

    const { data_source_id, anon_key, service_role_key, action } = body

    if (!data_source_id) {
      return errorResponse('VALIDATION_ERROR', 'data_source_id é obrigatório')
    }

    if (!action) {
      return errorResponse('VALIDATION_ERROR', 'action é obrigatório (set_keys, remove_keys, get_decrypted)')
    }

    // Verify data source exists
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('id, project_url, anon_key_present, service_role_key_present')
      .eq('id', data_source_id)
      .maybeSingle()

    if (dsError) {
      console.error('Data source fetch error:', dsError)
      return errorResponse('DB_ERROR', 'Erro ao buscar data source', dsError.message)
    }

    if (!dataSource) {
      return errorResponse('NOT_FOUND', 'Data source não encontrado')
    }

    // Handle actions
    if (action === 'set_keys') {
      if (!anon_key && !service_role_key) {
        return errorResponse('VALIDATION_ERROR', 'Informe pelo menos uma chave (anon_key ou service_role_key)')
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() }

      try {
        if (anon_key) {
          updates.anon_key_encrypted = await encrypt(anon_key)
          updates.anon_key_present = true
        }

        if (service_role_key) {
          updates.service_role_key_encrypted = await encrypt(service_role_key)
          updates.service_role_key_present = true
        }
      } catch (encryptError: any) {
        console.error('Encryption error:', encryptError)
        return errorResponse('ENCRYPTION_ERROR', 'Erro ao criptografar credenciais', encryptError.message)
      }

      const { error: updateError } = await adminClient
        .from('tenant_data_sources')
        .update(updates)
        .eq('id', data_source_id)

      if (updateError) {
        console.error('Update error:', updateError)
        return errorResponse('DB_ERROR', 'Erro ao salvar credenciais', updateError.message)
      }

      console.log(`Keys updated for data source ${data_source_id}`)
      return successResponse({ 
        message: 'Credenciais salvas com sucesso',
        anon_key_present: !!anon_key || dataSource.anon_key_present,
        service_role_key_present: !!service_role_key || dataSource.service_role_key_present
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
        console.error('Remove keys error:', updateError)
        return errorResponse('DB_ERROR', 'Erro ao remover credenciais', updateError.message)
      }

      return successResponse({ message: 'Credenciais removidas' })
    }

    if (action === 'get_decrypted') {
      // This is only for internal use by other edge functions
      const { data: ds, error: fetchError } = await adminClient
        .from('tenant_data_sources')
        .select('anon_key_encrypted, service_role_key_encrypted')
        .eq('id', data_source_id)
        .single()

      if (fetchError || !ds) {
        return errorResponse('NOT_FOUND', 'Data source não encontrado')
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

      return successResponse(result)
    }

    return errorResponse('INVALID_ACTION', `Ação inválida: ${action}. Use set_keys, remove_keys ou get_decrypted`)

  } catch (error: any) {
    console.error('Unhandled error in manage-datasource-keys:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno do servidor', error.message)
  }
})
