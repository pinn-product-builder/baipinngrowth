// ============================================================
// AFONSINA DATA V3 - Edge function to fetch data from v3 views
// Uses Afonsina's external Supabase database
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({ ok: false, error: { code, message, details } }, 
    code === 'UNAUTHORIZED' ? 401 : code === 'NOT_FOUND' ? 404 : 400)
}

// Afonsina's external Supabase configuration
function getAfonsinaClient() {
  const url = Deno.env.get('AFONSINA_SUPABASE_URL')
  const key = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
  
  if (!url || !key) {
    throw new Error('Afonsina Supabase credentials not configured')
  }
  
  return createClient(url, key)
}

// V3 Views available in Afonsina's database
const V3_VIEWS = {
  // Spend / Investment
  spend_daily: 'vw_spend_daily_total_id_v3',
  spend_daily_30d: 'vw_spend_daily_30d_id_v3',
  spend_top: 'vw_spend_top_id_v3',
  
  // Dashboard consolidated
  dashboard_daily: 'vw_dashboard_daily_total_v3',
  dashboard_high: 'vw_dashboard_high_id_v3',
  dashboard_high_30d: 'vw_dashboard_high_30d_id_v3',
  dashboard_high_90d: 'vw_dashboard_high_90d_id_v3',
  
  // Funnel
  funnel_current: 'vw_funnel_current_basic_v3',
  funnel_current_kommo: 'vw_funnel_current_kommo_v3',
  funnel_daily_30d: 'vw_funnel_daily_30d_v3',
  funnel_mapping_condicoes: 'vw_funnel_mapping_condicoes',
  funnel_mapping_conversao: 'vw_funnel_mapping_conversao',
  funnel_wrapup_condicoes: 'vw_funnel_wrapup_condicoes',
  
  // Messages (Kommo inbound)
  messages_daily: 'vw_kommo_msg_in_daily_total_id_v3',
  messages_by_hour: 'vw_kommo_msg_in_by_hour_id_v3',
  messages_hourly_30d: 'vw_kommo_msg_in_hourly_30d_id_v3',
  messages_historic: 'vw_kommo_msg_in_historic_id_v3',
  
  // Meetings / Pipeline
  meetings_daily: 'vw_meetings_daily_total_id_v3',
  meetings_high_30d: 'vw_meetings_high_30d_id_v3',
  meetings_upcoming: 'vw_meetings_upcoming_v3',
  pipeline_board: 'vw_pipeline_board_id_v3',
  pipeline_leads: 'vw_pipeline_leads_id_v3',
}

interface FetchViewParams {
  view: string
  orgId?: string
  startDate?: string
  endDate?: string
  limit?: number
  filters?: Record<string, unknown>
}

async function fetchView({ view, orgId, startDate, endDate, limit, filters = {} }: FetchViewParams) {
  const afonsina = getAfonsinaClient()
  
  let query = afonsina.from(view).select('*')
  
  // Filter by org_id if provided
  if (orgId) {
    query = query.eq('org_id', orgId)
  }
  
  // Filter by date range - detect date column
  if (startDate && endDate) {
    // Try common date column names
    const dateColumns = ['date', 'dia', 'day', 'created_at', 'event_date']
    // We'll apply the filter on 'date' or 'dia' - the most common
    query = query.gte('date', startDate).lte('date', endDate)
  }
  
  // Apply additional filters
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      query = query.eq(key, value)
    }
  }
  
  // Limit results
  if (limit) {
    query = query.limit(limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error(`Error fetching ${view}:`, error)
    // If error is about column not existing, try alternative date column
    if (error.message?.includes('date')) {
      // Retry without date filter
      let retryQuery = afonsina.from(view).select('*')
      if (orgId) retryQuery = retryQuery.eq('org_id', orgId)
      if (limit) retryQuery = retryQuery.limit(limit)
      
      const { data: retryData, error: retryError } = await retryQuery
      if (!retryError) return retryData || []
    }
    return []
  }
  
  return data || []
}

