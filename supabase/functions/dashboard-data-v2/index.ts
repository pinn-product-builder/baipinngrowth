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
// COLUMN ALIAS RESOLUTION (P0 FIX)
// =====================================================

const COLUMN_ALIASES: Record<string, string[]> = {
  // Funnel stages
  'venda': ['venda', 'vendas', 'st_venda', 'venda_realizada', 'fechou', 'ganhou'],
  'perdida': ['perdida', 'st_perdida', 'loss', 'lost', 'perdido', 'cancelado'],
  'qualificado': ['qualificado', 'st_qualificado', 'qualified', 'qualificados'],
  'entrada': ['entrada', 'st_entrada', 'entradas', 'lead_novo', 'novo'],
  'lead_ativo': ['lead_ativo', 'st_lead_ativo', 'ativo', 'ativos'],
  'exp_agendada': ['exp_agendada', 'st_exp_agendada', 'agendada', 'agendado', 'experiencia_agendada'],
  'exp_realizada': ['exp_realizada', 'st_exp_realizada', 'realizada', 'experiencia_realizada'],
  'exp_nao_confirmada': ['exp_nao_confirmada', 'st_exp_nao_confirmada', 'nao_confirmada'],
  'faltou_exp': ['faltou_exp', 'st_faltou_exp', 'faltou', 'no_show'],
  'reagendou': ['reagendou', 'st_reagendou', 'reagendamento'],
  
  // Time columns
  'created_at': ['created_at', 'data', 'dia', 'date', 'data_criacao', 'inserted_at', 'created_at_ts'],
  
  // Dimensions
  'unidade': ['unidade', 'unidade_final', 'unit', 'loja', 'filial'],
  'vendedor': ['vendedor', 'vendedora', 'seller', 'responsavel'],
  'origem': ['origem', 'source', 'canal', 'channel'],
}

interface ColumnResolution {
  specColumn: string
  actualColumn: string | null
  resolved: boolean
  candidates: string[]
  warning?: string
}

/**
 * Resolve a spec column name to an actual column in the data.
 * Uses case-insensitive matching, prefix matching (st_), and synonyms.
 */
