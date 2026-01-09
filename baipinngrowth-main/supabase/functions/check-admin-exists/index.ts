import { createClient } from 'npm:@supabase/supabase-js@2'

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

  // Rate limit: 10 requests per minute per IP
  const clientIP = getClientIP(req);
  const rateLimit = checkRateLimit(clientIP, 10, 60000);
  
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    console.log(`Rate limit exceeded for IP: ${clientIP}`);
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please try again later.', retryAfter }),
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

    // Check if any admin exists
    const { data: existingAdmins, error: checkError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)

    if (checkError) {
      throw checkError
    }

    const hasAdmin = existingAdmins && existingAdmins.length > 0

    return new Response(
      JSON.stringify({ hasAdmin }),
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
