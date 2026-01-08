/**
 * Shared Data Parsing Module
 * 
 * Single source of truth for:
 * - Truthy value detection (CRM flags)
 * - Date parsing (ISO, BR, timestamp)
 * - Data quality checks
 */

// =====================================================
// TRUTHY VALUE HANDLING
// =====================================================

const TRUTHY_VALUES = new Set([
  '1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'on',
  'ativo', 'realizado', 'agendado', 'ganho', 'concluido', 'fechado'
])

const FALSY_VALUES = new Set([
  '0', 'false', 'nao', 'não', 'n', 'no', 'off',
  'inativo', 'pendente', 'cancelado', 'perdido', ''
])

export function isTruthy(value: any): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v)
}

export function isFalsy(value: any): boolean {
  if (value === null || value === undefined) return true
  const v = String(value).toLowerCase().trim()
  return FALSY_VALUES.has(v)
}

export function isBooleanLike(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return value === 0 || value === 1
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v) || FALSY_VALUES.has(v)
}

// =====================================================
// DATE PARSING
// =====================================================

export interface ParsedDate {
  date: Date
  dateKey: string  // YYYY-MM-DD format
  valid: boolean
}

export function parseDate(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null
  
  // Already a Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }
  
  // Unix timestamp (seconds or milliseconds)
  if (typeof value === 'number') {
    const date = new Date(value > 1e11 ? value : value * 1000)
    return isNaN(date.getTime()) ? null : date
  }
  
  if (typeof value !== 'string') return null
  
  const str = value.trim()
  
  // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
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
  
  // US format: MM/DD/YYYY (try as fallback)
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (usMatch) {
    const [, month, day, year] = usMatch
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    if (!isNaN(d.getTime()) && d.getDate() === parseInt(day)) {
      return d
    }
  }
  
  // Fallback: try native parsing
  const fallback = new Date(str)
  return isNaN(fallback.getTime()) ? null : fallback
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateWithKey(value: any): ParsedDate | null {
  const date = parseDate(value)
  if (!date) return null
  return {
    date,
    dateKey: formatDateKey(date),
    valid: true
  }
}

// =====================================================
// DATA QUALITY CHECKS
// =====================================================

export interface DataQualityReport {
  total_rows: number
  time_parse_rate: number
  truthy_rates: Record<string, number>
  null_rates: Record<string, number>
  warnings: DataQualityWarning[]
  degraded_mode: boolean
}

export interface DataQualityWarning {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  column?: string
  value?: number
}

export function analyzeDataQuality(
  rows: Record<string, any>[],
  timeColumn: string | null,
  stageColumns: string[]
): DataQualityReport {
  const report: DataQualityReport = {
    total_rows: rows.length,
    time_parse_rate: 0,
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
    
    // Detect null rate
    const nullCount = rows.length - nonNull.length
    report.null_rates[col] = nullCount / rows.length
    
    // Warn if all values are the same (likely misconfigured)
    if (rate === 0) {
      report.warnings.push({
        code: 'ZERO_TRUTHY',
        severity: 'info',
        message: `Coluna "${col}" tem 0% de valores truthy`,
        column: col,
        value: 0
      })
    } else if (rate === 1) {
      report.warnings.push({
        code: 'ALL_TRUTHY',
        severity: 'info',
        message: `Coluna "${col}" tem 100% de valores truthy`,
        column: col,
        value: 1
      })
    }
  }
  
  // Check for high null rates
  const allColumns = Object.keys(rows[0] || {})
  for (const col of allColumns) {
    const nullCount = rows.filter(r => r[col] === null || r[col] === undefined).length
    const nullRate = nullCount / rows.length
    report.null_rates[col] = nullRate
    
    if (nullRate > 0.5 && !stageColumns.includes(col)) {
      report.warnings.push({
        code: 'HIGH_NULL_RATE',
        severity: 'info',
        message: `Coluna "${col}" tem ${Math.round(nullRate * 100)}% de valores nulos`,
        column: col,
        value: nullRate
      })
    }
  }
  
  return report
}

// =====================================================
// CONSISTENCY VALIDATION
// =====================================================

export interface ConsistencyCheck {
  valid: boolean
  issues: string[]
}

export function validateFunnelConsistency(
  funnel: { stage: string; value: number }[]
): ConsistencyCheck {
  const result: ConsistencyCheck = { valid: true, issues: [] }
  
  if (funnel.length < 2) return result
  
  // Check that earlier stages have >= later stages (typical funnel)
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1]
    const curr = funnel[i]
    
    // Only warn for major inversions (>10% difference)
    if (curr.value > prev.value * 1.1) {
      result.issues.push(
        `"${curr.stage}" (${curr.value}) > "${prev.stage}" (${prev.value})`
      )
    }
  }
  
  if (result.issues.length > 0) {
    result.valid = false
  }
  
  return result
}

export function validateKPIConsistency(
  kpis: Record<string, number>
): ConsistencyCheck {
  const result: ConsistencyCheck = { valid: true, issues: [] }
  
  // Check sales <= leads
  if (kpis.venda !== undefined && kpis.leads_total !== undefined) {
    if (kpis.venda > kpis.leads_total) {
      result.valid = false
      result.issues.push(`Vendas (${kpis.venda}) > Leads (${kpis.leads_total})`)
    }
  }
  
  // Check rates are between 0 and 100
  for (const [key, value] of Object.entries(kpis)) {
    if (key.startsWith('taxa_') || key.includes('_rate')) {
      if (value < 0 || value > 100) {
        result.issues.push(`Taxa "${key}" fora do range: ${value}`)
      }
    }
  }
  
  return result
}

// =====================================================
// ADAPTIVE AGGREGATION
// =====================================================

export type TimeGrain = 'day' | 'week' | 'month'

export function determineTimeGrain(
  startDate: Date,
  endDate: Date,
  maxPoints: number = 400
): TimeGrain {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  
  if (days <= maxPoints) return 'day'
  if (days / 7 <= maxPoints) return 'week'
  return 'month'
}

export function getTimeGroupKey(date: Date, grain: TimeGrain): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  
  switch (grain) {
    case 'day':
      return `${year}-${month}-${day}`
    case 'week': {
      // Get ISO week start (Monday)
      const d = new Date(date)
      const dayOfWeek = d.getDay() || 7
      d.setDate(d.getDate() - dayOfWeek + 1)
      return formatDateKey(d)
    }
    case 'month':
      return `${year}-${month}-01`
  }
}
