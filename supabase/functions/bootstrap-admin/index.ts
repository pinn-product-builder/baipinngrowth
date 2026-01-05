import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  
  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(ip, entry);
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Rate limit: 5 attempts per hour per IP (very strict for admin bootstrap)
  const clientIP = getClientIP(req);
  const rateLimit = checkRateLimit(clientIP, 5, 3600000);
  
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    console.log(`Rate limit exceeded for bootstrap-admin from IP: ${clientIP}`);
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Check if any admin exists first
    const { data: existingAdmins, error: checkError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)

    if (checkError) {
      throw checkError
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Admin already exists. Setup is disabled.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { email, password, fullName } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate fullName length if provided
    if (fullName && fullName.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Full name must be less than 200 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName?.slice(0, 200) || 'Administrator' }
    })

    if (authError) {
      throw authError
    }

    const userId = authData.user.id

    // Update profile
    await supabase
      .from('profiles')
      .update({ 
        full_name: fullName?.slice(0, 200) || 'Administrator',
        password_changed: true // No force change for self-setup
      })
      .eq('id', userId)

    // Add admin role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' })

    if (roleError) {
      throw roleError
    }

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        action: 'admin_bootstrap',
        entity_type: 'user',
        entity_id: userId,
        details: { email, method: 'setup_screen' }
      })

    console.log(`First admin created: ${email}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Administrator account created successfully'
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
