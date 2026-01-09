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
  return jsonResponse({ ok: false, error: { code, message, details }, trace_id: traceId }, 400)
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data })
}

// Encryption helpers - MUST match google-sheets-connect encryption format
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyB64 = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!keyB64) throw new Error('MASTER_ENCRYPTION_KEY not set')
  const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

// =====================================================
// SEMANTIC TYPE DEFINITIONS v2
// =====================================================

type SemanticRole = 
  | 'time'           // Primary time axis (date/datetime)
  | 'id_primary'     // Primary unique identifier for count_distinct - NEVER show in UI
  | 'id_secondary'   // Secondary ID - completely ignored
  | 'stage_flag'     // Boolean-like indicating funnel stage
  | 'metric'         // Numeric value to aggregate
  | 'dimension'      // Categorical for grouping/filtering
  | 'rate'           // Pre-calculated percentage
  | 'currency'       // Currency values
  | 'status_enum'    // Status categorical (e.g., "ativo", "perdido")
  | 'text_long'      // Long text - ignore as filter
  | 'text'           // Generic text
  | 'ignore'         // Column to be ignored completely
  | 'unknown'

interface ColumnStats {
  null_rate: number
  distinct_count: number
  distinct_count_estimate: number  // NEW: Estimate for large datasets
  avg_len: number                  // NEW: Average string length
  boolean_like_rate: number
  numeric_parse_rate: number
  date_parse_rate: number
  monotonicity: number             // NEW: 0-1 how monotonic (increasing IDs)
  contains_currency_symbols: boolean  // NEW
  top_values: { value: string; count: number }[]  // NEW: Top 10 values
  top_value_coverage: number       // NEW: % of data covered by top values
  min?: number | string
  max?: number | string
  avg?: number
  sample_values: any[]
}

interface SemanticColumn {
  name: string
  db_type: string
  semantic_role: SemanticRole
  display_label: string
  aggregator: 'sum' | 'count' | 'count_distinct' | 'avg' | 'none' | 'truthy_count'
  format: 'currency' | 'percent' | 'integer' | 'float' | 'date' | 'text'
  stats: ColumnStats
  confidence: number
  notes: string[]
  usable_as_filter: boolean
  usable_in_kpi: boolean
  usable_in_chart: boolean
  ignore_in_ui: boolean
  filter_type?: 'multi_select' | 'search_select' | 'toggle' | 'none'  // NEW
}

interface FunnelStage {
  column: string
  label: string
  order: number
  truthy_count_expression: string
  prevalence?: number  // NEW: How many records have this stage
}

interface FilterPlan {
  id: string
  column: string
  label: string
  type: 'time_range' | 'multi_select' | 'search_select' | 'toggle'
  source: 'distinct_values' | 'manual'
  apply_to: string[]
}

interface SemanticModel {
  version: number
  dataset_id: string
  dataset_name: string
  columns: SemanticColumn[]
  time_column: string | null
  id_primary: string | null      // NEW: renamed from id_column
  id_secondary: string[]         // NEW: list of secondary IDs (ignored)
  funnel: {
    detected: boolean
    stages: FunnelStage[]
    confidence: number
    base_stage?: string          // NEW: Which stage is the "base" for rates
  }
  dimensions: string[]
  metrics: string[]
  filters: FilterPlan[]          // NEW: Auto-generated filter plan
  date_range: { min: string | null; max: string | null }
  overall_confidence: number
  warnings: string[]
  assumptions: string[]
  debug: {                       // NEW: Debug info
    ids_detected: string[]
    ids_discarded: string[]
    time_candidates: string[]
    rows_analyzed: number
  }
}

// =====================================================
// DETECTION HELPERS v2
// =====================================================

const TRUTHY_VALUES = new Set(['1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'on', 'ativo', 'realizado', 'agendado', 'ganho', 'concluido', 'fechado'])
const FALSY_VALUES = new Set(['0', 'false', 'nao', 'não', 'n', 'no', '', 'off', 'inativo', 'pendente', 'cancelado', 'perdido'])

const CURRENCY_SYMBOLS = ['R$', '$', '€', '£', '¥']

function isBooleanLike(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return value === 0 || value === 1
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v) || FALSY_VALUES.has(v)
}

function isTruthy(value: any): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v)
}

function looksLikeDate(value: any): boolean {
  if (value == null) return false
  if (value instanceof Date) return !isNaN(value.getTime())
  if (typeof value !== 'string') return false
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true
  if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) return true
  if (/^\d{2}-\d{2}-\d{4}/.test(value)) return true
  return false
}

function looksLikeNumeric(value: any): boolean {
  if (typeof value === 'number') return isFinite(value)
  if (typeof value !== 'string') return false
  const cleaned = value.replace(/[R$€£¥\s,]/g, '').replace(',', '.')
  return !isNaN(parseFloat(cleaned))
}

function parseNumeric(value: any): number | null {
  if (typeof value === 'number') return isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[R$€£¥\s]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isFinite(num) ? num : null
}

function containsCurrencySymbol(value: any): boolean {
  if (typeof value !== 'string') return false
  return CURRENCY_SYMBOLS.some(s => value.includes(s))
}

