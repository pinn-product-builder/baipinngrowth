import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({ ok: false, error: { code, message, details } }, 400)
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data })
}

// Encryption helpers
async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!masterKey) throw new Error('MASTER_ENCRYPTION_KEY not configured')
  
  const encoder = new TextEncoder()
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  )
  
  return new TextDecoder().decode(decrypted)
}

// =====================================================
// TRUTHY VALUE HANDLING
// =====================================================

const TRUTHY_VALUES = new Set(['1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'on'])

function isTruthy(value: any): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v)
}

function parseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  
  // Try ISO format first
  if (typeof value === 'string') {
    // YYYY-MM-DD
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      const d = new Date(value)
      return isNaN(d.getTime()) ? null : d
    }
    
    // DD/MM/YYYY
    const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (brMatch) {
      const d = new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`)
      return isNaN(d.getTime()) ? null : d
    }
  }
  
  return null
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

// =====================================================
// AGGREGATION HELPERS
// =====================================================

interface AggregationResult {
  kpis: Record<string, number>
  series: Record<string, Record<string, number>[]>  // { date: ..., value: ... }[]
  rankings: Record<string, { dimension: string; value: number }[]>
  funnel: { stage: string; label: string; value: number }[]
}

function computeAggregations(
  rows: Record<string, any>[],
  plan: any,
  startDate: string,
  endDate: string
): AggregationResult {
  const result: AggregationResult = {
    kpis: {},
    series: {},
    rankings: {},
    funnel: []
  }

  if (rows.length === 0) {
    return result
  }

  const timeColumn = plan.time_column
  
  // Filter rows by date range if time column exists
  let filteredRows = rows
  if (timeColumn) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    
    filteredRows = rows.filter(row => {
      const d = parseDate(row[timeColumn])
      return d && d >= start && d <= end
    })
  }

  // 1. Compute KPIs
  for (const kpi of plan.kpis || []) {
    const column = kpi.column
    let value = 0
    
    switch (kpi.aggregation) {
      case 'sum':
        value = filteredRows.reduce((sum, row) => {
          const v = parseFloat(row[column])
          return sum + (isFinite(v) ? v : 0)
        }, 0)
        break
        
      case 'count':
        value = filteredRows.length
        break
        
      case 'count_distinct':
        value = new Set(filteredRows.map(row => row[column]).filter(v => v != null)).size
        break
        
      case 'avg':
        const nums = filteredRows.map(row => parseFloat(row[column])).filter(v => isFinite(v))
        value = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
        break
        
      case 'truthy_count':
        value = filteredRows.filter(row => isTruthy(row[column])).length
        break
    }
    
    result.kpis[column] = value
  }

  // 2. Compute funnel
  if (plan.funnel?.stages) {
    for (const stage of plan.funnel.stages) {
      const value = filteredRows.filter(row => isTruthy(row[stage.column])).length
      result.funnel.push({
        stage: stage.column,
        label: stage.label,
        value
      })
    }
  }

  // 3. Compute time series (if time column exists)
  if (timeColumn) {
    // Group by date
    const byDate = new Map<string, Record<string, any>[]>()
    
    for (const row of filteredRows) {
      const d = parseDate(row[timeColumn])
      if (!d) continue
      const key = formatDateKey(d)
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push(row)
    }
    
    // Sort dates
    const sortedDates = [...byDate.keys()].sort()
    
    // Compute series for each chart
    for (const chart of plan.charts || []) {
      // Skip charts without valid series array
      const seriesArray = Array.isArray(chart.series) ? chart.series : []
      if (seriesArray.length === 0) continue
      
      const chartSeries: Record<string, number>[] = []
      
      for (const dateKey of sortedDates) {
        const dateRows = byDate.get(dateKey)!
        const point: Record<string, number> = { date: new Date(dateKey).getTime() }
        
        for (const s of seriesArray) {
          // Sum or truthy_count depending on column type
          const kpiDef = plan.kpis.find((k: any) => k.column === s.column)
          
          if (kpiDef?.aggregation === 'truthy_count') {
            point[s.column] = dateRows.filter(row => isTruthy(row[s.column])).length
          } else if (kpiDef?.aggregation === 'avg') {
            const nums = dateRows.map(row => parseFloat(row[s.column])).filter(v => isFinite(v))
            point[s.column] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
          } else {
            point[s.column] = dateRows.reduce((sum, row) => {
              const v = parseFloat(row[s.column])
              return sum + (isFinite(v) ? v : 0)
            }, 0)
          }
        }
        
        chartSeries.push(point)
      }
      
      result.series[chart.id] = chartSeries
    }
  }

  // 4. Compute rankings
  for (const ranking of plan.rankings || []) {
    const grouped = new Map<string, number>()
    
    for (const row of filteredRows) {
      const dimValue = String(row[ranking.dimension_column] || 'Outros')
      const current = grouped.get(dimValue) || 0
      
      let metricValue = 0
      switch (ranking.aggregation) {
        case 'sum':
          metricValue = parseFloat(row[ranking.metric_column])
          if (!isFinite(metricValue)) metricValue = 0
          break
        case 'count':
          metricValue = 1
          break
        case 'avg':
          metricValue = parseFloat(row[ranking.metric_column])
          if (!isFinite(metricValue)) metricValue = 0
          break
      }
      
      grouped.set(dimValue, current + metricValue)
    }
    
    // For avg, divide by count
    if (ranking.aggregation === 'avg') {
      const counts = new Map<string, number>()
      for (const row of filteredRows) {
        const dimValue = String(row[ranking.dimension_column] || 'Outros')
        counts.set(dimValue, (counts.get(dimValue) || 0) + 1)
      }
      for (const [key, sum] of grouped) {
        const count = counts.get(key) || 1
        grouped.set(key, sum / count)
      }
    }
    
    // Sort and limit
    const sorted = [...grouped.entries()]
      .map(([dimension, value]) => ({ dimension, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, ranking.limit || 10)
    
    result.rankings[ranking.id] = sorted
  }

  return result
}

// =====================================================
// DENO SERVE
// =====================================================

Deno.serve(async (req) => {
  const traceId = crypto.randomUUID().slice(0, 8)
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return jsonResponse({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Token de autorização não fornecido' }, trace_id: traceId }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Authenticate
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ ok: false, error: { code: 'AUTH_FAILED', message: 'Usuário não autenticado' }, trace_id: traceId }, 401)
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const body = await req.json()
    const { dashboard_id, start, end, limit = 5000 } = body

    console.log(`[${traceId}] dashboard-data-v2: dashboard_id=${dashboard_id}, start=${start}, end=${end}`)

    if (!dashboard_id) {
      return jsonResponse({ ok: false, error: { code: 'MISSING_PARAM', message: 'dashboard_id é obrigatório' }, trace_id: traceId }, 400)
    }

    // Fetch dashboard with its spec and datasource
    const { data: dashboard, error: dashError } = await adminClient
      .from('dashboards')
      .select(`
        id, name, tenant_id, 
        data_source_id,
        view_name,
        dashboard_spec,
        detected_columns,
        tenant_data_sources(
          id, project_url, anon_key_encrypted, service_role_key_encrypted
        )
      `)
      .eq('id', dashboard_id)
      .single()

    if (dashError || !dashboard) {
      console.error(`[${traceId}] Dashboard not found:`, dashError)
      return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Dashboard não encontrado' }, trace_id: traceId }, 404)
    }

    // Check tenant access
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (profile?.tenant_id !== dashboard.tenant_id) {
      // Check if user is admin
      const { data: roleData } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
      
      if (!roleData || roleData.length === 0) {
        return jsonResponse({ ok: false, error: { code: 'ACCESS_DENIED', message: 'Acesso negado a este dashboard' }, trace_id: traceId }, 403)
      }
    }

    // Get the datasource info (direct relationship: dashboards -> tenant_data_sources)
    const dataSource = dashboard.tenant_data_sources as any
    const objectName = dashboard.view_name

    if (!dataSource || !objectName) {
      return jsonResponse({ 
        ok: false, 
        error: { code: 'NO_BINDING', message: 'Dashboard não está vinculado a um view_name/datasource válido' },
        trace_id: traceId 
      }, 400)
    }

    // Decrypt API key
    let apiKey: string | null = null

    if (dataSource.service_role_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.service_role_key_encrypted)
      } catch (e) {
        console.error(`[${traceId}] Failed to decrypt service_role_key`)
      }
    }

    if (!apiKey && dataSource.anon_key_encrypted) {
      try {
        apiKey = await decrypt(dataSource.anon_key_encrypted)
      } catch (e) {
        console.error(`[${traceId}] Failed to decrypt anon_key`)
      }
    }

    // Fallback to Afonsina keys
    if (!apiKey) {
      const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
      const afonsinaKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
      
      if (afonsinaUrl && dataSource.project_url === afonsinaUrl && afonsinaKey) {
        apiKey = afonsinaKey
      }
    }

    if (!apiKey) {
      return jsonResponse({ ok: false, error: { code: 'NO_CREDENTIALS', message: 'Credenciais do datasource não configuradas' }, trace_id: traceId }, 400)
    }

    // Fetch raw data from external datasource
    const timeColumn = dashboard.dashboard_spec?.time?.column
    
    let fetchUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*`
    
    // Add date filters if we have a time column and date range
    if (timeColumn && start && end) {
      fetchUrl += `&${timeColumn}=gte.${start}&${timeColumn}=lte.${end}`
      fetchUrl += `&order=${timeColumn}.asc`
    }
    
    fetchUrl += `&limit=${limit}`

    console.log(`[${traceId}] Fetching: ${objectName} with time_column=${timeColumn}`)

    const response = await fetch(fetchUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Prefer': 'count=exact'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${traceId}] Fetch error:`, response.status, errorText)
      return jsonResponse({ 
        ok: false, 
        error: { code: 'FETCH_ERROR', message: `Erro ao consultar dados: ${response.status}`, details: errorText },
        trace_id: traceId 
      }, 500)
    }

    const rawRows = await response.json()
    const totalCount = parseInt(response.headers.get('content-range')?.split('/')[1] || String(rawRows.length))

    console.log(`[${traceId}] Fetched ${rawRows.length} rows (total: ${totalCount})`)

    // Get dashboard plan from spec or generate minimal plan
    const spec = dashboard.dashboard_spec || {}
    const plan = {
      time_column: timeColumn || spec.time?.column,
      kpis: spec.kpis || [],
      charts: spec.charts || [],
      rankings: [],
      funnel: spec.funnel ? {
        stages: spec.funnel.steps?.map((s: any) => ({
          column: s.column,
          label: s.label,
          truthy_count_expression: `truthy_count(${s.column})`
        })) || []
      } : null
    }

    // Compute aggregations
    const aggregations = computeAggregations(rawRows, plan, start || '2000-01-01', end || '2099-12-31')

    // Find date range from data
    let dataDateRange = { min: null as string | null, max: null as string | null }
    if (plan.time_column && rawRows.length > 0) {
      const dates = rawRows
        .map((r: Record<string, unknown>) => parseDate(r[plan.time_column!]))
        .filter((d: Date | null): d is Date => d !== null)
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      
      if (dates.length > 0) {
        dataDateRange.min = formatDateKey(dates[0])
        dataDateRange.max = formatDateKey(dates[dates.length - 1])
      }
    }

    return successResponse({
      // Aggregated data (preferred for rendering)
      aggregations,
      
      // Raw data for table view
      rows: rawRows,
      
      // Metadata
      meta: {
        rows_fetched: rawRows.length,
        rows_total: totalCount,
        time_column: plan.time_column,
        date_range: dataDateRange,
        period_requested: { start, end },
        has_spec: Object.keys(spec).length > 0,
        trace_id: traceId
      }
    })

  } catch (error: any) {
    console.error(`[${traceId}] Error in dashboard-data-v2:`, error)
    return jsonResponse({ 
      ok: false, 
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno', details: error.message },
      trace_id: traceId 
    }, 500)
  }
})
