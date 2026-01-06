import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================
// ENCRYPTION HELPERS
// =====================================================
async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY');
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY not configured');
  }
  
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  return keyMaterial;
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}

// =====================================================
// MAIN HANDLER
// =====================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(
        JSON.stringify({ error: 'Tenant não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { tenant_id: requestedTenantId, api_key: testApiKey } = await req.json();
    const targetTenantId = requestedTenantId || profile.tenant_id;

    let apiKeyToTest: string | null = testApiKey || null;

    // If no direct API key provided, get from stored settings
    if (!apiKeyToTest) {
      const { data: settings } = await supabase
        .from('tenant_ai_settings')
        .select('api_key_encrypted')
        .eq('tenant_id', targetTenantId)
        .eq('provider', 'openai')
        .single();

      if (settings?.api_key_encrypted) {
        try {
          apiKeyToTest = await decrypt(settings.api_key_encrypted);
        } catch (e) {
          console.error('Failed to decrypt API key:', e);
          return new Response(
            JSON.stringify({ 
              success: false, 
              status: 'error',
              message: 'Erro ao decriptar API key. A chave pode estar corrompida.' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    if (!apiKeyToTest) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: 'not_configured',
          message: 'Nenhuma API key configurada para este tenant.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate key format
    if (!apiKeyToTest.startsWith('sk-')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: 'invalid',
          message: 'API Key inválida. Deve começar com sk-' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test with minimal OpenAI call (list models)
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKeyToTest}`,
        },
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        const models = data.data?.map((m: any) => m.id).slice(0, 10) || [];
        
        // Log successful test
        await supabase.from('ai_usage_logs').insert({
          tenant_id: targetTenantId,
          user_id: user.id,
          request_type: 'test_connection',
          model: 'api-test',
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          latency_ms: latency,
          status: 'success',
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: 'valid',
            message: 'Conexão estabelecida com sucesso!',
            latency_ms: latency,
            available_models_sample: models,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = 'Erro desconhecido';
        let status = 'error';

        if (response.status === 401) {
          errorMessage = 'API Key inválida ou expirada';
          status = 'invalid';
        } else if (response.status === 429) {
          errorMessage = 'Rate limit excedido. Aguarde alguns minutos.';
          status = 'rate_limited';
        } else if (response.status === 403) {
          errorMessage = 'Acesso negado. Verifique as permissões da key.';
          status = 'forbidden';
        } else {
          errorMessage = errorData.error?.message || `Erro HTTP ${response.status}`;
        }

        // Log failed test
        await supabase.from('ai_usage_logs').insert({
          tenant_id: targetTenantId,
          user_id: user.id,
          request_type: 'test_connection',
          model: 'api-test',
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          latency_ms: latency,
          status: 'error',
          error_code: String(response.status),
          error_message: errorMessage,
        });

        return new Response(
          JSON.stringify({ 
            success: false, 
            status,
            message: errorMessage,
            latency_ms: latency,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (fetchError) {
      const latency = Date.now() - startTime;
      console.error('OpenAI API fetch error:', fetchError);

      await supabase.from('ai_usage_logs').insert({
        tenant_id: targetTenantId,
        user_id: user.id,
        request_type: 'test_connection',
        model: 'api-test',
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        latency_ms: latency,
        status: 'error',
        error_code: 'NETWORK_ERROR',
        error_message: fetchError instanceof Error ? fetchError.message : 'Erro de rede',
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          status: 'network_error',
          message: 'Erro de rede ao conectar com OpenAI. Tente novamente.',
          latency_ms: latency,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('AI Test Connection error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
