import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ScheduledReport {
  id: string
  name: string
  tenant_id: string
  dashboard_ids: string[]
  emails: string[]
  frequency: string
  is_active: boolean
  next_send_at: string | null
  last_sent_at: string | null
}

interface Dashboard {
  id: string
  name: string
  description: string | null
}

function getNextSendDate(frequency: string, fromDate: Date = new Date()): Date {
  const next = new Date(fromDate)
  
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      next.setHours(8, 0, 0, 0) // 8am
      break
    case 'weekly':
      next.setDate(next.getDate() + 7)
      next.setHours(8, 0, 0, 0)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      next.setDate(1)
      next.setHours(8, 0, 0, 0)
      break
    default:
      next.setDate(next.getDate() + 7) // Default weekly
      next.setHours(8, 0, 0, 0)
  }
  
  return next
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
      console.warn('RESEND_API_KEY not configured')
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Check for optional body parameters
    let specificReportId: string | null = null
    try {
      const body = await req.json()
      specificReportId = body?.report_id || null
    } catch {
      // No body, run all due reports
    }

    const now = new Date().toISOString()

    // Fetch due reports
    let query = supabase
      .from('scheduled_reports')
      .select('*')
      .eq('is_active', true)

    if (specificReportId) {
      query = query.eq('id', specificReportId)
    } else {
      query = query.lte('next_send_at', now)
    }

    const { data: reports, error: reportsError } = await query

    if (reportsError) {
      console.error('Error fetching reports:', reportsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch reports' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!reports || reports.length === 0) {
      console.log('No reports due')
      return new Response(JSON.stringify({ message: 'No reports due', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Processing ${reports.length} reports`)

    const results: Array<{ report_id: string; success: boolean; error?: string }> = []

    for (const report of reports as ScheduledReport[]) {
      try {
        // Fetch dashboard info
        const { data: dashboards } = await supabase
          .from('dashboards')
          .select('id, name, description')
          .in('id', report.dashboard_ids)
          .eq('is_active', true)

        // Fetch tenant info
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', report.tenant_id)
          .single()

        const dashboardList = (dashboards || []).map((d: Dashboard) => 
          `<li><strong>${d.name}</strong>${d.description ? ` - ${d.description}` : ''}</li>`
        ).join('')

        const appUrl = Deno.env.get('APP_URL') || 'https://preview--bai-dash.lovable.app'

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório: ${report.name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">📊 ${report.name}</h1>
    <p style="margin: 10px 0 0; opacity: 0.9;">Relatório ${report.frequency === 'daily' ? 'diário' : report.frequency === 'weekly' ? 'semanal' : 'mensal'} - ${tenant?.name || 'BAI Analytics'}</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px;">
    <h2 style="margin-top: 0; color: #667eea;">Dashboards incluídos:</h2>
    <ul style="padding-left: 20px;">
      ${dashboardList || '<li>Nenhum dashboard configurado</li>'}
    </ul>
    
    <div style="margin-top: 30px; text-align: center;">
      <a href="${appUrl}/dashboards" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500;">
        Acessar Dashboards
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="color: #666; font-size: 12px; text-align: center; margin: 0;">
      Este é um email automático do BAI Analytics.<br>
      Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
    </p>
  </div>
</body>
</html>
        `

        // Send email via Resend
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'BAI Analytics <noreply@resend.dev>',
            to: report.emails,
            subject: `📊 Relatório: ${report.name} - ${new Date().toLocaleDateString('pt-BR')}`,
            html: emailHtml
          })
        })

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text()
          throw new Error(`Email failed: ${errorText}`)
        }

        // Update report timestamps
        const nextSend = getNextSendDate(report.frequency)
        await supabase
          .from('scheduled_reports')
          .update({
            last_sent_at: now,
            next_send_at: nextSend.toISOString(),
            updated_at: now
          })
          .eq('id', report.id)

        // Log success
        await supabase.from('activity_logs').insert({
          action: 'report_sent',
          entity_type: 'scheduled_report',
          entity_id: report.id,
          details: { 
            name: report.name, 
            emails: report.emails,
            dashboards: report.dashboard_ids.length
          }
        })

        results.push({ report_id: report.id, success: true })
        console.log(`Report ${report.id} sent successfully to ${report.emails.join(', ')}`)

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Failed to send report ${report.id}:`, errorMessage)

        // Log failure
        await supabase.from('activity_logs').insert({
          action: 'report_failed',
          entity_type: 'scheduled_report',
          entity_id: report.id,
          details: { 
            name: report.name, 
            error: errorMessage 
          }
        })

        results.push({ report_id: report.id, success: false, error: errorMessage })
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`Processed ${results.length} reports, ${successCount} successful`)

    return new Response(JSON.stringify({ 
      processed: results.length,
      successful: successCount,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in send-scheduled-report:', error)
    return new Response(JSON.stringify({ error: 'Erro interno', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
