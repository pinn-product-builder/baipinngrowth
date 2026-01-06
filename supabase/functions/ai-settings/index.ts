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
    ['encrypt', 'decrypt']
  );
  return keyMaterial;
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate user via getUser (works with auth header)
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
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

    if (roleData?.role !== 'admin' && roleData?.role !== 'manager') {
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas administradores.' }),
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

    const body = await req.json();
    const { action, tenant_id: requestedTenantId } = body;

    // For platform admin, allow managing any tenant
    const targetTenantId = requestedTenantId || profile.tenant_id;

    // GET settings (safe view)
    if (action === 'get') {
      const { data: settings } = await supabase
        .from('tenant_ai_settings')
        .select('id, tenant_id, provider, api_key_last4, default_model, enabled, max_requests_per_minute, max_tokens_per_day, max_spend_month_usd, created_at, updated_at')
        .eq('tenant_id', targetTenantId)
        .eq('provider', 'openai')
        .single();

      // Get usage stats
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const todayStr = today.toISOString().split('T')[0];

      const { data: usageToday } = await supabase
        .from('ai_usage_logs')
        .select('prompt_tokens, completion_tokens, total_tokens')
        .eq('tenant_id', targetTenantId)
        .gte('created_at', todayStr);

      const { data: usageMonth } = await supabase
        .from('ai_usage_logs')
        .select('prompt_tokens, completion_tokens, total_tokens, cost_estimated')
        .eq('tenant_id', targetTenantId)
        .gte('created_at', startOfMonth);

      const tokensToday = usageToday?.reduce((acc, r) => acc + (r.total_tokens || 0), 0) || 0;
      const tokensMonth = usageMonth?.reduce((acc, r) => acc + (r.total_tokens || 0), 0) || 0;
      const costMonth = usageMonth?.reduce((acc, r) => acc + Number(r.cost_estimated || 0), 0) || 0;

      return new Response(
        JSON.stringify({
          settings: settings || null,
          usage: {
            tokens_today: tokensToday,
            tokens_month: tokensMonth,
            cost_month_usd: costMonth,
          },
          status: settings?.api_key_last4 ? (settings.enabled ? 'configured' : 'disabled') : 'not_configured',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SAVE settings (create or update)
    if (action === 'save') {
      const { api_key, default_model, enabled, max_requests_per_minute, max_tokens_per_day, max_spend_month_usd } = body;

      let api_key_encrypted: string | undefined;
      let api_key_last4: string | undefined;

      if (api_key) {
        // Validate API key format
        if (!api_key.startsWith('sk-')) {
          return new Response(
            JSON.stringify({ error: 'API Key inválida. Deve começar com sk-' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        api_key_encrypted = await encrypt(api_key);
        api_key_last4 = api_key.slice(-4);
      }

      // Check if exists
      const { data: existing } = await supabase
        .from('tenant_ai_settings')
        .select('id')
        .eq('tenant_id', targetTenantId)
        .eq('provider', 'openai')
        .single();

      if (existing) {
        const updateData: any = {
          default_model: default_model || 'gpt-4.1-mini',
          enabled: enabled ?? true,
          max_requests_per_minute: max_requests_per_minute || 60,
          max_tokens_per_day: max_tokens_per_day || null,
          max_spend_month_usd: max_spend_month_usd || null,
        };
        
        if (api_key_encrypted) {
          updateData.api_key_encrypted = api_key_encrypted;
          updateData.api_key_last4 = api_key_last4;
        }

        const { error } = await supabase
          .from('tenant_ai_settings')
          .update(updateData)
          .eq('id', existing.id);

        if (error) {
          console.error('Update error:', error);
          return new Response(
            JSON.stringify({ error: 'Erro ao atualizar configurações' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        if (!api_key_encrypted) {
          return new Response(
            JSON.stringify({ error: 'API Key é obrigatória para nova configuração' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('tenant_ai_settings')
          .insert({
            tenant_id: targetTenantId,
            provider: 'openai',
            api_key_encrypted,
            api_key_last4,
            default_model: default_model || 'gpt-4.1-mini',
            enabled: enabled ?? true,
            max_requests_per_minute: max_requests_per_minute || 60,
            max_tokens_per_day: max_tokens_per_day || null,
            max_spend_month_usd: max_spend_month_usd || null,
          });

        if (error) {
          console.error('Insert error:', error);
          return new Response(
            JSON.stringify({ error: 'Erro ao criar configurações' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Configurações salvas com sucesso' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DELETE settings
    if (action === 'delete') {
      const { error } = await supabase
        .from('tenant_ai_settings')
        .delete()
        .eq('tenant_id', targetTenantId)
        .eq('provider', 'openai');

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Erro ao remover configurações' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Configurações removidas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET LOGS
    if (action === 'logs') {
      const { limit = 50 } = body;
      
      const { data: logs } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .eq('tenant_id', targetTenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return new Response(
        JSON.stringify({ logs: logs || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não reconhecida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI Settings error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
