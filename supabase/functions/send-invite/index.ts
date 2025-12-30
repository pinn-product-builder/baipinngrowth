import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, tenant_id, role, invited_by } = await req.json();

    if (!email || !tenant_id || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72); // 72 hours expiry

    // Create invite record
    const { data: invite, error: inviteError } = await supabaseClient
      .from('user_invites')
      .insert({
        email,
        tenant_id,
        role,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by
      })
      .select()
      .single();

    if (inviteError) throw inviteError;

    // Get base URL from request or env
    const origin = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'http://localhost:5173';
    const inviteLink = `${origin}/invite/${token}`;

    console.log(`Invite created for ${email}. Link: ${inviteLink}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        invite_id: invite.id,
        invite_link: inviteLink 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating invite:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
