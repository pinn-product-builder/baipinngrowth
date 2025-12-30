import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const adminEmail = 'adm@pinngrowth.com'
    const adminPassword = 'Teste123@'

    // Check if admin already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const adminExists = existingUsers?.users?.some(u => u.email === adminEmail)

    if (adminExists) {
      return new Response(
        JSON.stringify({ message: 'Admin user already exists', created: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Admin PinnGrowth' }
    })

    if (authError) {
      throw authError
    }

    const userId = authData.user.id

    // Update profile with tenant (PinnGrowth)
    await supabase
      .from('profiles')
      .update({ 
        full_name: 'Admin PinnGrowth',
        tenant_id: '11111111-1111-1111-1111-111111111111',
        password_changed: false
      })
      .eq('id', userId)

    // Add admin role
    await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' })

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        action: 'admin_seeded',
        entity_type: 'user',
        entity_id: userId,
        details: { email: adminEmail, method: 'edge_function' }
      })

    return new Response(
      JSON.stringify({ 
        message: 'Admin user created successfully',
        email: adminEmail,
        created: true
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