// Detect available columns in a view
async function introspectView(view: string): Promise<string[]> {
  const afonsina = getAfonsinaClient()
  const { data, error } = await afonsina.from(view).select('*').limit(1)
  
  if (error || !data || data.length === 0) {
    return []
  }
  
  return Object.keys(data[0])
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate with Lovable Cloud
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido')
    }

    const localSupabaseUrl = Deno.env.get('SUPABASE_URL')!
    const localSupabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const supabase = createClient(localSupabaseUrl, localSupabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('UNAUTHORIZED', 'Usuário não autenticado')
    }

    const body = await req.json()
    const { 
      action,
      org_id,
      start_date,
      end_date,
      compare_enabled = false,
      views_to_fetch = ['dashboard_daily', 'spend_daily', 'funnel_current', 'meetings_daily'],
    } = body

    console.log(`[afonsina-data-v3] action=${action}, org_id=${org_id}, start=${start_date}, end=${end_date}`)

    // Calculate previous period if comparison enabled
    let prevStartDate: string | undefined
    let prevEndDate: string | undefined
    
    if (compare_enabled && start_date && end_date) {
      const start = new Date(start_date)
      const end = new Date(end_date)
      const durationMs = end.getTime() - start.getTime()
      
      prevEndDate = new Date(start.getTime() - 1).toISOString().split('T')[0]
      prevStartDate = new Date(new Date(prevEndDate).getTime() - durationMs).toISOString().split('T')[0]
    }

    // Action: introspect - get column names from views
    if (action === 'introspect') {
      const introspection: Record<string, string[]> = {}
      
      for (const [key, viewName] of Object.entries(V3_VIEWS)) {
        try {
          const columns = await introspectView(viewName)
          introspection[key] = columns
        } catch (e) {
          introspection[key] = []
        }
      }
      
      return jsonResponse({ ok: true, introspection })
    }

    // Action: fetch_all - get data from multiple views
    if (action === 'fetch_all' || !action) {
      const results: Record<string, unknown> = {}
      const previousResults: Record<string, unknown> = {}
      
      for (const viewKey of views_to_fetch) {
        const viewName = V3_VIEWS[viewKey as keyof typeof V3_VIEWS]
        if (!viewName) continue
        
        try {
          // Fetch current period
          const data = await fetchView({
            view: viewName,
            orgId: org_id,
            startDate: start_date,
            endDate: end_date,
          })
          results[viewKey] = data
          
          // Fetch previous period if comparison enabled
          if (compare_enabled && prevStartDate && prevEndDate) {
            const prevData = await fetchView({
              view: viewName,
              orgId: org_id,
              startDate: prevStartDate,
              endDate: prevEndDate,
            })
            previousResults[viewKey] = prevData
          }
        } catch (e) {
          console.error(`Error fetching ${viewKey}:`, e)
          results[viewKey] = []
        }
      }
      
      // Calculate aggregated KPIs from dashboard_daily
      const dashboardData = results.dashboard_daily as Record<string, unknown>[] || []
      const spendData = results.spend_daily as Record<string, unknown>[] || []
      
      // Aggregate current period
      const kpis = aggregateKPIs(dashboardData, spendData)
      
      // Aggregate previous period for comparison
      let previousKpis: Record<string, number | null> | undefined
      if (compare_enabled) {
        const prevDashboardData = previousResults.dashboard_daily as Record<string, unknown>[] || []
        const prevSpendData = previousResults.spend_daily as Record<string, unknown>[] || []
        previousKpis = aggregateKPIs(prevDashboardData, prevSpendData)
      }
      
      return jsonResponse({
        ok: true,
        data: results,
        previous_data: compare_enabled ? previousResults : undefined,
        kpis,
        previous_kpis: previousKpis,
        meta: {
          org_id,
          period: { start: start_date, end: end_date },
          previous_period: compare_enabled ? { start: prevStartDate, end: prevEndDate } : undefined,
          views_fetched: views_to_fetch,
        }
      })
    }

    // Action: fetch_single - get data from a specific view
    if (action === 'fetch_single') {
      const { view_key } = body
      const viewName = V3_VIEWS[view_key as keyof typeof V3_VIEWS]
      
      if (!viewName) {
        return errorResponse('NOT_FOUND', `View "${view_key}" não encontrada`)
      }
      
      const data = await fetchView({
        view: viewName,
        orgId: org_id,
        startDate: start_date,
        endDate: end_date,
        limit: body.limit,
      })
      
      return jsonResponse({ ok: true, data, view: viewName })
    }

    return errorResponse('INVALID_ACTION', `Ação "${action}" não reconhecida`)

  } catch (error) {
    console.error('[afonsina-data-v3] Error:', error)
    return jsonResponse({ 
      ok: false, 
      error: { 
        code: 'INTERNAL_ERROR', 
        message: 'Erro interno', 
        details: error instanceof Error ? error.message : String(error) 
      } 
    }, 500)
  }
})

// Helper: Aggregate KPIs from dashboard and spend data
function aggregateKPIs(
  dashboardData: Record<string, unknown>[],
  spendData: Record<string, unknown>[]
): Record<string, number | null> {
  const kpis: Record<string, number | null> = {
    investimento_total: 0,
    leads_total: 0,
    entradas_total: 0,
    reunioes_agendadas: 0,
    reunioes_realizadas: 0,
    vendas_total: 0,
    cpl: null,
    custo_por_entrada: null,
    cac: null,
  }
  
  // Sum spend data
  for (const row of spendData) {
    const spend = parseFloat(String(row.spend || row.custo_total || row.investment || 0))
    if (isFinite(spend)) {
      kpis.investimento_total! += spend
    }
  }
  
  // Sum dashboard data
  for (const row of dashboardData) {
    // Try different column names
    const leads = parseFloat(String(row.leads_total || row.leads || row.leads_new || 0))
    const entradas = parseFloat(String(row.entradas_total || row.entradas || row.entrada || 0))
    const agendadas = parseFloat(String(row.reunioes_agendadas || row.meetings_scheduled || row.reuniao_agendada_total || 0))
    const realizadas = parseFloat(String(row.reunioes_realizadas || row.meetings_held || row.reuniao_realizada_total || 0))
    const vendas = parseFloat(String(row.vendas_total || row.vendas || row.venda || row.conversions || 0))
    
    if (isFinite(leads)) kpis.leads_total! += leads
    if (isFinite(entradas)) kpis.entradas_total! += entradas
    if (isFinite(agendadas)) kpis.reunioes_agendadas! += agendadas
    if (isFinite(realizadas)) kpis.reunioes_realizadas! += realizadas
    if (isFinite(vendas)) kpis.vendas_total! += vendas
  }
  
  // Calculate derived metrics
  if (kpis.investimento_total! > 0) {
    if (kpis.leads_total! > 0) {
      kpis.cpl = kpis.investimento_total! / kpis.leads_total!
    }
    if (kpis.entradas_total! > 0) {
      kpis.custo_por_entrada = kpis.investimento_total! / kpis.entradas_total!
    }
    if (kpis.vendas_total! > 0) {
      kpis.cac = kpis.investimento_total! / kpis.vendas_total!
    }
  }
  
  return kpis
}