// Stage name patterns (ordered by typical funnel position)
const STAGE_PATTERNS: { pattern: RegExp; order: number; label: string }[] = [
  { pattern: /^(st_)?entrada$/i, order: 1, label: 'Entrada' },
  { pattern: /^(st_)?entrou$/i, order: 1, label: 'Entrada' },
  { pattern: /^(st_)?lead_entrada$/i, order: 1, label: 'Entrada' },
  { pattern: /^(st_)?lead_ativo$/i, order: 2, label: 'Lead Ativo' },
  { pattern: /^(st_)?ativo$/i, order: 2, label: 'Lead Ativo' },
  { pattern: /^(st_)?qualificado$/i, order: 3, label: 'Qualificado' },
  { pattern: /^(st_)?qualificacao$/i, order: 3, label: 'Qualificado' },
  { pattern: /^(st_)?lead_qualificado$/i, order: 3, label: 'Qualificado' },
  { pattern: /^(st_)?exp_nao_confirmada$/i, order: 3.5, label: 'Exp. Não Confirmada' },
  { pattern: /^(st_)?exp_agendada$/i, order: 4, label: 'Exp. Agendada' },
  { pattern: /^(st_)?agendado$/i, order: 4, label: 'Exp. Agendada' },
  { pattern: /^(st_)?agendamento$/i, order: 4, label: 'Exp. Agendada' },
  { pattern: /^(st_)?faltou_exp$/i, order: 4.5, label: 'Faltou Exp.' },
  { pattern: /^(st_)?reagendou$/i, order: 4.6, label: 'Reagendou' },
  { pattern: /^(st_)?exp_realizada$/i, order: 5, label: 'Exp. Realizada' },
  { pattern: /^(st_)?realizada$/i, order: 5, label: 'Exp. Realizada' },
  { pattern: /^(st_)?compareceu$/i, order: 5, label: 'Exp. Realizada' },
  { pattern: /^(st_)?venda$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?fechou$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?ganho$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?vendido$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?convertido$/i, order: 6, label: 'Venda' },
  { pattern: /^(st_)?perdida$/i, order: 99, label: 'Perdido' },
  { pattern: /^(st_)?perdido$/i, order: 99, label: 'Perdido' },
  { pattern: /^(st_)?perdeu$/i, order: 99, label: 'Perdido' },
  { pattern: /^(st_)?aluno_ativo$/i, order: 100, label: 'Aluno Ativo' },
  { pattern: /^(st_)?cliente_ativo$/i, order: 100, label: 'Cliente Ativo' },
]

const TIME_PATTERNS = [
  'created_at', 'created_at_ts', 'updated_at', 'inserted_at', 
  'data', 'dia', 'day', 'date', 'timestamp', 'created', 'updated', 
  'dt_', 'data_', 'datetime'
]

// ID patterns - PRIMARY vs SECONDARY
const ID_PRIMARY_PATTERNS = ['lead_id', 'leadid', 'kommo_lead_id', 'deal_id', 'contact_id', 'customer_id', 'client_id']
const ID_SECONDARY_PATTERNS = ['id', 'uuid', '_id', 'codigo', 'code', 'idd', 'token', 'hash', 'key', 'ref', 'external_id', 'internal_id']

// Columns to ALWAYS ignore
const IGNORE_PATTERNS = [
  'token', 'hash', 'secret', 'password', 'api_key', 
  'internal_id', 'external_id', 'legacy_id', 'old_id',
  'created_by', 'updated_by', 'deleted_at'
]

const CURRENCY_PATTERNS = ['custo', 'valor', 'preco', 'price', 'spend', 'investimento', 'receita', 'faturamento', 'revenue', 'amount']
const RATE_PATTERNS = ['taxa_', 'rate', 'conv_', 'pct_', 'percent', 'ratio']
const DIMENSION_PATTERNS = ['vendedor', 'vendedora', 'professor', 'unidade', 'origem', 'fonte', 'source', 'canal', 'modalidade', 'categoria', 'tipo', 'campanha', 'campaign', 'retencao', 'channel', 'region', 'country', 'state', 'city']

// Status enum patterns
const STATUS_PATTERNS = ['status', 'estado', 'situacao', 'stage', 'etapa', 'fase']

