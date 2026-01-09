import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiter: keyed by token to prevent brute force on specific invites
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(key, entry);
    return { allowed: true, remaining: limit - 1, resetAt: entry.resetAt };
  }
  
  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
         req.headers.get('x-real-ip') ||
         req.headers.get('cf-connecting-ip') ||
         'unknown';
}

interface AcceptInviteRequest {
  token: string
  password: string
  fullName?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const clientIP = getClientIP(req);

  try {
    const body = await req.json() as AcceptInviteRequest;
    const { token, password, fullName } = body;

    // Validate token format first
    if (!token || typeof token !== 'string' || token.length < 10 || token.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Invalid token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limit: 5 attempts per token per hour + 10 attempts per IP per hour
    const tokenRateLimit = checkRateLimit(`token:${token}`, 5, 3600000);
    const ipRateLimit = checkRateLimit(`ip:${clientIP}`, 10, 3600000);
    
    if (!tokenRateLimit.allowed || !ipRateLimit.allowed) {
      const retryAfter = Math.ceil((Math.max(tokenRateLimit.resetAt, ipRateLimit.resetAt) - Date.now()) / 1000);
      console.log(`Rate limit exceeded for accept-invite. Token: ${token.substring(0, 8)}..., IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please try again later.', retryAfter }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString()
          } 
        }
      );
    }

    if (!password || typeof password !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Token and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (password.length > 128) {
      return new Response(
        JSON.stringify({ error: 'Password is too long' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate fullName length if provided
    if (fullName && (typeof fullName !== 'string' || fullName.length > 200)) {
      return new Response(
        JSON.stringify({ error: 'Full name must be less than 200 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Find invite by token
    const { data: invite, error: inviteError } = await supabase
      .from('user_invites')
      .select('*')
      .eq('token', token)
      .single()

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired invitation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already used
    if (invite.accepted) {
      return new Response(
        JSON.stringify({ error: 'This invitation has already been used' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check expiration
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'This invitation has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if tenant is active (if tenant_id is set)
    if (invite.tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('is_active')
        .eq('id', invite.tenant_id)
        .single()

      if (!tenant?.is_active) {
        return new Response(
          JSON.stringify({ error: 'The organization for this invitation is no longer active' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Sanitize and prepare name
    const sanitizedName = fullName?.slice(0, 200)?.trim() || invite.email.split('@')[0];

    // Create user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: sanitizedName }
    })

    if (authError) {
      console.error('Auth error:', authError)
      throw new Error(authError.message)
    }

    const userId = authData.user.id

    // Update profile with tenant and name
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        tenant_id: invite.tenant_id,
        full_name: sanitizedName,
        password_changed: true, // They just set their password
        is_active: true,
        status: 'active'
      })
      .eq('id', userId)

    if (profileError) {
      console.error('Profile error:', profileError)
    }

    // Add role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: invite.role })

    if (roleError) {
      console.error('Role error:', roleError)
      throw new Error('Failed to assign user role')
    }

    // Mark invite as accepted
    const { error: updateError } = await supabase
      .from('user_invites')
      .update({ accepted: true })
      .eq('id', invite.id)

    if (updateError) {
      console.error('Update invite error:', updateError)
    }

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        action: 'invite_accepted',
        entity_type: 'user',
        entity_id: userId,
        details: { 
          email: invite.email, 
          role: invite.role, 
          tenant_id: invite.tenant_id,
          invited_by: invite.invited_by 
        }
      })

    console.log(`User ${invite.email} accepted invite and joined as ${invite.role}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Account created successfully. You can now log in.',
        email: invite.email
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
