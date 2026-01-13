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

// Views that ACTUALLY EXIST in Afonsina's database (discovered via introspection)
const EXISTING_VIEWS = {
  // Main consolidated view with all metrics per day (NO org_id filter)
  custos_funil_dia: 'vw_afonsina_custos_funil_dia',
  
  // Dashboard v3 views (have org_id)
  dashboard_daily_60d: 'vw_dashboard_daily_60d_v3',
  spend_daily_60d: 'vw_spend_daily_60d_v3',
  funnel_current: 'vw_funnel_current_v3',
}

// Column mapping for vw_afonsina_custos_funil_dia
// dia, custo_total, anuncios_distintos, linhas_custo, leads_total, entrada_total, 
// reuniao_agendada_total, reuniao_realizada_total, falta_total, desmarque_total, venda_total, 
// cpl, custo_por_entrada, custo_por_reuniao_agendada, custo_por_reuniao_realizada, cac, 
// taxa_entrada, taxa_reuniao_agendada, taxa_comparecimento, taxa_venda_pos_reuniao, taxa_venda_total

interface FetchViewParams {
  view: string
  orgId?: string
  startDate?: string
  endDate?: string
  dateColumn?: string
  limit?: number
  filters?: Record<string, unknown>
}

async function fetchView({ view, orgId, startDate, endDate, dateColumn = 'day', limit, filters = {} }: FetchViewParams) {
  const afonsina = getAfonsinaClient()
  
  let query = afonsina.from(view).select('*')
  
  // Filter by org_id if provided and the view supports it
  if (orgId) {
    query = query.eq('org_id', orgId)
  }
  
  // Filter by date range
  if (startDate && endDate) {
    query = query.gte(dateColumn, startDate).lte(dateColumn, endDate)
  }
  
  // Apply additional filters
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      query = query.eq(key, value)
    }
  }
  
  // Order by date
  query = query.order(dateColumn, { ascending: true })
  
  // Limit results
  if (limit) {
    query = query.limit(limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error(`Error fetching ${view}:`, error)
    return { data: [], error: error.message }
  }
  
  return { data: data || [], error: null }
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

    // Action: probe_views - probe for specific views to see what exists
    if (action === 'probe_views') {
      const { views_to_probe = [] } = body
      
      const foundViews: Record<string, string[]> = {}
      
      for (const view of views_to_probe) {
        try {
          const columns = await introspectView(view)
          if (columns.length > 0) {
            foundViews[view] = columns
          }
        } catch (e) {
          // View doesn't exist
        }
      }
      
      return jsonResponse({ ok: true, found_views: foundViews })
    }

    // Action: list_views - list all views/tables using probe
    if (action === 'list_views') {
      const commonViews = [
        'vw_dashboard_daily_60d_v3',
        'vw_spend_daily_60d_v3',
        'vw_funnel_current_v3',
        'vw_afonsina_custos_funil_dia',
        'vw_afonsina_funil_atual',
        'vw_afonsina_leads_dia',
        'vw_afonsina_reunioes_dia',
      ]
      
      const foundViews: Record<string, string[]> = {}
      
      for (const view of commonViews) {
        try {
          const columns = await introspectView(view)
          if (columns.length > 0) {
            foundViews[view] = columns
          }
        } catch (e) {
          // View doesn't exist
        }
      }
      
      return jsonResponse({ ok: true, found_views: foundViews, method: 'probe' })
    }

    // Action: fetch_all - get data from all available views
    if (action === 'fetch_all' || !action) {
      const results: Record<string, unknown[]> = {}
      const previousResults: Record<string, unknown[]> = {}
      const errors: Record<string, string> = {}
      
      // 1. Fetch from vw_afonsina_custos_funil_dia (main consolidated view - no org_id)
      const custosResult = await fetchView({
        view: EXISTING_VIEWS.custos_funil_dia,
        startDate: start_date,
        endDate: end_date,
        dateColumn: 'dia',
      })
      results.custos_funil_dia = custosResult.data
      if (custosResult.error) errors.custos_funil_dia = custosResult.error
      
      // 2. Fetch from vw_dashboard_daily_60d_v3 (has org_id)
      const dashboardResult = await fetchView({
        view: EXISTING_VIEWS.dashboard_daily_60d,
        orgId: org_id,
        startDate: start_date,
        endDate: end_date,
        dateColumn: 'day',
      })
      results.dashboard_daily = dashboardResult.data
      if (dashboardResult.error) errors.dashboard_daily = dashboardResult.error
      
      // 3. Fetch from vw_spend_daily_60d_v3 (has org_id)
      const spendResult = await fetchView({
        view: EXISTING_VIEWS.spend_daily_60d,
        orgId: org_id,
        startDate: start_date,
        endDate: end_date,
        dateColumn: 'day',
      })
      results.spend_daily = spendResult.data
      if (spendResult.error) errors.spend_daily = spendResult.error
      
      // 4. Fetch from vw_funnel_current_v3 (current state, has org_id)
      const funnelResult = await fetchView({
        view: EXISTING_VIEWS.funnel_current,
        orgId: org_id,
        dateColumn: 'stage_rank', // Not a date, just for ordering
      })
      results.funnel_current = funnelResult.data
      if (funnelResult.error) errors.funnel_current = funnelResult.error
      
      // Fetch previous period if comparison enabled
      if (compare_enabled && prevStartDate && prevEndDate) {
        const prevCustosResult = await fetchView({
          view: EXISTING_VIEWS.custos_funil_dia,
          startDate: prevStartDate,
          endDate: prevEndDate,
          dateColumn: 'dia',
        })
        previousResults.custos_funil_dia = prevCustosResult.data
        
        const prevDashboardResult = await fetchView({
          view: EXISTING_VIEWS.dashboard_daily_60d,
          orgId: org_id,
          startDate: prevStartDate,
          endDate: prevEndDate,
          dateColumn: 'day',
        })
        previousResults.dashboard_daily = prevDashboardResult.data
        
        const prevSpendResult = await fetchView({
          view: EXISTING_VIEWS.spend_daily_60d,
          orgId: org_id,
          startDate: prevStartDate,
          endDate: prevEndDate,
          dateColumn: 'day',
        })
        previousResults.spend_daily = prevSpendResult.data
      }
      
      // Aggregate KPIs from custos_funil_dia (the most complete view)
      const kpis = aggregateKPIsFromCustosFunil(results.custos_funil_dia as CustosFunilRow[])
      
      // Aggregate previous period KPIs if comparison enabled
      let previousKpis: KPIs | undefined
      if (compare_enabled && previousResults.custos_funil_dia) {
        previousKpis = aggregateKPIsFromCustosFunil(previousResults.custos_funil_dia as CustosFunilRow[])
      }
      
      // Build daily series for charts
      const dailySeries = buildDailySeries(results.custos_funil_dia as CustosFunilRow[])
      const previousDailySeries = compare_enabled && previousResults.custos_funil_dia 
        ? buildDailySeries(previousResults.custos_funil_dia as CustosFunilRow[])
        : undefined
      
      return jsonResponse({
        ok: true,
        data: results,
        previous_data: compare_enabled ? previousResults : undefined,
        kpis,
        previous_kpis: previousKpis,
        daily_series: dailySeries,
        previous_daily_series: previousDailySeries,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
        meta: {
          org_id,
          period: { start: start_date, end: end_date },
          previous_period: compare_enabled ? { start: prevStartDate, end: prevEndDate } : undefined,
          views_used: Object.values(EXISTING_VIEWS),
        }
      })
    }

    // Action: fetch_single - get data from a specific view
    if (action === 'fetch_single') {
      const { view_key, date_column = 'day' } = body
      const viewName = EXISTING_VIEWS[view_key as keyof typeof EXISTING_VIEWS]
      
      if (!viewName) {
        return errorResponse('NOT_FOUND', `View "${view_key}" não encontrada. Views disponíveis: ${Object.keys(EXISTING_VIEWS).join(', ')}`)
      }
      
      const result = await fetchView({
        view: viewName,
        orgId: org_id,
        startDate: start_date,
        endDate: end_date,
        dateColumn: date_column,
        limit: body.limit,
      })
      
      return jsonResponse({ ok: true, data: result.data, error: result.error, view: viewName })
    }

    return errorResponse('INVALID_ACTION', `Ação "${action}" não reconhecida. Ações: fetch_all, fetch_single, probe_views, list_views`)

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

// Types for the custos_funil_dia view
interface CustosFunilRow {
  dia: string
  custo_total: number | null
  anuncios_distintos: number | null
  linhas_custo: number | null
  leads_total: number | null
  entrada_total: number | null
  reuniao_agendada_total: number | null
  reuniao_realizada_total: number | null
  falta_total: number | null
  desmarque_total: number | null
  venda_total: number | null
  cpl: number | null
  custo_por_entrada: number | null
  custo_por_reuniao_agendada: number | null
  custo_por_reuniao_realizada: number | null
  cac: number | null
  taxa_entrada: number | null
  taxa_reuniao_agendada: number | null
  taxa_comparecimento: number | null
  taxa_venda_pos_reuniao: number | null
  taxa_venda_total: number | null
}

interface KPIs {
  investimento_total: number
  leads_total: number
  entradas_total: number
  reunioes_agendadas: number
  reunioes_realizadas: number
  faltas_total: number
  desmarques_total: number
  vendas_total: number
  cpl: number | null
  custo_por_entrada: number | null
  custo_por_reuniao_agendada: number | null
  custo_por_reuniao_realizada: number | null
  cac: number | null
  taxa_entrada: number | null
  taxa_reuniao_agendada: number | null
  taxa_comparecimento: number | null
  taxa_venda_pos_reuniao: number | null
  taxa_venda_total: number | null
}

// Aggregate KPIs from vw_afonsina_custos_funil_dia
function aggregateKPIsFromCustosFunil(rows: CustosFunilRow[]): KPIs {
  const kpis: KPIs = {
    investimento_total: 0,
    leads_total: 0,
    entradas_total: 0,
    reunioes_agendadas: 0,
    reunioes_realizadas: 0,
    faltas_total: 0,
    desmarques_total: 0,
    vendas_total: 0,
    cpl: null,
    custo_por_entrada: null,
    custo_por_reuniao_agendada: null,
    custo_por_reuniao_realizada: null,
    cac: null,
    taxa_entrada: null,
    taxa_reuniao_agendada: null,
    taxa_comparecimento: null,
    taxa_venda_pos_reuniao: null,
    taxa_venda_total: null,
  }
  
  if (!rows || rows.length === 0) return kpis
  
  // Sum daily values
  for (const row of rows) {
    kpis.investimento_total += Number(row.custo_total) || 0
    kpis.leads_total += Number(row.leads_total) || 0
    kpis.entradas_total += Number(row.entrada_total) || 0
    kpis.reunioes_agendadas += Number(row.reuniao_agendada_total) || 0
    kpis.reunioes_realizadas += Number(row.reuniao_realizada_total) || 0
    kpis.faltas_total += Number(row.falta_total) || 0
    kpis.desmarques_total += Number(row.desmarque_total) || 0
    kpis.vendas_total += Number(row.venda_total) || 0
  }
  
  // Calculate derived metrics (use totals, not daily averages)
  if (kpis.investimento_total > 0) {
    if (kpis.leads_total > 0) {
      kpis.cpl = kpis.investimento_total / kpis.leads_total
    }
    if (kpis.entradas_total > 0) {
      kpis.custo_por_entrada = kpis.investimento_total / kpis.entradas_total
    }
    if (kpis.reunioes_agendadas > 0) {
      kpis.custo_por_reuniao_agendada = kpis.investimento_total / kpis.reunioes_agendadas
    }
    if (kpis.reunioes_realizadas > 0) {
      kpis.custo_por_reuniao_realizada = kpis.investimento_total / kpis.reunioes_realizadas
    }
    if (kpis.vendas_total > 0) {
      kpis.cac = kpis.investimento_total / kpis.vendas_total
    }
  }
  
  // Calculate conversion rates (percentages)
  if (kpis.leads_total > 0) {
    kpis.taxa_entrada = (kpis.entradas_total / kpis.leads_total) * 100
    kpis.taxa_reuniao_agendada = (kpis.reunioes_agendadas / kpis.leads_total) * 100
    kpis.taxa_venda_total = (kpis.vendas_total / kpis.leads_total) * 100
  }
  
  if (kpis.reunioes_agendadas > 0) {
    kpis.taxa_comparecimento = (kpis.reunioes_realizadas / kpis.reunioes_agendadas) * 100
  }
  
  if (kpis.reunioes_realizadas > 0) {
    kpis.taxa_venda_pos_reuniao = (kpis.vendas_total / kpis.reunioes_realizadas) * 100
  }
  
  return kpis
}

// Build daily series for charts
interface DailySeriesRow {
  date: string
  investimento: number
  leads: number
  entradas: number
  reunioes_agendadas: number
  reunioes_realizadas: number
  vendas: number
  cpl: number | null
  custo_por_entrada: number | null
  cac: number | null
  taxa_entrada: number | null
  taxa_comparecimento: number | null
  taxa_venda_total: number | null
}

function buildDailySeries(rows: CustosFunilRow[]): DailySeriesRow[] {
  if (!rows || rows.length === 0) return []
  
  return rows.map(row => ({
    date: row.dia,
    investimento: Number(row.custo_total) || 0,
    leads: Number(row.leads_total) || 0,
    entradas: Number(row.entrada_total) || 0,
    reunioes_agendadas: Number(row.reuniao_agendada_total) || 0,
    reunioes_realizadas: Number(row.reuniao_realizada_total) || 0,
    vendas: Number(row.venda_total) || 0,
    cpl: row.cpl !== null ? Number(row.cpl) : null,
    custo_por_entrada: row.custo_por_entrada !== null ? Number(row.custo_por_entrada) : null,
    cac: row.cac !== null ? Number(row.cac) : null,
    taxa_entrada: row.taxa_entrada !== null ? Number(row.taxa_entrada) * 100 : null,
    taxa_comparecimento: row.taxa_comparecimento !== null ? Number(row.taxa_comparecimento) * 100 : null,
    taxa_venda_total: row.taxa_venda_total !== null ? Number(row.taxa_venda_total) * 100 : null,
  }))
}
