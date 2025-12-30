import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { token, password, fullName }: AcceptInviteRequest = await req.json()

    if (!token || !password) {
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

    // Create user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || invite.email.split('@')[0] }
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
        full_name: fullName || invite.email.split('@')[0],
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