function resolveColumn(specColumn: string, availableColumns: string[]): ColumnResolution {
  const spec = specColumn.toLowerCase().trim()
  const lowerMap = new Map(availableColumns.map(c => [c.toLowerCase(), c]))
  
  // 1. Exact match (case-insensitive)
  if (lowerMap.has(spec)) {
    return {
      specColumn,
      actualColumn: lowerMap.get(spec)!,
      resolved: true,
      candidates: [lowerMap.get(spec)!]
    }
  }
  
  // 2. Try with/without st_ prefix
  const withSt = `st_${spec}`
  const withoutSt = spec.startsWith('st_') ? spec.slice(3) : null
  
  if (lowerMap.has(withSt)) {
    return {
      specColumn,
      actualColumn: lowerMap.get(withSt)!,
      resolved: true,
      candidates: [lowerMap.get(withSt)!]
    }
  }
  
  if (withoutSt && lowerMap.has(withoutSt)) {
    return {
      specColumn,
      actualColumn: lowerMap.get(withoutSt)!,
      resolved: true,
      candidates: [lowerMap.get(withoutSt)!]
    }
  }
  
  // 3. Check synonyms from alias table
  for (const [canonical, synonyms] of Object.entries(COLUMN_ALIASES)) {
    const allVariants = [canonical, ...synonyms].map(s => s.toLowerCase())
    
    if (allVariants.includes(spec)) {
      // Look for any variant in available columns
      for (const variant of allVariants) {
        if (lowerMap.has(variant)) {
          return {
            specColumn,
            actualColumn: lowerMap.get(variant)!,
            resolved: true,
            candidates: [lowerMap.get(variant)!]
          }
        }
        // Also try with st_ prefix
        if (lowerMap.has(`st_${variant}`)) {
          return {
            specColumn,
            actualColumn: lowerMap.get(`st_${variant}`)!,
            resolved: true,
            candidates: [lowerMap.get(`st_${variant}`)!]
          }
        }
      }
    }
  }
  
  // 4. Partial match - find columns containing the spec name
  const partialMatches: string[] = []
  for (const [lower, original] of lowerMap) {
    if (lower.includes(spec) || spec.includes(lower)) {
      partialMatches.push(original)
    }
  }
  
  if (partialMatches.length === 1) {
    return {
      specColumn,
      actualColumn: partialMatches[0],
      resolved: true,
      candidates: partialMatches,
      warning: `Coluna "${specColumn}" resolvida via match parcial para "${partialMatches[0]}"`
    }
  }
  
  // Not found
  return {
    specColumn,
    actualColumn: null,
    resolved: false,
    candidates: partialMatches,
    warning: `Coluna "${specColumn}" não encontrada. Candidatos: ${partialMatches.join(', ') || 'nenhum'}`
  }
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
// DATA QUALITY ANALYSIS WITH COLUMN AUDIT (P0 FIX)
// =====================================================

interface ColumnAudit {
  column: string
  specColumn: string
  resolved: boolean
  nonNullCount: number
  truthyCount: number
  falsyCount: number
  topValues: { value: string; count: number }[]
  warning?: string
}

interface DataQualityWarning {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  column?: string
  value?: number
}

interface DataQualityReport {
  time_column: string | null
  time_column_resolved: string | null
  time_parse_rate: number
  rows_in_period: number
  rows_scanned_total: number
  truthy_rates: Record<string, number>
  null_rates: Record<string, number>
  column_audits: ColumnAudit[]
  warnings: DataQualityWarning[]
  degraded_mode: boolean
}

function auditColumn(
  rows: Record<string, any>[],
  specColumn: string,
  actualColumn: string | null,
  resolved: boolean
): ColumnAudit {
  const audit: ColumnAudit = {
    column: actualColumn || specColumn,
    specColumn,
    resolved,
    nonNullCount: 0,
    truthyCount: 0,
    falsyCount: 0,
    topValues: []
  }
  
  if (!actualColumn || !resolved) {
    audit.warning = `Coluna "${specColumn}" não encontrada no dataset`
    return audit
  }
  
  const valueCounts = new Map<string, number>()
  
  for (const row of rows) {
    const val = row[actualColumn]
    
    if (val !== null && val !== undefined && val !== '') {
      audit.nonNullCount++
      
      if (isTruthy(val)) {
        audit.truthyCount++
      } else {
        audit.falsyCount++
      }
      
      // Track top values
      const strVal = String(val).substring(0, 50)
      valueCounts.set(strVal, (valueCounts.get(strVal) || 0) + 1)
    }
  }
  
  // Get top 5 values
  audit.topValues = [...valueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }))
  
  // Add warning if all zeros
  if (audit.nonNullCount > 0 && audit.truthyCount === 0) {
    audit.warning = `Coluna "${actualColumn}" não contém valores truthy. Top values: ${audit.topValues.map(v => v.value).join(', ')}`
  }
  
  return audit
}