function generateLabel(name: string): string {
  const labelMap: Record<string, string> = {
    custo_total: 'Investimento',
    leads_total: 'Leads',
    entrada_total: 'Entradas',
    entrada: 'Entrada',
    venda_total: 'Vendas',
    venda: 'Venda',
    qualificado: 'Qualificado',
    exp_agendada: 'Exp. Agendada',
    exp_realizada: 'Exp. Realizada',
    lead_ativo: 'Lead Ativo',
    dia: 'Data',
    day: 'Data',
    spend: 'Investimento',
    sales: 'Vendas',
    leads_new: 'Novos Leads',
    cpl: 'CPL',
    cac: 'CAC',
    vendedora: 'Vendedora',
    professor: 'Professor',
    unidade: 'Unidade',
    origem: 'Origem',
    modalidade: 'Modalidade',
    retencao: 'Retenção',
    created_at: 'Data de Criação',
    created_at_ts: 'Data de Criação',
  }

  const lower = name.toLowerCase()
  if (labelMap[lower]) return labelMap[lower]

  return name
    .replace(/^st_/, '')
    .replace(/_total$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// =====================================================
// ADVANCED STATS CALCULATOR
// =====================================================

function calculateAdvancedStats(
  values: any[],
  colName: string
): ColumnStats {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '')
  const nullRate = values.length > 0 ? (values.length - nonNull.length) / values.length : 0
  
  // Distinct count
  const distinctSet = new Set(nonNull.map(v => JSON.stringify(v)))
  const distinctCount = distinctSet.size
  
  // Average length (for strings)
  let avgLen = 0
  const strings = nonNull.filter(v => typeof v === 'string')
  if (strings.length > 0) {
    avgLen = strings.reduce((sum, s) => sum + s.length, 0) / strings.length
  }
  
  // Boolean-like rate
  const booleanLikeCount = nonNull.filter(v => isBooleanLike(v)).length
  const booleanLikeRate = nonNull.length > 0 ? booleanLikeCount / nonNull.length : 0
  
  // Numeric parse rate
  const numericCount = nonNull.filter(v => looksLikeNumeric(v)).length
  const numericParseRate = nonNull.length > 0 ? numericCount / nonNull.length : 0
  
  // Date parse rate
  const dateCount = nonNull.filter(v => looksLikeDate(v)).length
  const dateParseRate = nonNull.length > 0 ? dateCount / nonNull.length : 0
  
  // Currency symbols
  const currencyCount = nonNull.filter(v => containsCurrencySymbol(v)).length
  const containsCurrencySymbols = currencyCount > nonNull.length * 0.1
  
  // Monotonicity (for IDs) - check if values are increasing
  let monotonicity = 0
  if (numericParseRate > 0.9) {
    const nums = nonNull.map(v => parseNumeric(v)).filter((n): n is number => n !== null)
    if (nums.length >= 2) {
      let increasing = 0
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] >= nums[i-1]) increasing++
      }
      monotonicity = increasing / (nums.length - 1)
    }
  }
  
  // Top values and coverage
  const valueCounts = new Map<string, number>()
  for (const v of nonNull) {
    const key = String(v)
    valueCounts.set(key, (valueCounts.get(key) || 0) + 1)
  }
  
  const sortedValues = [...valueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  
  const topValues = sortedValues.map(([value, count]) => ({ value, count }))
  const topValueCoverage = nonNull.length > 0 
    ? sortedValues.reduce((sum, [, count]) => sum + count, 0) / nonNull.length 
    : 0
  
  // Numeric stats
  let min: number | string | undefined
  let max: number | string | undefined
  let avg: number | undefined
  
  if (numericParseRate > 0.8) {
    const nums = nonNull.map(v => parseNumeric(v)).filter((n): n is number => n !== null)
    if (nums.length > 0) {
      min = Math.min(...nums)
      max = Math.max(...nums)
      avg = nums.reduce((a, b) => a + b, 0) / nums.length
    }
  }
  
  return {
    null_rate: nullRate,
    distinct_count: distinctCount,
    distinct_count_estimate: distinctCount, // Same for small samples
    avg_len: avgLen,
    boolean_like_rate: booleanLikeRate,
    numeric_parse_rate: numericParseRate,
    date_parse_rate: dateParseRate,
    monotonicity,
    contains_currency_symbols: containsCurrencySymbols,
    top_values: topValues,
    top_value_coverage: topValueCoverage,
    min,
    max,
    avg,
    sample_values: [...distinctSet].slice(0, 10).map(s => {
      try { return JSON.parse(s) } catch { return s }
    })
  }
}

// =====================================================
// MAIN SEMANTIC MODEL BUILDER v2
// =====================================================

// P0 HOTFIX: Robust column extraction with multiple fallbacks
function extractColumnNamesRobust(sampleRows: any[]): string[] {
  if (!sampleRows || sampleRows.length === 0) return []
  
  // Fallback 1: If first row is a string (might be stringified JSON)
  let firstRow = sampleRows[0]
  if (typeof firstRow === 'string') {
    try {
      firstRow = JSON.parse(firstRow)
    } catch {
      // Not valid JSON, treat as single column
      return ['col_0']
    }
  }
  
  // Fallback 2: If rows are arrays (CSV-like), generate col_0, col_1...
  if (Array.isArray(firstRow)) {
    // Check if first row looks like headers (all strings)
    const looksLikeHeaders = firstRow.every((v: any) => typeof v === 'string' && !/^\d+$/.test(v))
    if (looksLikeHeaders) {
      return firstRow.map((v: any) => String(v))
    }
    return firstRow.map((_: any, i: number) => `col_${i}`)
  }
  
  // Fallback 3: If it's an object, get keys
  if (typeof firstRow === 'object' && firstRow !== null) {
    // Get union of keys from first 20 rows (handles sparse data)
    const allKeys = new Set<string>()
    for (let i = 0; i < Math.min(sampleRows.length, 20); i++) {
      const row = sampleRows[i]
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        // Convert all keys to strings (handles numeric keys)
        Object.keys(row).forEach(k => allKeys.add(String(k)))
      }
    }
    return Array.from(allKeys)
  }
  
  // Ultimate fallback: create a single column
  return ['value']
}

// P0 HOTFIX: Normalize rows to ensure they are objects
function normalizeRowsToObjects(sampleRows: any[], columnNames: string[]): Record<string, any>[] {
  return sampleRows.map(row => {
    // Already an object
    if (typeof row === 'object' && !Array.isArray(row) && row !== null) {
      return row
    }
    
    // Stringified JSON
    if (typeof row === 'string') {
      try {
        const parsed = JSON.parse(row)
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed
        }
      } catch {}
    }
    
    // Array to object
    if (Array.isArray(row)) {
      const obj: Record<string, any> = {}
      row.forEach((val, i) => {
        obj[columnNames[i] || `col_${i}`] = val
      })
      return obj
    }
    
    // Primitive value
    return { [columnNames[0] || 'value']: row }
  })
}

