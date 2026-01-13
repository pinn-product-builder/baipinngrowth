import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const email = 'afonsinaoliveirasdr@gmail.com'
    const password = '12345678'
    const tenantId = '22222222-2222-2222-2222-222222222222' // Afonsina Oliveira tenant
    const dashboardId = '16c74d98-22a5-4779-9bf0-f4711fe91528' // Afonsina dashboard

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === email)

    if (existingUser) {
      // User exists, just update profile if needed
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          tenant_id: tenantId,
          default_dashboard_id: dashboardId,
          password_changed: true,
          is_active: true,
          status: 'active'
        })
        .eq('id', existingUser.id)

      if (profileError) {
        console.error('Profile update error:', profileError)
      }

      // Check if role exists
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', existingUser.id)
        .single()

      if (!existingRole) {
        await supabase
          .from('user_roles')
          .insert({ user_id: existingUser.id, role: 'client' })
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'User already exists, profile updated',
          email 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create new user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Afonsina Oliveira' }
    })

    if (authError) {
      console.error('Auth error:', authError)
      throw new Error(authError.message)
    }

    const userId = authData.user.id

    // Update profile with tenant and dashboard
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        tenant_id: tenantId,
        full_name: 'Afonsina Oliveira',
        password_changed: true,
        is_active: true,
        status: 'active'
      })
      .eq('id', userId)

    if (profileError) {
      console.error('Profile error:', profileError)
    }

    // Add client role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: 'client' })

    if (roleError) {
      console.error('Role error:', roleError)
    }

    console.log(`User ${email} created successfully for Afonsina tenant`)

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'User created successfully',
        email
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
