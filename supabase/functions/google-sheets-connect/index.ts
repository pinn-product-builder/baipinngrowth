// Google Sheets Connect - Edge Function for OAuth and Sheets operations
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({ ok: false, error: { code, message, details } }, 400)
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data })
}

// Encryption helpers
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyB64 = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!keyB64) throw new Error('MASTER_ENCRYPTION_KEY not set')
  const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  )
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

// Token refresh helper - now accepts credentials as parameters
async function refreshAccessToken(
  refreshToken: string, 
  clientId: string, 
  clientSecret: string
): Promise<{ access_token: string; expires_in: number } | null> {
  if (!clientId || !clientSecret) {
    console.error('Missing clientId or clientSecret for token refresh')
    return null
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Token refresh failed:', error)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Token refresh error:', error)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização ausente')
    }
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) {
      return errorResponse('UNAUTHORIZED', 'Token inválido ou expirado')
    }

    // Check admin role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
    
    if (!roleData || roleData.role !== 'admin') {
      return errorResponse('FORBIDDEN', 'Apenas administradores podem gerenciar conexões Google')
    }

    const body = await req.json()
    const { action } = body

    // ACTION: Get OAuth URL
    if (action === 'get_oauth_url') {
      // Accept client ID from request body (per-connection credentials)
      const clientId = body.google_client_id || Deno.env.get('GOOGLE_CLIENT_ID')
      if (!clientId) {
        return errorResponse('CONFIG_ERROR', 'GOOGLE_CLIENT_ID não fornecido. Preencha o Client ID no formulário.')
      }

      const { redirect_uri, state } = body
      if (!redirect_uri) {
        return errorResponse('VALIDATION_ERROR', 'redirect_uri é obrigatório')
      }

      const scopes = [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' ')

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri,
        response_type: 'code',
        scope: scopes,
        access_type: 'offline',
        prompt: 'consent',
        state: state || '',
      })

      return successResponse({
        oauth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      })
    }

    // ACTION: Exchange code for tokens
    if (action === 'exchange_code') {
      const { code, redirect_uri } = body
      if (!code || !redirect_uri) {
        return errorResponse('VALIDATION_ERROR', 'code e redirect_uri são obrigatórios')
      }

      // Accept credentials from request body (per-connection credentials)
      const clientId = body.google_client_id || Deno.env.get('GOOGLE_CLIENT_ID')
      const clientSecret = body.google_client_secret || Deno.env.get('GOOGLE_CLIENT_SECRET')
      if (!clientId || !clientSecret) {
        return errorResponse('CONFIG_ERROR', 'Credenciais Google não fornecidas. Preencha Client ID e Client Secret.')
      }

      console.log('[OAuth Debug] exchange_code - redirect_uri:', redirect_uri)
      console.log('[OAuth Debug] exchange_code - client_id (first 20 chars):', clientId.substring(0, 20))

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        console.error('[OAuth Debug] Token exchange failed:', error)
        console.error('[OAuth Debug] Used redirect_uri:', redirect_uri)
        console.error('[OAuth Debug] Used client_id:', clientId.substring(0, 30) + '...')
        
        // Parse error to provide better feedback
        let errorDetails = error
        try {
          const errorJson = JSON.parse(error)
          if (errorJson.error === 'redirect_uri_mismatch') {
            errorDetails = `redirect_uri_mismatch: O redirect_uri "${redirect_uri}" não está cadastrado no Google Cloud Console. ` +
              `Vá em APIs & Services → Credentials → seu OAuth Client ID → Authorized redirect URIs e adicione exatamente: ${redirect_uri}`
          }
        } catch {
          // Keep original error
        }
        
        return errorResponse('OAUTH_ERROR', 'Falha na troca do código OAuth', errorDetails)
      }

      const tokens = await tokenResponse.json()
      
      // Get user email
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      
      let email = ''
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json()
        email = userInfo.email || ''
      }

      // Encrypt tokens
      const accessTokenEncrypted = await encrypt(tokens.access_token)
      const refreshTokenEncrypted = tokens.refresh_token ? await encrypt(tokens.refresh_token) : null

      return successResponse({
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        expires_in: tokens.expires_in,
        email,
      })
    }

    // ACTION: Encrypt credentials (for storing client_id and client_secret)
    if (action === 'encrypt_credentials') {
      const { google_client_id, google_client_secret } = body
      
      if (!google_client_id || !google_client_secret) {
        return errorResponse('VALIDATION_ERROR', 'google_client_id e google_client_secret são obrigatórios')
      }

      const clientIdEncrypted = await encrypt(google_client_id)
      const clientSecretEncrypted = await encrypt(google_client_secret)

      return successResponse({
        client_id_encrypted: clientIdEncrypted,
        client_secret_encrypted: clientSecretEncrypted,
      })
    }

    // ACTION: List spreadsheets
    if (action === 'list_spreadsheets') {
      const { data_source_id, access_token_encrypted } = body
      
      let accessToken: string

      if (data_source_id) {
        // Get stored token and credentials
        const { data: ds, error: dsError } = await adminClient
          .from('tenant_data_sources')
          .select('google_access_token_encrypted, google_refresh_token_encrypted, google_token_expires_at, google_client_id_encrypted, google_client_secret_encrypted')
          .eq('id', data_source_id)
          .single()

        if (dsError || !ds) {
          return errorResponse('NOT_FOUND', 'Data source não encontrado')
        }

        if (!ds.google_access_token_encrypted) {
          return errorResponse('NOT_CONNECTED', 'Nenhuma conta Google conectada')
        }

        // Check if token expired
        const expiresAt = ds.google_token_expires_at ? new Date(ds.google_token_expires_at) : null
        if (expiresAt && expiresAt < new Date() && ds.google_refresh_token_encrypted) {
          // Get credentials for refresh
          let clientId = Deno.env.get('GOOGLE_CLIENT_ID') || ''
          let clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
          
          // Use stored credentials if available
          if (ds.google_client_id_encrypted && ds.google_client_secret_encrypted) {
            clientId = await decrypt(ds.google_client_id_encrypted)
            clientSecret = await decrypt(ds.google_client_secret_encrypted)
          }
          
          // Refresh token
          const refreshToken = await decrypt(ds.google_refresh_token_encrypted)
          const newTokens = await refreshAccessToken(refreshToken, clientId, clientSecret)
          
          if (newTokens) {
            accessToken = newTokens.access_token
            const newEncrypted = await encrypt(newTokens.access_token)
            const newExpires = new Date(Date.now() + newTokens.expires_in * 1000)
            
            await adminClient
              .from('tenant_data_sources')
              .update({
                google_access_token_encrypted: newEncrypted,
                google_token_expires_at: newExpires.toISOString(),
              })
              .eq('id', data_source_id)
          } else {
            return errorResponse('TOKEN_EXPIRED', 'Token expirado e não foi possível renovar')
          }
        } else {
          accessToken = await decrypt(ds.google_access_token_encrypted)
        }
      } else if (access_token_encrypted) {
        accessToken = await decrypt(access_token_encrypted)
      } else {
        return errorResponse('VALIDATION_ERROR', 'data_source_id ou access_token_encrypted é obrigatório')
      }

      // List spreadsheets from Drive
      const query = "mimeType='application/vnd.google-apps.spreadsheet'"
      const driveResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!driveResponse.ok) {
        const error = await driveResponse.text()
        console.error('Drive API error:', error)
        return errorResponse('DRIVE_ERROR', 'Falha ao listar planilhas', error)
      }

      const driveData = await driveResponse.json()
      
      return successResponse({
        spreadsheets: driveData.files || [],
      })
    }

    // ACTION: List sheets (tabs) in a spreadsheet
    if (action === 'list_sheets') {
      const { spreadsheet_id, data_source_id, access_token_encrypted } = body
      
      if (!spreadsheet_id) {
        return errorResponse('VALIDATION_ERROR', 'spreadsheet_id é obrigatório')
      }

      let accessToken: string

      if (data_source_id) {
        const { data: ds } = await adminClient
          .from('tenant_data_sources')
          .select('google_access_token_encrypted')
          .eq('id', data_source_id)
          .single()

        if (!ds?.google_access_token_encrypted) {
          return errorResponse('NOT_CONNECTED', 'Nenhuma conta Google conectada')
        }
        accessToken = await decrypt(ds.google_access_token_encrypted)
      } else if (access_token_encrypted) {
        accessToken = await decrypt(access_token_encrypted)
      } else {
        return errorResponse('VALIDATION_ERROR', 'data_source_id ou access_token_encrypted é obrigatório')
      }

      const sheetsResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!sheetsResponse.ok) {
        const error = await sheetsResponse.text()
        console.error('Sheets API error:', error)
        return errorResponse('SHEETS_ERROR', 'Falha ao listar abas', error)
      }

      const sheetsData = await sheetsResponse.json()
      
      const sheets = (sheetsData.sheets || []).map((s: any) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        index: s.properties.index,
        rowCount: s.properties.gridProperties?.rowCount,
        columnCount: s.properties.gridProperties?.columnCount,
      }))

      return successResponse({ sheets })
    }

    // ACTION: Test connection
    if (action === 'test_connection') {
      const { data_source_id } = body
      
      if (!data_source_id) {
        return errorResponse('VALIDATION_ERROR', 'data_source_id é obrigatório')
      }

      const { data: ds, error: dsError } = await adminClient
        .from('tenant_data_sources')
        .select('google_access_token_encrypted, google_refresh_token_encrypted, google_spreadsheet_id, google_email')
        .eq('id', data_source_id)
        .single()

      if (dsError || !ds) {
        return errorResponse('NOT_FOUND', 'Data source não encontrado')
      }

      if (!ds.google_access_token_encrypted) {
        return errorResponse('NOT_CONNECTED', 'Nenhuma conta Google conectada')
      }

      const accessToken = await decrypt(ds.google_access_token_encrypted)

      // Test by fetching spreadsheet metadata
      if (ds.google_spreadsheet_id) {
        const testResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${ds.google_spreadsheet_id}?fields=properties.title`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (!testResponse.ok) {
          const error = await testResponse.text()
          return errorResponse('CONNECTION_FAILED', 'Falha ao acessar planilha', error)
        }

        const testData = await testResponse.json()
        return successResponse({
          message: `Conectado com sucesso! Planilha: ${testData.properties?.title}`,
          email: ds.google_email,
        })
      }

      // Just verify token works
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!userInfoResponse.ok) {
        return errorResponse('CONNECTION_FAILED', 'Token inválido ou expirado')
      }

      return successResponse({
        message: 'Conexão válida',
        email: ds.google_email,
      })
    }

    // ACTION: Get sheet data (preview/sample)
    if (action === 'get_sheet_data') {
      const { data_source_id, spreadsheet_id, sheet_name, limit = 100 } = body
      
      if (!spreadsheet_id || !sheet_name) {
        return errorResponse('VALIDATION_ERROR', 'spreadsheet_id e sheet_name são obrigatórios')
      }

      let accessToken: string

      if (data_source_id) {
        const { data: ds } = await adminClient
          .from('tenant_data_sources')
          .select('google_access_token_encrypted')
          .eq('id', data_source_id)
          .single()

        if (!ds?.google_access_token_encrypted) {
          return errorResponse('NOT_CONNECTED', 'Nenhuma conta Google conectada')
        }
        accessToken = await decrypt(ds.google_access_token_encrypted)
      } else {
        return errorResponse('VALIDATION_ERROR', 'data_source_id é obrigatório')
      }

      // Get sheet data
      const range = `${sheet_name}!A1:ZZ${limit + 1}` // +1 for header
      const dataResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!dataResponse.ok) {
        const error = await dataResponse.text()
        return errorResponse('SHEETS_ERROR', 'Falha ao obter dados', error)
      }

      const sheetData = await dataResponse.json()
      const values = sheetData.values || []

      if (values.length === 0) {
        return successResponse({ columns: [], rows: [], total_rows: 0 })
      }

      // First row is header
      const headers = values[0] as string[]
      const rows = values.slice(1).map((row: any[]) => {
        const obj: Record<string, any> = {}
        headers.forEach((h, i) => {
          obj[h || `col_${i}`] = row[i] ?? null
        })
        return obj
      })

      return successResponse({
        columns: headers.map((h, i) => ({ name: h || `col_${i}`, index: i })),
        rows,
        total_rows: values.length - 1,
      })
    }

    return errorResponse('INVALID_ACTION', `Ação desconhecida: ${action}`)
  } catch (error: any) {
    console.error('Error:', error)
    return errorResponse('INTERNAL_ERROR', error.message || 'Erro interno')
  }
})
