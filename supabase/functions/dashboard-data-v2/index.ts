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

function errorResponse(code: string, message: string, details?: string, traceId?: string) {
  return jsonResponse({ 
    ok: false, 
    error: { code, message, details },
    trace_id: traceId,
    meta: { trace_id: traceId }
  }, code === 'UNAUTHORIZED' || code === 'AUTH_FAILED' ? 401 : code === 'ACCESS_DENIED' ? 403 : code === 'NOT_FOUND' ? 404 : 400)
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
// TRUTHY VALUE HANDLING (Canonical - Single Source of Truth)
// =====================================================

const TRUTHY_VALUES = new Set([
  '1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'on',
  'ativo', 'realizado', 'agendado', 'ganho', 'concluido', 'fechado'
])

const FALSY_VALUES = new Set([
  '0', 'false', 'nao', 'não', 'n', 'no', 'off',
  'inativo', 'pendente', 'cancelado', 'perdido', ''
])

function isTruthy(value: any): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v)
}

function isBooleanLike(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return value === 0 || value === 1
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v) || FALSY_VALUES.has(v)
}

// =====================================================
// DATE PARSING (Canonical - Single Source of Truth)
// =====================================================

function parseDate(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null
  
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }
  
  // Unix timestamp
  if (typeof value === 'number') {
    const date = new Date(value > 1e11 ? value : value * 1000)
    return isNaN(date.getTime()) ? null : date
  }
  
  if (typeof value !== 'string') return null
  
  const str = value.trim()
  
  // ISO format: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const d = new Date(str)
    return isNaN(d.getTime()) ? null : d
  }
  
  // Brazilian format: DD/MM/YYYY
  const brSlashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (brSlashMatch) {
    const [, day, month, year] = brSlashMatch
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    return isNaN(d.getTime()) ? null : d
  }
  
  // Brazilian format: DD-MM-YYYY
  const brDashMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (brDashMatch) {
    const [, day, month, year] = brDashMatch
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    return isNaN(d.getTime()) ? null : d
  }
  
  // Fallback
  const fallback = new Date(str)
  return isNaN(fallback.getTime()) ? null : fallback
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// =====================================================
// DATA QUALITY ANALYSIS
// =====================================================

interface DataQualityWarning {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  column?: string
  value?: number
}

interface DataQualityReport {
  time_parse_rate: number
  truthy_rates: Record<string, number>
  null_rates: Record<string, number>
  warnings: DataQualityWarning[]
  degraded_mode: boolean
}

function analyzeDataQuality(
  rows: Record<string, any>[],
  timeColumn: string | null,
  stageColumns: string[]
): DataQualityReport {
  const report: DataQualityReport = {
    time_parse_rate: 1,
    truthy_rates: {},
    null_rates: {},
    warnings: [],
    degraded_mode: false
  }
  
  if (rows.length === 0) {
    report.warnings.push({
      code: 'NO_DATA',
      severity: 'warning',
      message: 'Nenhuma linha de dados encontrada'
    })
    return report
  }
  
  // Check time column parse rate
  if (timeColumn) {
    const parsed = rows.filter(r => parseDate(r[timeColumn]) !== null).length
    report.time_parse_rate = parsed / rows.length
    
    if (report.time_parse_rate < 0.7) {
      report.warnings.push({
        code: 'LOW_TIME_PARSE_RATE',
        severity: 'warning',
        message: `Coluna de tempo "${timeColumn}" tem ${Math.round(report.time_parse_rate * 100)}% de parse válido`,
        column: timeColumn,
        value: report.time_parse_rate
      })
      report.degraded_mode = true
    }
  }
  
  // Check truthy rates for stage columns
  for (const col of stageColumns) {
    const nonNull = rows.filter(r => r[col] !== null && r[col] !== undefined)
    const truthy = nonNull.filter(r => isTruthy(r[col]))
    const rate = nonNull.length > 0 ? truthy.length / nonNull.length : 0
    report.truthy_rates[col] = rate
    
    // Null rate
    const nullCount = rows.length - nonNull.length
    report.null_rates[col] = nullCount / rows.length
  }
  
  return report
}

// =====================================================
// ADAPTIVE TIME GRAIN
// =====================================================

type TimeGrain = 'day' | 'week' | 'month'

function determineTimeGrain(days: number, maxPoints: number = 400): TimeGrain {
  if (days <= maxPoints) return 'day'
  if (days / 7 <= maxPoints) return 'week'
  return 'month'
}

function getTimeGroupKey(date: Date, grain: TimeGrain): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  
  switch (grain) {
    case 'day':
      return `${year}-${month}-${day}`
    case 'week': {
      const d = new Date(date)
      const dayOfWeek = d.getDay() || 7
      d.setDate(d.getDate() - dayOfWeek + 1)
      return formatDateKey(d)
    }
    case 'month':
      return `${year}-${month}-01`
  }
}

// =====================================================
// AGGREGATION HELPERS
// =====================================================

