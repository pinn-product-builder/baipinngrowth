import { createClient } from 'npm:@supabase/supabase-js@2'
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiter keyed by user ID
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(userId);
  
  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(userId, entry);
    return { allowed: true, remaining: limit - 1, resetAt: entry.resetAt };
  }
  
  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

interface InviteRequest {
  email: string
  fullName?: string
  tenantId?: string
  role: 'admin' | 'manager' | 'viewer'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured')
    }

    const resend = new Resend(resendApiKey)

    // Verify caller is admin or manager
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with user's auth for claim validation
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token)
    
    if (claimsError || !claimsData?.claims) {
      console.error('Claims error:', claimsError)
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = claimsData.claims.sub as string
    const userEmail = claimsData.claims.email as string
    
    // Create admin client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Rate limit: 50 invites per user per hour
    const rateLimit = checkRateLimit(userId, 50, 3600000);
    
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      console.log(`Rate limit exceeded for send-invite by user: ${userId}`);
      return new Response(
        JSON.stringify({ error: 'Too many invitations sent. Please try again later.', retryAfter }),
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

    // Check if user is admin or manager
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()

    const isAdmin = roleData?.role === 'admin'
    const isManager = roleData?.role === 'manager'

    if (!isAdmin && !isManager) {
      return new Response(
        JSON.stringify({ error: 'Only admins and managers can send invites' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json() as InviteRequest;
    const { email, fullName, tenantId, role } = body;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email) || email.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Valid role is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate fullName if provided
    if (fullName && (typeof fullName !== 'string' || fullName.length > 200)) {
      return new Response(
        JSON.stringify({ error: 'Full name must be less than 200 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate tenantId format if provided
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (tenantId && !uuidRegex.test(tenantId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid tenant ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Managers can only invite to their own tenant
    if (isManager) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', userId)
        .single()

      if (!tenantId || tenantId !== profileData?.tenant_id) {
        return new Response(
          JSON.stringify({ error: 'Managers can only invite users to their own tenant' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Managers cannot create admins
      if (role === 'admin') {
        return new Response(
          JSON.stringify({ error: 'Managers cannot invite admin users' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Non-admin roles require tenant_id
    if (role !== 'admin' && !tenantId) {
      return new Response(
        JSON.stringify({ error: 'Tenant is required for non-admin users' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if email already exists as user
    const { data: existingUser } = await supabase.auth.admin.listUsers()
    const userExists = existingUser?.users?.some(u => u.email === email)
    
    if (userExists) {
      return new Response(
        JSON.stringify({ error: 'A user with this email already exists' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check for existing pending invite
    const { data: existingInvite } = await supabase
      .from('user_invites')
      .select('id, expires_at, accepted')
      .eq('email', email)
      .eq('accepted', false)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle()

    // Generate token
    const token_value = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 48) // 48h expiration

    if (existingInvite) {
      // Update existing invite with new token and expiry
      const { error: updateError } = await supabase
        .from('user_invites')
        .update({
          token: token_value,
          expires_at: expiresAt.toISOString(),
          role,
          tenant_id: tenantId || null,
          invited_by: userId
        })
        .eq('id', existingInvite.id)

      if (updateError) throw updateError
    } else {
      // Create new invite
      const { error: insertError } = await supabase
        .from('user_invites')
        .insert({
          email,
          role,
          token: token_value,
          expires_at: expiresAt.toISOString(),
          tenant_id: tenantId || null,
          invited_by: userId,
          accepted: false
        })

      if (insertError) throw insertError
    }

    // Get tenant name for email
    let tenantName = 'BAI Analytics'
    if (tenantId) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .single()
      if (tenant) tenantName = tenant.name
    }

    // Get inviter name
    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
    const inviterName = inviterProfile?.full_name || userEmail

    // Build invite URL
    const baseUrl = req.headers.get('origin') || 'https://uiljecxfzlebocjenkmn.lovableproject.com'
    const inviteUrl = `${baseUrl}/accept-invite?token=${token_value}`

    // Send email
    console.log(`Attempting to send email to: ${email}`)
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'BAI Analytics <onboarding@resend.dev>',
      to: [email],
      subject: `You're invited to join ${tenantName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">BAI Analytics</h1>
          </div>
          <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1e293b; margin-top: 0;">You've been invited!</h2>
            <p>Hi${fullName ? ` ${fullName.slice(0, 100)}` : ''},</p>
            <p><strong>${inviterName}</strong> has invited you to join <strong>${tenantName}</strong> as a <strong>${role}</strong>.</p>
            <p>Click the button below to set up your account:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="background: #3b82f6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Accept Invitation</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">This invitation expires in 48 hours. If you didn't expect this invitation, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">BAI Analytics — Business Intelligence Platform</p>
          </div>
        </body>
        </html>
      `
    })

    if (emailError) {
      console.error('Email send error:', JSON.stringify(emailError))
      // Return error to user so they know email failed
      return new Response(
        JSON.stringify({ 
          error: `Failed to send email: ${emailError.message || 'Unknown error'}. Note: With resend.dev sandbox, you can only send to your own email.`
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('Email sent successfully:', JSON.stringify(emailData))

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        action: 'invite_sent',
        entity_type: 'user',
        entity_id: null,
        details: { email, role, tenant_id: tenantId, resent: !!existingInvite }
      })

    console.log(`Invite sent to ${email} by ${userEmail}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        message: existingInvite ? 'Invitation resent successfully' : 'Invitation sent successfully'
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