function analyzeDataQuality(
  rows: Record<string, any>[],
  timeColumn: string | null,
  resolvedTimeColumn: string | null,
  stageResolutions: ColumnResolution[],
  startDate: string,
  endDate: string
): DataQualityReport {
  const report: DataQualityReport = {
    time_column: timeColumn,
    time_column_resolved: resolvedTimeColumn,
    time_parse_rate: 1,
    rows_in_period: 0,
    rows_scanned_total: rows.length,
    truthy_rates: {},
    null_rates: {},
    column_audits: [],
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
  if (resolvedTimeColumn) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    
    let parsedCount = 0
    let inPeriodCount = 0
    
    for (const row of rows) {
      const d = parseDate(row[resolvedTimeColumn])
      if (d !== null) {
        parsedCount++
        if (d >= start && d <= end) {
          inPeriodCount++
        }
      }
    }
    
    report.time_parse_rate = parsedCount / rows.length
    report.rows_in_period = inPeriodCount
    
    if (report.time_parse_rate < 0.7) {
      report.warnings.push({
        code: 'LOW_TIME_PARSE_RATE',
        severity: 'warning',
        message: `Coluna de tempo "${resolvedTimeColumn}" tem ${Math.round(report.time_parse_rate * 100)}% de parse válido`,
        column: resolvedTimeColumn,
        value: report.time_parse_rate
      })
      report.degraded_mode = true
    }
    
    if (inPeriodCount === 0 && parsedCount > 0) {
      report.warnings.push({
        code: 'NO_DATA_IN_PERIOD',
        severity: 'error',
        message: `Nenhuma linha no período ${startDate} a ${endDate}. Total linhas: ${rows.length}`,
        value: 0
      })
    }
  } else {
    report.rows_in_period = rows.length // Without time filter, use all rows
  }
  
  // Audit each stage column
  for (const resolution of stageResolutions) {
    const audit = auditColumn(rows, resolution.specColumn, resolution.actualColumn, resolution.resolved)
    report.column_audits.push(audit)
    
    if (audit.resolved && audit.nonNullCount > 0) {
      report.truthy_rates[resolution.specColumn] = audit.truthyCount / audit.nonNullCount
      report.null_rates[resolution.specColumn] = (rows.length - audit.nonNullCount) / rows.length
    }
    
    if (!resolution.resolved) {
      report.warnings.push({
        code: 'COLUMN_NOT_FOUND',
        severity: 'warning',
        message: resolution.warning || `Coluna "${resolution.specColumn}" não encontrada`,
        column: resolution.specColumn
      })
    } else if (audit.warning) {
      report.warnings.push({
        code: 'ZERO_TRUTHY',
        severity: 'warning',
        message: audit.warning,
        column: resolution.actualColumn!,
        value: 0
      })
    }
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
// AGGREGATION WITH COLUMN RESOLUTION (P0 FIX)
// =====================================================

interface KpiResult {
  column: string
  resolvedColumn: string | null
  label: string
  value: number
  formula: string
  auditInfo: {
    nonNullCount: number
    truthyCount: number
    resolved: boolean
  }
}

interface AggregationResult {
  kpis: Record<string, number>
  kpi_details: KpiResult[]
  series: Record<string, Record<string, number>[]>
  rankings: Record<string, { dimension: string; value: number }[]>
  funnel: { stage: string; label: string; value: number; count: number; rate?: number }[]
}

function computeAggregations(
  rows: Record<string, any>[],
  plan: any,
  startDate: string,
  endDate: string,
  availableColumns: string[]
): AggregationResult {
  const result: AggregationResult = {
    kpis: {},
    kpi_details: [],
    series: {},
    rankings: {},
    funnel: []
  }

  if (rows.length === 0) {
    return result
  }

  // Resolve time column
  const timeColumnSpec = plan.time_column
  const timeResolution = timeColumnSpec ? resolveColumn(timeColumnSpec, availableColumns) : null
  const resolvedTimeColumn = timeResolution?.actualColumn
  
  // Filter rows by date range if time column exists
  let filteredRows = rows
  if (resolvedTimeColumn) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    
    filteredRows = rows.filter(row => {
      const d = parseDate(row[resolvedTimeColumn])
      return d && d >= start && d <= end
    })
  }

  // 1. Compute KPIs with column resolution
  for (const kpi of plan.kpis || []) {
    const specColumn = kpi.column
    const resolution = resolveColumn(specColumn, availableColumns)
    const actualColumn = resolution.actualColumn
    
    let value = 0
    let formula = 'N/A'
    let nonNullCount = 0
    let truthyCount = 0
    
    if (actualColumn && resolution.resolved) {
      switch (kpi.aggregation) {
        case 'sum':
          formula = `SUM(${actualColumn})`
          value = filteredRows.reduce((sum, row) => {
            const v = parseFloat(row[actualColumn])
            if (isFinite(v)) {
              nonNullCount++
              return sum + v
            }
            return sum
          }, 0)
          break
          
        case 'count':
          formula = 'COUNT(*)'
          value = filteredRows.length
          nonNullCount = filteredRows.length
          break
          
        case 'count_distinct':
          formula = `COUNT(DISTINCT ${actualColumn})`
          const uniqueValues = new Set(filteredRows.map(row => row[actualColumn]).filter(v => v != null))
          value = uniqueValues.size
          nonNullCount = uniqueValues.size
          break
          
        case 'avg':
          formula = `AVG(${actualColumn})`
          const nums = filteredRows.map(row => parseFloat(row[actualColumn])).filter(v => isFinite(v))
          nonNullCount = nums.length
          value = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
          break
          
        case 'truthy_count':
        default:
          formula = `COUNT(${actualColumn} WHERE truthy)`
          for (const row of filteredRows) {
            if (row[actualColumn] !== null && row[actualColumn] !== undefined && row[actualColumn] !== '') {
              nonNullCount++
            }
            if (isTruthy(row[actualColumn])) {
              truthyCount++
            }
          }
          value = truthyCount
          break
      }
    }
    
    result.kpis[specColumn] = value
    result.kpi_details.push({
      column: specColumn,
      resolvedColumn: actualColumn,
      label: kpi.label || specColumn,
      value,
      formula,
      auditInfo: {
        nonNullCount,
        truthyCount,
        resolved: resolution.resolved
      }
    })
  }

  // 2. Compute funnel with column resolution
  if (plan.funnel?.stages) {
    let prevCount = 0
    for (let i = 0; i < plan.funnel.stages.length; i++) {
      const stage = plan.funnel.stages[i]
      const specColumn = stage.column
      const resolution = resolveColumn(specColumn, availableColumns)
      const actualColumn = resolution.actualColumn
      
      let count = 0
      if (actualColumn && resolution.resolved) {
        count = filteredRows.filter(row => isTruthy(row[actualColumn])).length
      }
      
      const rate = i > 0 && prevCount > 0 ? count / prevCount : 1
      result.funnel.push({
        stage: specColumn,
        label: stage.label || specColumn,
        value: count,
        count: count,
        rate: i > 0 ? rate : undefined
      })
      prevCount = count
    }
  }

  // 3. Compute time series (if time column exists and resolves)
  if (resolvedTimeColumn) {
    // Group by date
    const byDate = new Map<string, Record<string, any>[]>()
    
    for (const row of filteredRows) {
      const d = parseDate(row[resolvedTimeColumn])
      if (!d) continue
      const key = formatDateKey(d)
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push(row)
    }
    
    // Sort dates
    const sortedDates = [...byDate.keys()].sort()
    
    // Compute series for each chart
    for (const chart of plan.charts || []) {
      const seriesArray = Array.isArray(chart.series) ? chart.series : []
      if (seriesArray.length === 0) continue
      
      const chartSeries: Record<string, number>[] = []
      
      for (const dateKey of sortedDates) {
        const dateRows = byDate.get(dateKey)!
        const point: Record<string, number> = { date: new Date(dateKey).getTime() }
        
        for (const s of seriesArray) {
          const seriesColumn = s.column
          const resolution = resolveColumn(seriesColumn, availableColumns)
          const actualColumn = resolution.actualColumn
          
          if (!actualColumn || !resolution.resolved) {
            point[seriesColumn] = 0
            continue
          }
          
          // Sum or truthy_count depending on column type
          const kpiDef = plan.kpis.find((k: any) => k.column === seriesColumn)
          
          if (kpiDef?.aggregation === 'truthy_count') {
            point[seriesColumn] = dateRows.filter(row => isTruthy(row[actualColumn])).length
          } else if (kpiDef?.aggregation === 'avg') {
            const nums = dateRows.map(row => parseFloat(row[actualColumn])).filter(v => isFinite(v))
            point[seriesColumn] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
          } else {
            point[seriesColumn] = dateRows.reduce((sum, row) => {
              const v = parseFloat(row[actualColumn])
              return sum + (isFinite(v) ? v : 0)
            }, 0)
          }
        }
        
        chartSeries.push(point)
      }
      
      result.series[chart.id] = chartSeries
    }
  }

  // 4. Compute rankings with column resolution
  for (const ranking of plan.rankings || []) {
    const dimResolution = resolveColumn(ranking.dimension_column, availableColumns)
    const metricResolution = resolveColumn(ranking.metric_column, availableColumns)
    
    if (!dimResolution.resolved || !metricResolution.resolved) {
      result.rankings[ranking.id] = []
      continue
    }
    
    const dimCol = dimResolution.actualColumn!
    const metricCol = metricResolution.actualColumn!
    
    const grouped = new Map<string, number>()
    
    for (const row of filteredRows) {
      const dimValue = String(row[dimCol] || 'Outros')
      const current = grouped.get(dimValue) || 0
      
      let metricValue = 0
      switch (ranking.aggregation) {
        case 'sum':
          metricValue = parseFloat(row[metricCol])
          if (!isFinite(metricValue)) metricValue = 0
          break
        case 'count':
          metricValue = 1
          break
        case 'avg':
          metricValue = parseFloat(row[metricCol])
          if (!isFinite(metricValue)) metricValue = 0
          break
      }
      
      grouped.set(dimValue, current + metricValue)
    }
    
    // For avg, divide by count
    if (ranking.aggregation === 'avg') {
      const counts = new Map<string, number>()
      for (const row of filteredRows) {
        const dimValue = String(row[dimCol] || 'Outros')
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
      mode = 'aggregate',
      page = 1,
      pageSize = 100,
      sort_column,
      sort_direction = 'desc',
      filters = {},
    } = body

    console.log(`[${traceId}] dashboard-data-v2: mode=${mode}, dashboard_id=${dashboard_id}, start=${start}, end=${end}`)

    if (!dashboard_id) {
      console.warn(`[${traceId}] Missing dashboard_id parameter`)
      return errorResponse('MISSING_PARAM', 'dashboard_id é obrigatório', undefined, traceId)
    }

    if (mode !== 'aggregate' && mode !== 'details') {
      return errorResponse('INVALID_PARAM', 'mode deve ser "aggregate" ou "details"', undefined, traceId)
    }

    // Fetch dashboard with all data source fields
    const { data: dashboard, error: dashError } = await adminClient
      .from('dashboards')
      .select(`
        id, name, tenant_id, 
        data_source_id,
        view_name,
        dashboard_spec,
        detected_columns,
        tenant_data_sources(
          id, project_url, type, anon_key_encrypted, service_role_key_encrypted,
          google_access_token_encrypted, google_refresh_token_encrypted,
          google_client_id_encrypted, google_client_secret_encrypted,
          google_spreadsheet_id, google_sheet_name, google_token_expires_at
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
      const { data: roleData } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
      
      if (!roleData || roleData.length === 0) {
        return errorResponse('ACCESS_DENIED', 'Acesso negado a este dashboard', undefined, traceId)
      }
    }

    const dataSource = dashboard.tenant_data_sources as any
    const objectName = dashboard.view_name

    if (!dataSource || !objectName) {
      return errorResponse('NO_BINDING', 'Dashboard não está vinculado a um view_name/datasource válido', undefined, traceId)
    }

    // Check if this is a Google Sheets data source
    const isGoogleSheets = dataSource.type === 'google_sheets'
    let apiKey: string | null = null
    let googleAccessToken: string | null = null

    if (isGoogleSheets) {
      // Try to get Google Sheets access token
      if (dataSource.google_access_token_encrypted) {
        try { googleAccessToken = await decrypt(dataSource.google_access_token_encrypted) } catch (e) {
          console.error(`[${traceId}] Failed to decrypt Google access token:`, e)
        }
      }
      
      // Refresh token if needed
      if (!googleAccessToken && dataSource.google_refresh_token_encrypted) {
        try {
          const refreshToken = await decrypt(dataSource.google_refresh_token_encrypted)
          const clientId = dataSource.google_client_id_encrypted 
            ? await decrypt(dataSource.google_client_id_encrypted) 
            : Deno.env.get('GOOGLE_CLIENT_ID')
          const clientSecret = dataSource.google_client_secret_encrypted 
            ? await decrypt(dataSource.google_client_secret_encrypted) 
            : Deno.env.get('GOOGLE_CLIENT_SECRET')
          
          if (refreshToken && clientId && clientSecret) {
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
              })
            })
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json()
              googleAccessToken = tokenData.access_token
              console.log(`[${traceId}] Refreshed Google access token`)
            } else {
              console.error(`[${traceId}] Failed to refresh token:`, await tokenResponse.text())
            }
          }
        } catch (e) {
          console.error(`[${traceId}] Token refresh error:`, e)
        }
      }
      
      if (!googleAccessToken) {
        return errorResponse('NO_CREDENTIALS', 'Credenciais do Google Sheets não configuradas ou expiradas', undefined, traceId)
      }
    } else {
      // Supabase data source - get API key
      if (dataSource.service_role_key_encrypted) {
        try { apiKey = await decrypt(dataSource.service_role_key_encrypted) } catch (e) {}
      }

      if (!apiKey && dataSource.anon_key_encrypted) {
        try { apiKey = await decrypt(dataSource.anon_key_encrypted) } catch (e) {}
      }

      if (!apiKey) {
        const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
        const afonsinaKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
        if (afonsinaUrl && dataSource.project_url === afonsinaUrl && afonsinaKey) {
          apiKey = afonsinaKey
        }
      }

      if (!apiKey) {
        return errorResponse('NO_CREDENTIALS', 'Credenciais do datasource não configuradas', undefined, traceId)
      }
    }

    const spec = dashboard.dashboard_spec || {}
    const timeColumnSpec = spec.time?.column

    // =====================================================
    // BUILD URL (NO LIMIT FOR AGGREGATE MODE - P0 FIX)
    // =====================================================
    
    function buildFilteredUrl(baseUrl: string, limit?: number): string {
      let url = `${baseUrl}?select=*`
      
      // Note: We do NOT add date filters here for aggregate mode
      // because we need ALL data for proper aggregation and the
      // date filtering is done in-memory after column resolution
      
      // Add dynamic filters
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            url += `&${key}=in.(${value.map(v => encodeURIComponent(String(v))).join(',')})`
          } else if (typeof value === 'string' && value.includes('*')) {
            url += `&${key}=ilike.${encodeURIComponent(value)}`
          } else {
            url += `&${key}=eq.${encodeURIComponent(String(value))}`
          }
        }
      }
      
      if (limit) {
        url += `&limit=${limit}`
      }
      
      return url
    }

    // =====================================================
    // HELPER: Fetch data from Google Sheets
    // =====================================================
    async function fetchGoogleSheetsData(sheetName: string): Promise<Record<string, any>[]> {
      const spreadsheetId = dataSource.google_spreadsheet_id
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`
      
      console.log(`[${traceId}] Fetching Google Sheet: ${sheetName}`)
      
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { 'Authorization': `Bearer ${googleAccessToken}` }
      })
      
      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text()
        console.error(`[${traceId}] Google Sheets error ${sheetsResponse.status}:`, errorText)
        throw new Error(`Erro ao acessar planilha: ${sheetsResponse.status}`)
      }
      
      const sheetsData = await sheetsResponse.json()
      const rawRows = sheetsData.values || []
      
      if (rawRows.length < 1) {
        return []
      }
      
      // Convert to objects using first row as headers
      const headers = rawRows[0]
      return rawRows.slice(1).map((row: string[]) => {
        const obj: Record<string, any> = {}
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i] ?? null
        })
        return obj
      })
    }

    // =====================================================
    // HELPER: Fetch data from Supabase REST API
    // =====================================================
    async function fetchSupabaseData(url: string): Promise<{ rows: Record<string, any>[]; totalCount: number }> {
      const response = await fetch(url, {
        headers: {
          'apikey': apiKey!,
          'Authorization': `Bearer ${apiKey!}`,
          'Accept': 'application/json',
          'Prefer': 'count=exact'
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[${traceId}] Supabase error ${response.status}:`, errorText)
        throw new Error(`Erro ao consultar dados: ${response.status}`)
      }
      
      const rows = await response.json()
      const totalCount = parseInt(response.headers.get('content-range')?.split('/')[1] || String(rows.length))
      return { rows, totalCount }
    }

    // =====================================================
    // MODE: DETAILS - Paginated table data
    // =====================================================
    
    if (mode === 'details') {
      let rows: Record<string, any>[] = []
      let totalCount = 0
      
      if (isGoogleSheets) {
        // Google Sheets doesn't support server-side pagination, fetch all and paginate in memory
        const allRows = await fetchGoogleSheetsData(objectName)
        const availableColumns = allRows.length > 0 ? Object.keys(allRows[0]) : []
        const timeResolution = timeColumnSpec ? resolveColumn(timeColumnSpec, availableColumns) : null
        const resolvedTimeColumn = timeResolution?.actualColumn
        
        // Filter by date if needed
        let filteredRows = allRows
        if (resolvedTimeColumn && start && end) {
          const startDate = new Date(start)
          const endDate = new Date(end)
          endDate.setHours(23, 59, 59, 999)
          filteredRows = allRows.filter(row => {
            const d = parseDate(row[resolvedTimeColumn])
            return d && d >= startDate && d <= endDate
          })
        }
        
        // Apply sorting
        if (sort_column) {
          filteredRows.sort((a, b) => {
            const aVal = a[sort_column] ?? ''
            const bVal = b[sort_column] ?? ''
            const cmp = String(aVal).localeCompare(String(bVal))
            return sort_direction === 'asc' ? cmp : -cmp
          })
        }
        
        totalCount = filteredRows.length
        const offset = (page - 1) * pageSize
        rows = filteredRows.slice(offset, offset + pageSize)
      } else {
        const offset = (page - 1) * pageSize
        
        // First get available columns
        const sampleUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*&limit=1`
        const { rows: sampleRows } = await fetchSupabaseData(sampleUrl)
        const availableColumns = sampleRows.length > 0 ? Object.keys(sampleRows[0]) : []
        const timeResolution = timeColumnSpec ? resolveColumn(timeColumnSpec, availableColumns) : null
        const resolvedTimeColumn = timeResolution?.actualColumn
        
        let detailsUrl = buildFilteredUrl(`${dataSource.project_url}/rest/v1/${objectName}`, pageSize)
        detailsUrl += `&offset=${offset}`
        
        if (resolvedTimeColumn && start && end) {
          detailsUrl += `&${resolvedTimeColumn}=gte.${start}&${resolvedTimeColumn}=lte.${end}`
        }
        
        if (sort_column) {
          detailsUrl += `&order=${sort_column}.${sort_direction === 'asc' ? 'asc' : 'desc'}`
        } else if (resolvedTimeColumn) {
          detailsUrl += `&order=${resolvedTimeColumn}.desc`
        }
        
        const result = await fetchSupabaseData(detailsUrl)
        rows = result.rows
        totalCount = result.totalCount
      }
      
      return successResponse({
        mode: 'details',
        rows,
        pagination: {
          page,
          pageSize,
          total_rows: totalCount,
          total_pages: Math.ceil(totalCount / pageSize),
          has_more: (page * pageSize) < totalCount
        },
        meta: {
          dashboard_id,
          dataset_ref: isGoogleSheets ? `sheets.${objectName}` : `public.${objectName}`,
          range: { start, end },
          trace_id: traceId
        }
      })
    }
    
    // =====================================================
    // MODE: AGGREGATE - FULL aggregation (NO LIMIT - P0 FIX)
    // =====================================================
    
    let allRows: Record<string, any>[] = []
    let totalCount = 0
    let availableColumns: string[] = []
    
    if (isGoogleSheets) {
      allRows = await fetchGoogleSheetsData(objectName)
      availableColumns = allRows.length > 0 ? Object.keys(allRows[0]) : []
      totalCount = allRows.length
      console.log(`[${traceId}] Fetched ${allRows.length} rows from Google Sheets - FULL aggregation`)
    } else {
      // First, get a sample row to detect columns
      const sampleUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*&limit=1`
      const { rows: sampleRows } = await fetchSupabaseData(sampleUrl)
      availableColumns = sampleRows.length > 0 ? Object.keys(sampleRows[0]) : []
      
      // Resolve time column for server-side filtering
      const timeResolution = timeColumnSpec ? resolveColumn(timeColumnSpec, availableColumns) : null
      const resolvedTimeColumn = timeResolution?.actualColumn
      
      // Build URL WITHOUT limit for full aggregation
      let aggregationUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*`
      
      // Add date filter on resolved time column
      if (resolvedTimeColumn && start && end) {
        aggregationUrl += `&${resolvedTimeColumn}=gte.${start}&${resolvedTimeColumn}=lte.${end}`
      }
      
      // Add dynamic filters
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            aggregationUrl += `&${key}=in.(${value.map(v => encodeURIComponent(String(v))).join(',')})`
          } else {
            aggregationUrl += `&${key}=eq.${encodeURIComponent(String(value))}`
          }
        }
      }
      
      // Order by time
      if (resolvedTimeColumn) {
        aggregationUrl += `&order=${resolvedTimeColumn}.asc`
      }

      console.log(`[${traceId}] Aggregate mode: time_column=${timeColumnSpec}→${resolvedTimeColumn}, NO LIMIT (FULL)`)

      const result = await fetchSupabaseData(aggregationUrl)
      allRows = result.rows
      totalCount = result.totalCount
      
      console.log(`[${traceId}] Fetched ${allRows.length} rows (total: ${totalCount}) - FULL aggregation`)
    }
    
    // Resolve time column
    const timeResolution = timeColumnSpec ? resolveColumn(timeColumnSpec, availableColumns) : null
    const resolvedTimeColumn = timeResolution?.actualColumn

    // =====================================================
    // BUILD PLAN WITH COLUMN RESOLUTIONS
    // =====================================================
    
    const mappedKpis = (spec.kpis || []).map((kpi: any) => ({
      column: kpi.key || kpi.column,
      aggregation: kpi.aggregation || 'truthy_count',
      label: kpi.label
    }))
    
    const funnelStages = spec.funnel?.stages || spec.funnel?.steps || []
    const mappedFunnel = funnelStages.length > 0 ? {
      stages: funnelStages.map((s: any) => ({
        column: s.column || s.key,
        label: s.label
      }))
    } : null
    
    // Build stage column resolutions for quality report
    const stageColumns = mappedFunnel?.stages?.map((s: any) => s.column) || []
    const stageResolutions = stageColumns.map((col: string) => resolveColumn(col, availableColumns))
    
    const mappedCharts = (spec.charts || []).map((chart: any) => ({
      ...chart,
      id: chart.id || chart.label,
      series: Array.isArray(chart.series) ? chart.series.map((s: any) => ({
        column: s.column || s.key,
        label: s.label
      })) : []
    }))
    
    const plan = {
      time_column: timeColumnSpec,
      kpis: mappedKpis,
      charts: mappedCharts,
      rankings: [],
      funnel: mappedFunnel
    }
    
    console.log(`[${traceId}] Plan: ${mappedKpis.length} KPIs, ${stageColumns.length} funnel stages, ${mappedCharts.length} charts`)

    // =====================================================
    // DATA QUALITY ANALYSIS WITH AUDIT
    // =====================================================
    
    const dataQuality = analyzeDataQuality(
      allRows,
      timeColumnSpec || null,
      resolvedTimeColumn || null,
      stageResolutions,
      start || '2000-01-01',
      end || '2099-12-31'
    )
    
    const warnings = [...dataQuality.warnings]

    // =====================================================
    // COMPUTE AGGREGATIONS WITH COLUMN RESOLUTION
    // =====================================================
    
    const aggregations = computeAggregations(
      allRows,
      plan,
      start || '2000-01-01',
      end || '2099-12-31',
      availableColumns
    )

    // =====================================================
    // DATE RANGE FROM DATA
    // =====================================================
    
    let dataDateRange = { min: null as string | null, max: null as string | null }
    if (resolvedTimeColumn && allRows.length > 0) {
      const dates = allRows
        .map((r: Record<string, unknown>) => parseDate(r[resolvedTimeColumn]))
        .filter((d: Date | null): d is Date => d !== null)
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      
      if (dates.length > 0) {
        dataDateRange.min = formatDateKey(dates[0])
        dataDateRange.max = formatDateKey(dates[dates.length - 1])
      }
    }

    // =====================================================
    // PREPARE SAMPLE ROWS FOR TABLE PREVIEW
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
    // RETURN COMPLETE RESPONSE WITH DIAGNOSTICS
    // =====================================================

    return jsonResponse({
      ok: true,
      trace_id: traceId,
      
      // Aggregated data (COMPLETE - FULL, NO LIMIT)
      aggregations,
      
      // Paginated rows for details table
      rows: paginatedRows,
      pagination,
      
      // Data quality and audit information (P0 FIX)
      data_quality: {
        time_column_spec: timeColumnSpec,
        time_column_resolved: resolvedTimeColumn,
        time_parse_rate: dataQuality.time_parse_rate,
        rows_in_period: dataQuality.rows_in_period,
        rows_scanned_total: allRows.length,
        truthy_rates: dataQuality.truthy_rates,
        degraded_mode: dataQuality.degraded_mode,
        column_audits: dataQuality.column_audits
      },
      
      // Warnings
      warnings,
      
      // Column resolutions (for debugging)
      column_resolutions: {
        time: timeResolution,
        stages: stageResolutions.map((r: ColumnResolution) => ({
          spec: r.specColumn,
          actual: r.actualColumn,
          resolved: r.resolved
        }))
      },
      
      // Metadata
      meta: {
        dashboard_id,
        dataset_ref: `public.${objectName}`,
        range: { start, end },
        rows_fetched: allRows.length,
        rows_total: totalCount,
        rows_displayed: paginatedRows.length,
        data_limited: false, // P0 FIX: Never limited anymore
        time_column: resolvedTimeColumn,
        date_range: dataDateRange,
        has_spec: Object.keys(spec).length > 0,
        trace_id: traceId,
        aggregation_complete: true
      }
    })

  } catch (error: any) {
    console.error(`[${traceId}] Error:`, error)
    return jsonResponse({ 
      ok: false, 
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno', details: error.message },
      trace_id: traceId 
    }, 500)
  }
})