interface AggregationResult {
  kpis: Record<string, number>
  series: Record<string, Record<string, number>[]>  // { date: ..., value: ... }[]
  rankings: Record<string, { dimension: string; value: number }[]>
  funnel: { stage: string; label: string; value: number; count: number; rate?: number }[]
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

  // 2. Compute funnel - use 'count' field for frontend compatibility
  if (plan.funnel?.stages) {
    let prevCount = 0
    for (let i = 0; i < plan.funnel.stages.length; i++) {
      const stage = plan.funnel.stages[i]
      const count = filteredRows.filter(row => isTruthy(row[stage.column])).length
      const rate = i > 0 && prevCount > 0 ? count / prevCount : 1
      result.funnel.push({
        stage: stage.column,
        label: stage.label,
        value: count,    // Numeric count
        count: count,    // Alias for frontend
        rate: i > 0 ? rate : undefined  // Conversion rate from previous stage
      })
      prevCount = count
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
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido', undefined, traceId)
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
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado', undefined, traceId)
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const body = await req.json()
    const { 
      dashboard_id, 
      start, 
      end, 
      // NEW: Support pagination for details table
      page = 1,
      pageSize = 100,
      // NEW: Allow unlimited aggregation (remove hard 1000 limit)
      // Default is high enough for aggregation but can be overridden
      aggregation_limit = 50000,
      // For details table only
      details_limit = 500
    } = body

    console.log(`[${traceId}] dashboard-data-v2: dashboard_id=${dashboard_id}, start=${start}, end=${end}, aggregation_limit=${aggregation_limit}`)

    if (!dashboard_id) {
      console.warn(`[${traceId}] Missing dashboard_id parameter`)
      return errorResponse('MISSING_PARAM', 'dashboard_id é obrigatório', undefined, traceId)
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
      return errorResponse('NOT_FOUND', 'Dashboard não encontrado', dashError?.message, traceId)
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
        console.warn(`[${traceId}] Access denied for user ${user.id} to dashboard ${dashboard_id}`)
        return errorResponse('ACCESS_DENIED', 'Acesso negado a este dashboard', undefined, traceId)
      }
    }

    // Get the datasource info (direct relationship: dashboards -> tenant_data_sources)
    const dataSource = dashboard.tenant_data_sources as any
    const objectName = dashboard.view_name

    if (!dataSource || !objectName) {
      console.error(`[${traceId}] Missing binding: dataSource=${!!dataSource}, objectName=${objectName}`)
      return errorResponse(
        'NO_BINDING', 
        'Dashboard não está vinculado a um view_name/datasource válido',
        `data_source_id=${dashboard.data_source_id}, view_name=${dashboard.view_name}`,
        traceId
      )
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
      console.error(`[${traceId}] No API key available for datasource`)
      return errorResponse('NO_CREDENTIALS', 'Credenciais do datasource não configuradas', undefined, traceId)
    }

    // Get spec and time column
    const spec = dashboard.dashboard_spec || {}
    const timeColumn = spec.time?.column
    
    // =====================================================
    // STEP 1: FETCH ALL DATA FOR AGGREGATION (NO HARD LIMIT)
    // =====================================================
    
    let aggregationUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*`
    
    // Add date filters if we have a time column and date range
    if (timeColumn && start && end) {
      aggregationUrl += `&${timeColumn}=gte.${start}&${timeColumn}=lte.${end}`
      aggregationUrl += `&order=${timeColumn}.asc`
    }
    
    // Use high limit for aggregation - this ensures KPIs and charts are accurate
    aggregationUrl += `&limit=${aggregation_limit}`

    console.log(`[${traceId}] Fetching for aggregation: ${objectName}, time_column=${timeColumn}, limit=${aggregation_limit}`)

    const aggregationResponse = await fetch(aggregationUrl, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Prefer': 'count=exact'
      }
    })

    if (!aggregationResponse.ok) {
      const errorText = await aggregationResponse.text()
      console.error(`[${traceId}] Fetch error: status=${aggregationResponse.status}, body=${errorText}`)
      return jsonResponse({ 
        ok: false, 
        error: { 
          code: 'FETCH_ERROR', 
          message: `Erro ao consultar dados: ${aggregationResponse.status}`, 
          details: errorText 
        },
        trace_id: traceId,
        meta: {
          trace_id: traceId,
          dashboard_id,
          dataset_ref: `public.${objectName}`,
          data_source_id: dataSource.id
        }
      }, 500)
    }

    const allRows = await aggregationResponse.json()
    const totalCount = parseInt(aggregationResponse.headers.get('content-range')?.split('/')[1] || String(allRows.length))
    
    // Detect if we hit the limit (data may be incomplete)
    const dataLimited = allRows.length >= aggregation_limit
    
    console.log(`[${traceId}] Fetched ${allRows.length} rows for aggregation (total: ${totalCount}, limited: ${dataLimited})`)

    // =====================================================
    // STEP 2: BUILD AGGREGATION PLAN
    // =====================================================
    
    // Map KPIs - spec uses 'key' but aggregation code expects 'column'
    const mappedKpis = (spec.kpis || []).map((kpi: any) => ({
      column: kpi.key || kpi.column,
      aggregation: kpi.aggregation || 'truthy_count', // Default to truthy_count for CRM
      label: kpi.label
    }))
    
    // Map funnel - spec may use 'stages' or 'steps'
    const funnelStages = spec.funnel?.stages || spec.funnel?.steps || []
    const mappedFunnel = funnelStages.length > 0 ? {
      stages: funnelStages.map((s: any) => ({
        column: s.column || s.key,
        label: s.label
      }))
    } : null
    
    // Extract stage columns for quality analysis
    const stageColumns = mappedFunnel?.stages?.map((s: any) => s.column) || []
    
    // Map charts
    const mappedCharts = (spec.charts || []).map((chart: any) => {
      if (chart.metric && !chart.series) {
        return {
          ...chart,
          id: chart.id || chart.label || chart.metric,
          series: [{ column: chart.metric, label: chart.label }]
        }
      }
      return {
        ...chart,
        id: chart.id || chart.label,
        series: Array.isArray(chart.series) ? chart.series.map((s: any) => ({
          column: s.column || s.key,
          label: s.label
        })) : []
      }
    })
    
    const plan = {
      time_column: timeColumn,
      kpis: mappedKpis,
      charts: mappedCharts,
      rankings: [],
      funnel: mappedFunnel
    }
    
    console.log(`[${traceId}] Plan: ${mappedKpis.length} KPIs, ${stageColumns.length} funnel stages, ${mappedCharts.length} charts`)

    // =====================================================
    // STEP 3: DATA QUALITY ANALYSIS
    // =====================================================
    
    const dataQuality = analyzeDataQuality(allRows, timeColumn, stageColumns)
    
    // Build warnings array from quality report
    const warnings: DataQualityWarning[] = [...dataQuality.warnings]
    
    if (dataLimited) {
      warnings.push({
        code: 'DATA_LIMITED',
        severity: 'warning',
        message: `Dados limitados a ${aggregation_limit} linhas para performance. Total real: ${totalCount}`,
        value: aggregation_limit
      })
    }

    // =====================================================
    // STEP 4: COMPUTE AGGREGATIONS (COMPLETE DATA)
    // =====================================================
    
    const aggregations = computeAggregations(allRows, plan, start || '2000-01-01', end || '2099-12-31')

    // =====================================================
    // STEP 5: FIND DATE RANGE FROM DATA
    // =====================================================
    
    let dataDateRange = { min: null as string | null, max: null as string | null }
    if (timeColumn && allRows.length > 0) {
      const dates = allRows
        .map((r: Record<string, unknown>) => parseDate(r[timeColumn]))
        .filter((d: Date | null): d is Date => d !== null)
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      
      if (dates.length > 0) {
        dataDateRange.min = formatDateKey(dates[0])
        dataDateRange.max = formatDateKey(dates[dates.length - 1])
      }
    }

    // =====================================================
    // STEP 6: PREPARE PAGINATED ROWS FOR DETAILS TABLE
    // =====================================================
    
    const startIndex = (page - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, allRows.length)
    const paginatedRows = allRows.slice(startIndex, endIndex)
    
    const pagination = {
      page,
      pageSize,
      total_rows: allRows.length,
      total_pages: Math.ceil(allRows.length / pageSize),
      has_more: endIndex < allRows.length
    }

    // =====================================================
    // STEP 7: RETURN COMPLETE RESPONSE
    // =====================================================

    return jsonResponse({
      ok: true,
      trace_id: traceId,
      
      // Aggregated data (COMPLETE - for KPIs, charts, funnel)
      aggregations,
      
      // Paginated rows (for details table)
      rows: paginatedRows,
      pagination,
      
      // Data quality information
      data_quality: {
        time_parse_rate: dataQuality.time_parse_rate,
        truthy_rates: dataQuality.truthy_rates,
        degraded_mode: dataQuality.degraded_mode,
        total_rows_aggregated: allRows.length
      },
      
      // Warnings
      warnings,
      
      // Metadata
      meta: {
        dashboard_id,
        dataset_ref: `public.${objectName}`,
        range: { start, end },
        rows_fetched: allRows.length,
        rows_total: totalCount,
        rows_displayed: paginatedRows.length,
        data_limited: dataLimited,
        time_column: timeColumn,
        date_range: dataDateRange,
        has_spec: Object.keys(spec).length > 0,
        trace_id: traceId,
        aggregation_complete: !dataLimited || allRows.length >= totalCount
      }
    })

  } catch (error: any) {
    const traceId = crypto.randomUUID().slice(0, 8)
    console.error(`[${traceId}] Error in dashboard-data-v2:`, error)
    return jsonResponse({ 
      ok: false, 
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno', details: error.message },
      trace_id: traceId 
    }, 500)
  }
})