function buildSemanticModel(
  datasetId: string,
  datasetName: string,
  sampleRows: Record<string, any>[],
  existingColumns?: { column_name: string; db_type: string; display_label?: string }[]
): SemanticModel {
  const traceId = crypto.randomUUID().slice(0, 8)
  const warnings: string[] = []
  const assumptions: string[] = []
  const columns: SemanticColumn[] = []
  const filters: FilterPlan[] = []
  
  // Debug info
  const debug = {
    ids_detected: [] as string[],
    ids_discarded: [] as string[],
    time_candidates: [] as string[],
    rows_analyzed: sampleRows.length,
    extraction_method: 'normal' as string
  }
  
  if (!sampleRows || sampleRows.length === 0) {
    return {
      version: 2,
      dataset_id: datasetId,
      dataset_name: datasetName,
      columns: [],
      time_column: null,
      id_primary: null,
      id_secondary: [],
      funnel: { detected: false, stages: [], confidence: 0 },
      dimensions: [],
      metrics: [],
      filters: [],
      date_range: { min: null, max: null },
      overall_confidence: 0,
      warnings: ['Nenhuma linha de amostra disponível'],
      assumptions: [],
      debug
    }
  }

  // P0 HOTFIX: Use robust column extraction
  const columnNames = extractColumnNamesRobust(sampleRows)
  
  // P0 HOTFIX: Log extraction result for debugging
  console.log(`[${traceId}] P0 Column extraction: ${columnNames.length} columns extracted`, {
    first5Cols: columnNames.slice(0, 5),
    firstRowType: typeof sampleRows[0],
    isArray: Array.isArray(sampleRows[0])
  })
  
  // P0 CRITICAL: If no columns, try harder
  if (columnNames.length === 0) {
    warnings.push('P0 FALLBACK: Nenhuma coluna detectada, tentando inferência alternativa')
    debug.extraction_method = 'emergency_fallback'
    
    // Last resort: scan all rows for any keys
    const emergencyKeys = new Set<string>()
    for (const row of sampleRows) {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(k => emergencyKeys.add(String(k)))
      }
    }
    
    if (emergencyKeys.size > 0) {
      columnNames.push(...Array.from(emergencyKeys))
      console.log(`[${traceId}] P0 EMERGENCY: Found ${emergencyKeys.size} columns in emergency scan`)
    } else {
      // Absolute last resort
      columnNames.push('data')
      console.log(`[${traceId}] P0 CRITICAL: No columns found, using fallback 'data' column`)
    }
  }
  
  // P0 HOTFIX: Normalize rows to ensure they're objects
  const normalizedRows = normalizeRowsToObjects(sampleRows, columnNames)
  debug.extraction_method = debug.extraction_method === 'normal' ? 'normalized' : debug.extraction_method
  const funnelStages: FunnelStage[] = []
  let timeColumn: string | null = null
  let idPrimary: string | null = null
  const idSecondary: string[] = []
  const dimensions: string[] = []
  const metrics: string[] = []
  let dateMin: string | null = null
  let dateMax: string | null = null

  // =====================================================
  // FIRST PASS: Calculate stats and detect types
  // =====================================================
  
  for (const colName of columnNames) {
    // P0 HOTFIX: Use normalized rows
    const values = normalizedRows.map(row => row[colName])
    const stats = calculateAdvancedStats(values, colName)
    const notes: string[] = []
    
    const existingCol = existingColumns?.find(c => c.column_name === colName)
    const dbType = existingCol?.db_type || (stats.numeric_parse_rate > 0.8 ? 'numeric' : 'text')
    
    const lowerName = colName.toLowerCase()
    let role: SemanticRole = 'unknown'
    let aggregator: SemanticColumn['aggregator'] = 'none'
    let format: SemanticColumn['format'] = 'text'
    let confidence = 0.5
    let usable_as_filter = false
    let usable_in_kpi = false
    let usable_in_chart = false
    let ignore_in_ui = false
    let filter_type: SemanticColumn['filter_type'] = 'none'

    // 0. Check if this column should be IGNORED completely
    const shouldIgnore = IGNORE_PATTERNS.some(p => lowerName.includes(p))
    if (shouldIgnore) {
      role = 'ignore'
      confidence = 1.0
      ignore_in_ui = true
      notes.push('Coluna ignorada por conter padrão sensível/interno')
    }

    // 1. Check for TIME column (with evidence from values)
    if (role === 'unknown') {
      const isTimeByName = TIME_PATTERNS.some(p => lowerName === p || lowerName.startsWith(p) || lowerName.includes('created') || lowerName.includes('updated'))
      const isTimeByValue = stats.date_parse_rate > 0.7
      
      if (isTimeByName) debug.time_candidates.push(colName)
      
      if (isTimeByName && isTimeByValue) {
        role = 'time'
        aggregator = 'none'
        format = 'date'
        confidence = 1.0
        usable_as_filter = true
        usable_in_chart = true
        notes.push(`Tempo confirmado: nome (${isTimeByName}) + valores (${Math.round(stats.date_parse_rate * 100)}% datas)`)
        
        if (!timeColumn) {
          timeColumn = colName
          // Extract date range
          const dates = values.filter(v => looksLikeDate(v)).sort()
          if (dates.length > 0) {
            dateMin = String(dates[0])
            dateMax = String(dates[dates.length - 1])
          }
        }
      } else if (isTimeByValue && !isTimeByName) {
        role = 'time'
        format = 'date'
        confidence = 0.7
        usable_as_filter = true
        usable_in_chart = true
        notes.push(`Valores parecem datas (${Math.round(stats.date_parse_rate * 100)}%) mas nome não é típico`)
        assumptions.push(`Coluna ${colName} classificada como tempo por valores`)
        if (!timeColumn) timeColumn = colName
      } else if (isTimeByName && !isTimeByValue) {
        warnings.push(`Coluna ${colName} tem nome de tempo mas valores não parseiam (${Math.round(stats.date_parse_rate * 100)}% válidos)`)
      }
    }

    // 2. Check for ID columns - PRIMARY vs SECONDARY
    if (role === 'unknown') {
      const isPrimaryIdByName = ID_PRIMARY_PATTERNS.some(p => lowerName === p || lowerName.includes(p))
      const isSecondaryIdByName = ID_SECONDARY_PATTERNS.some(p => lowerName === p || lowerName.endsWith(p))
      const highCardinality = stats.distinct_count > sampleRows.length * 0.5
      const veryHighCardinality = stats.distinct_count > sampleRows.length * 0.8
      const isMonotonic = stats.monotonicity > 0.9
      
      // Evidence-based ID detection
      const idEvidence = (highCardinality ? 30 : 0) + (isMonotonic ? 20 : 0) + (isPrimaryIdByName ? 40 : 0) + (isSecondaryIdByName ? 20 : 0)
      
      if (isPrimaryIdByName && highCardinality) {
        debug.ids_detected.push(colName)
        
        if (!idPrimary) {
          idPrimary = colName
          role = 'id_primary'
          aggregator = 'count_distinct'
          format = 'integer'
          confidence = 0.95
          usable_in_kpi = true
          ignore_in_ui = true
          notes.push(`ID primário escolhido: cardinalidade ${stats.distinct_count}/${sampleRows.length}, evidência ${idEvidence}%`)
        } else {
          role = 'id_secondary'
          ignore_in_ui = true
          confidence = 0.9
          idSecondary.push(colName)
          debug.ids_discarded.push(colName)
          notes.push(`ID secundário descartado: já existe ${idPrimary}`)
        }
      } else if ((isSecondaryIdByName || veryHighCardinality) && !isPrimaryIdByName) {
        debug.ids_detected.push(colName)
        role = 'id_secondary'
        ignore_in_ui = true
        confidence = 0.85
        idSecondary.push(colName)
        debug.ids_discarded.push(colName)
        notes.push(`ID/código secundário: cardinalidade ${stats.distinct_count}, ignorado`)
      }
    }

    // 3. Check for STAGE_FLAG (funnel stages)
    if (role === 'unknown') {
      const stageMatch = STAGE_PATTERNS.find(s => s.pattern.test(lowerName))
      
      // Evidence: name + boolean-like values
      if (stageMatch && stats.boolean_like_rate > 0.5) {
        const prevalence = values.filter(v => isTruthy(v)).length / values.length
        
        role = 'stage_flag'
        aggregator = 'truthy_count'
        format = 'integer'
        confidence = stats.boolean_like_rate > 0.8 ? 0.95 : 0.8
        usable_in_kpi = true
        usable_in_chart = true
        usable_as_filter = true
        filter_type = 'toggle'
        notes.push(`Etapa de funil: ${stageMatch.label}, prevalência ${Math.round(prevalence * 100)}%, boolean_rate ${Math.round(stats.boolean_like_rate * 100)}%`)
        
        funnelStages.push({
          column: colName,
          label: stageMatch.label,
          order: stageMatch.order,
          truthy_count_expression: `SUM(CASE WHEN ${colName} IN ('1','true','sim','s','yes','y','ok','x') THEN 1 ELSE 0 END)`,
          prevalence
        })
      } else if (stats.boolean_like_rate > 0.8 && stats.distinct_count <= 5) {
        // Boolean-like but not a known stage pattern
        role = 'stage_flag'
        aggregator = 'truthy_count'
        format = 'integer'
        confidence = 0.7
        usable_in_kpi = true
        usable_as_filter = true
        filter_type = 'toggle'
        notes.push(`Flag booleano detectado: boolean_rate ${Math.round(stats.boolean_like_rate * 100)}%, ${stats.distinct_count} valores distintos`)
        assumptions.push(`Coluna ${colName} tratada como flag`)
      }
    }

    // 4. Check for STATUS_ENUM
    if (role === 'unknown') {
      const isStatusByName = STATUS_PATTERNS.some(p => lowerName.includes(p))
      const isCategorical = stats.distinct_count >= 2 && stats.distinct_count <= 20
      
      if (isStatusByName && isCategorical) {
        role = 'status_enum'
        aggregator = 'none'
        format = 'text'
        confidence = 0.9
        usable_as_filter = true
        filter_type = 'multi_select'
        notes.push(`Status/enum detectado: ${stats.distinct_count} valores, top: ${stats.top_values.slice(0, 3).map(t => t.value).join(', ')}`)
      }
    }

    // 5. Check for CURRENCY/METRIC
    if (role === 'unknown' && stats.numeric_parse_rate > 0.8) {
      const isCurrency = CURRENCY_PATTERNS.some(p => lowerName.includes(p)) || stats.contains_currency_symbols
      const isRate = RATE_PATTERNS.some(p => lowerName.startsWith(p) || lowerName.includes(p))
      
      if (isCurrency) {
        role = 'currency'
        aggregator = 'sum'
        format = 'currency'
        confidence = 0.9
        usable_in_kpi = true
        usable_in_chart = true
        notes.push(`Moeda detectada: ${stats.contains_currency_symbols ? 'símbolos encontrados' : 'padrão de nome'}`)
        metrics.push(colName)
      } else if (isRate) {
        role = 'rate'
        aggregator = 'avg'
        format = 'percent'
        confidence = 0.9
        usable_in_kpi = true
        usable_in_chart = true
        notes.push('Percentual/taxa detectado por nome')
        metrics.push(colName)
      } else if (lowerName.endsWith('_total') || lowerName.includes('count') || lowerName.includes('qtd')) {
        role = 'metric'
        aggregator = 'sum'
        format = 'integer'
        confidence = 0.85
        usable_in_kpi = true
        usable_in_chart = true
        notes.push('Métrica de contagem detectada por nome')
        metrics.push(colName)
      } else {
        role = 'metric'
        aggregator = 'sum'
        format = 'float'
        confidence = 0.6
        usable_in_kpi = true
        usable_in_chart = true
        notes.push('Numérico genérico')
        metrics.push(colName)
      }
    }

    // 6. Check for DIMENSION
    if (role === 'unknown') {
      const isDimensionByName = DIMENSION_PATTERNS.some(p => lowerName.includes(p))
      const isCategorical = stats.distinct_count >= 2 && stats.distinct_count <= 100 && stats.distinct_count < normalizedRows.length * 0.3
      const hasReasonableCardinalityForFilter = stats.distinct_count >= 2 && stats.distinct_count <= 500
      const needsSearch = stats.distinct_count > 50
      
      if (isDimensionByName || isCategorical) {
        role = 'dimension'
        aggregator = 'none'
        format = 'text'
        confidence = isDimensionByName ? 0.9 : 0.7
        usable_as_filter = hasReasonableCardinalityForFilter
        usable_in_chart = true
        filter_type = needsSearch ? 'search_select' : 'multi_select'
        notes.push(`Dimensão: ${stats.distinct_count} valores, ${isDimensionByName ? 'nome padrão' : 'baixa cardinalidade'}`)
        if (hasReasonableCardinalityForFilter) {
          notes.push(`Filtro ${needsSearch ? 'com busca' : 'multi-select'}`)
        }
        dimensions.push(colName)
      }
    }

    // 7. Check for LONG TEXT (shouldn't be filter)
    if (role === 'unknown' && stats.avg_len > 100) {
      role = 'text_long'
      format = 'text'
      confidence = 0.8
      ignore_in_ui = false
      usable_as_filter = false
      notes.push(`Texto longo (avg ${Math.round(stats.avg_len)} chars) - não usar como filtro`)
    }

    // 8. Fallback to text
    if (role === 'unknown') {
      role = 'text'
      format = 'text'
      confidence = 0.3
      notes.push('Classificação padrão')
    }

    columns.push({
      name: colName,
      db_type: dbType,
      semantic_role: role,
      display_label: existingCol?.display_label || generateLabel(colName),
      aggregator,
      format,
      stats,
      confidence,
      notes,
      usable_as_filter,
      usable_in_kpi,
      usable_in_chart,
      ignore_in_ui,
      filter_type
    })
  }

  // =====================================================
  // SECOND PASS: Build filter plan
  // =====================================================
  
  // 1. Time filter (always first if exists)
  if (timeColumn) {
    filters.push({
      id: 'f_time',
      column: timeColumn,
      label: 'Período',
      type: 'time_range',
      source: 'manual',
      apply_to: ['kpis', 'charts', 'funnel', 'table']
    })
  }
  
  // 2. Dimension filters
  for (const col of columns) {
    if (col.usable_as_filter && col.semantic_role === 'dimension' && filters.length < 10) {
      filters.push({
        id: `f_${col.name}`,
        column: col.name,
        label: col.display_label,
        type: col.filter_type === 'search_select' ? 'search_select' : 'multi_select',
        source: 'distinct_values',
        apply_to: ['kpis', 'charts', 'funnel', 'table']
      })
    }
  }
  
  // 3. Status enum filters
  for (const col of columns) {
    if (col.semantic_role === 'status_enum' && filters.length < 10) {
      filters.push({
        id: `f_${col.name}`,
        column: col.name,
        label: col.display_label,
        type: 'multi_select',
        source: 'distinct_values',
        apply_to: ['kpis', 'charts', 'funnel', 'table']
      })
    }
  }

  // =====================================================
  // FUNNEL ANALYSIS: Order by prevalence/co-occurrence
  // =====================================================
  
  // Sort funnel stages by order, then by prevalence (descending)
  funnelStages.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return (b.prevalence || 0) - (a.prevalence || 0)
  })
  
  // Determine base stage (highest prevalence that's not "Entrada")
  let baseStage: string | undefined
  const nonEntradaStages = funnelStages.filter(s => s.order > 1 && s.order < 99)
  if (nonEntradaStages.length > 0) {
    // "Lead Ativo" is typically the base, or highest prevalence non-entrada
    const leadAtivo = nonEntradaStages.find(s => s.label.toLowerCase().includes('ativo'))
    baseStage = leadAtivo?.column || nonEntradaStages[0]?.column
  }
  
  // Calculate overall confidence
  const avgConfidence = columns.length > 0 
    ? columns.reduce((sum, c) => sum + c.confidence, 0) / columns.length 
    : 0
  
  const funnelConfidence = funnelStages.length >= 3 ? 0.9 : funnelStages.length >= 2 ? 0.7 : 0
  const overallConfidence = (avgConfidence * 0.5) + (timeColumn ? 0.2 : 0) + (funnelConfidence * 0.2) + (idPrimary ? 0.1 : 0)

  // Add warnings
  columns.filter(c => c.confidence < 0.6).forEach(c => {
    if (c.semantic_role !== 'text' && c.semantic_role !== 'unknown') {
      warnings.push(`Baixa confiança em ${c.name} como ${c.semantic_role} (${Math.round(c.confidence * 100)}%)`)
    }
  })

  if (!timeColumn) {
    warnings.push('Nenhuma coluna de tempo detectada - gráficos de tendência não disponíveis')
  }

  if (funnelStages.length < 3) {
    warnings.push(`Apenas ${funnelStages.length} etapas de funil detectadas (recomendado: 3+)`)
  }
  
  if (idSecondary.length > 0) {
    assumptions.push(`IDs secundários ignorados: ${idSecondary.join(', ')}`)
  }

  console.log(`[${traceId}] SemanticModel v2: ${columns.length} cols, time=${timeColumn}, id_primary=${idPrimary}, funnel=${funnelStages.length} stages, filters=${filters.length}`)

  return {
    version: 2,
    dataset_id: datasetId,
    dataset_name: datasetName,
    columns,
    time_column: timeColumn,
    id_primary: idPrimary,
    id_secondary: idSecondary,
    funnel: {
      detected: funnelStages.length >= 2,
      stages: funnelStages,
      confidence: funnelStages.length >= 4 ? 0.95 : funnelStages.length >= 3 ? 0.85 : funnelStages.length >= 2 ? 0.7 : 0,
      base_stage: baseStage
    },
    dimensions,
    metrics,
    filters,
    date_range: { min: dateMin, max: dateMax },
    overall_confidence: overallConfidence,
    warnings,
    assumptions,
    debug
  }
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

    // Check role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager'])

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado', undefined, traceId)
    }

    // Parse request
    const body = await req.json()
    const { dataset_id, sample_limit = 500 } = body  // Increased default sample

    if (!dataset_id) {
      return errorResponse('VALIDATION_ERROR', 'dataset_id é obrigatório', undefined, traceId)
    }

    console.log(`[${traceId}] Building semantic model for dataset ${dataset_id}, sample_limit=${sample_limit}`)

    // Fetch dataset
    const { data: dataset, error: dsError } = await adminClient
      .from('datasets')
      .select('*, tenant_data_sources(*)')
      .eq('id', dataset_id)
      .single()

    if (dsError || !dataset) {
      return errorResponse('NOT_FOUND', 'Dataset não encontrado', undefined, traceId)
    }

    // Fetch existing columns
    const { data: columnsData } = await adminClient
      .from('dataset_columns')
      .select('column_name, db_type, display_label')
      .eq('dataset_id', dataset_id)

    // Get data source credentials
    const dataSource = dataset.tenant_data_sources
    if (!dataSource) {
      return errorResponse('NO_DATASOURCE', 'Data source não encontrado', undefined, traceId)
    }

    let sampleRows: any[] = []

    // Handle Google Sheets data source
    if (dataSource.type === 'google_sheets') {
      console.log(`[${traceId}] Google Sheets data source detected`)
      
      let accessToken: string | null = null
      
      // Check if token is expired based on stored expiry time
      const tokenExpired = dataSource.google_token_expires_at 
        ? new Date(dataSource.google_token_expires_at) <= new Date() 
        : true // Assume expired if no expiry time
      
      // Try to decrypt stored access token if not expired
      if (!tokenExpired && dataSource.google_access_token_encrypted) {
        try {
          accessToken = await decrypt(dataSource.google_access_token_encrypted)
          console.log(`[${traceId}] Using stored access token (expires: ${dataSource.google_token_expires_at})`)
        } catch (e) {
          console.error(`[${traceId}] Failed to decrypt access token:`, e)
        }
      }

      // Always try to refresh if no valid token or token is expired
      if (!accessToken && dataSource.google_refresh_token_encrypted) {
        console.log(`[${traceId}] Attempting to refresh Google OAuth token...`)
        try {
          const refreshToken = await decrypt(dataSource.google_refresh_token_encrypted)
          const clientId = dataSource.google_client_id_encrypted 
            ? await decrypt(dataSource.google_client_id_encrypted) 
            : null
          const clientSecret = dataSource.google_client_secret_encrypted 
            ? await decrypt(dataSource.google_client_secret_encrypted) 
            : null
          
          if (clientId && clientSecret && refreshToken) {
            console.log(`[${traceId}] Refreshing token with client ID: ${clientId.substring(0, 20)}...`)
            
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
              accessToken = tokenData.access_token
              const expiresIn = tokenData.expires_in || 3600
              const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
              
              console.log(`[${traceId}] Successfully refreshed access token, expires in ${expiresIn}s`)
              
              // Save the new access token to the database for future use
              try {
                const keyForEncrypt = await getEncryptionKey()
                const encoder = new TextEncoder()
                const iv = crypto.getRandomValues(new Uint8Array(12))
                const encrypted = await crypto.subtle.encrypt(
                  { name: 'AES-GCM', iv },
                  keyForEncrypt,
                  encoder.encode(accessToken!)
                )
                const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length)
                combined.set(iv)
                combined.set(new Uint8Array(encrypted), iv.length)
                const encryptedToken = btoa(String.fromCharCode(...combined))
                
                await adminClient
                  .from('tenant_data_sources')
                  .update({
                    google_access_token_encrypted: encryptedToken,
                    google_token_expires_at: newExpiresAt
                  })
                  .eq('id', dataSource.id)
                
                console.log(`[${traceId}] Saved refreshed token to database`)
              } catch (saveErr) {
                console.error(`[${traceId}] Failed to save refreshed token:`, saveErr)
                // Continue - we still have the token in memory
              }
            } else {
              const errorText = await tokenResponse.text()
              console.error(`[${traceId}] Token refresh failed:`, errorText)
            }
          } else {
            console.error(`[${traceId}] Missing credentials for token refresh - clientId: ${!!clientId}, clientSecret: ${!!clientSecret}, refreshToken: ${!!refreshToken}`)
          }
        } catch (e) {
          console.error(`[${traceId}] Failed to refresh token:`, e)
        }
      }

      if (!accessToken) {
        return errorResponse('NO_CREDENTIALS', 'Credenciais do Google Sheets não configuradas ou expiradas. Por favor, reconecte a fonte de dados.', undefined, traceId)
      }

      // Fetch data from Google Sheets
      const spreadsheetId = dataSource.google_spreadsheet_id
      const sheetName = dataset.object_name || 'Sheet1'
      
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`
      
      console.log(`[${traceId}] Fetching from Google Sheets: ${sheetName}`)
      
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text()
        console.error(`[${traceId}] Sheets API error:`, errorText)
        return errorResponse('SHEETS_ERROR', 'Erro ao buscar dados do Google Sheets', errorText, traceId)
      }

      const sheetsData = await sheetsResponse.json()
      const rows = sheetsData.values || []
      
      if (rows.length < 2) {
        return errorResponse('NO_DATA', 'Planilha vazia ou sem dados suficientes', undefined, traceId)
      }

      // First row is headers
      const headers = rows[0].map((h: any) => String(h).trim() || `col_${rows[0].indexOf(h)}`)
      const dataRows = rows.slice(1, sample_limit + 1)
      
      // Convert to objects
      sampleRows = dataRows.map((row: any[]) => {
        const obj: Record<string, any> = {}
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i] ?? null
        })
        return obj
      })
      
      console.log(`[${traceId}] Got ${sampleRows.length} rows from Google Sheets with ${headers.length} columns`)
    } else {
      // Handle Supabase data source
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
        return errorResponse('NO_CREDENTIALS', 'Credenciais não configuradas', undefined, traceId)
      }

      // Fetch sample data
      const objectName = dataset.object_name
      const sampleUrl = `${dataSource.project_url}/rest/v1/${objectName}?select=*&limit=${sample_limit}`
      
      console.log(`[${traceId}] Fetching sample from ${objectName}, limit ${sample_limit}`)
      
      const sampleResponse = await fetch(sampleUrl, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      })

      if (!sampleResponse.ok) {
        const errorText = await sampleResponse.text()
        return errorResponse('FETCH_ERROR', 'Erro ao buscar dados', errorText, traceId)
      }

      sampleRows = await sampleResponse.json()
    }

    if (!Array.isArray(sampleRows)) {
      return errorResponse('INVALID_DATA', 'Resposta inválida do data source', undefined, traceId)
    }

    // P0 HOTFIX: If we got rows, we MUST be able to infer columns
    if (sampleRows.length === 0) {
      console.warn(`[${traceId}] P0 WARNING: Empty sample rows from dataset ${dataset_id}`)
      return errorResponse('NO_DATA', 'Dataset vazio - nenhuma linha retornada. Verifique se a view/tabela possui dados.', undefined, traceId)
    }

    // P0 HOTFIX: Verify we can extract columns from the first row
    const firstRow = sampleRows[0]
    if (!firstRow || typeof firstRow !== 'object' || Object.keys(firstRow).length === 0) {
      console.error(`[${traceId}] P0 CRITICAL: Sample row is invalid or has no columns`, { firstRow })
      return errorResponse('INVALID_ROW', 'Linha de amostra inválida - impossível inferir colunas', undefined, traceId)
    }

    console.log(`[${traceId}] P0 CHECK: Sample has ${sampleRows.length} rows, first row has ${Object.keys(firstRow).length} columns: ${Object.keys(firstRow).slice(0, 5).join(', ')}...`)

    // Build semantic model v2
    const semanticModel = buildSemanticModel(
      dataset_id,
      dataset.name,
      sampleRows,
      columnsData || undefined
    )

    console.log(`[${traceId}] Built semantic model v2: ${semanticModel.columns.length} columns, confidence ${Math.round(semanticModel.overall_confidence * 100)}%`)

    // P0 CRITICAL CHECK: semantic_model.columns MUST NOT be empty if we have rows
    if (semanticModel.columns.length === 0 && sampleRows.length > 0) {
      console.error(`[${traceId}] P0 CRITICAL: buildSemanticModel returned 0 columns but sample has ${sampleRows.length} rows!`)
      
      // P0 HOTFIX: Force column inference from sample rows as last resort
      const inferredColumns = Object.keys(sampleRows[0]).map(colName => ({
        name: colName,
        db_type: 'text',
        semantic_role: 'unknown' as SemanticRole,
        display_label: generateLabel(colName),
        aggregator: 'none' as const,
        format: 'text' as const,
        stats: calculateAdvancedStats(sampleRows.map(r => r[colName]), colName),
        confidence: 0.3,
        notes: ['Coluna inferida por fallback P0 - sem classificação semântica'],
        usable_as_filter: false,
        usable_in_kpi: false,
        usable_in_chart: false,
        ignore_in_ui: false,
        filter_type: 'none' as const
      }))
      
      semanticModel.columns = inferredColumns
      semanticModel.warnings.push('P0 FALLBACK: Colunas inferidas diretamente das linhas de amostra')
      console.log(`[${traceId}] P0 FALLBACK: Inferred ${inferredColumns.length} columns from sample rows`)
    }

    // P0 HOTFIX: Include sample_rows in response for fallback column inference
    return successResponse({
      semantic_model: semanticModel,
      sample_count: sampleRows.length,
      sample_rows: sampleRows.slice(0, 50), // Increased to 50 for better inference
      trace_id: traceId,
      // P0 DEBUG: Include column names for verification
      _debug: {
        column_count: semanticModel.columns.length,
        column_names: semanticModel.columns.map(c => c.name),
        rows_analyzed: sampleRows.length
      }
    })

  } catch (error: any) {
    console.error(`[${traceId}] Error in build-semantic-model:`, error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message, traceId)
  }
})
