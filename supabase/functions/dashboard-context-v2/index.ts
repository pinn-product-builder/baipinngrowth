import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================
// ENCRYPTION HELPERS
// =====================================================
async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY');
  if (!masterKey) throw new Error('MASTER_ENCRYPTION_KEY not configured');
  
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

async function decrypt(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function safeNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) || !isFinite(num) ? null : num;
}

function calculateSum(rows: any[], key: string): number {
  return rows.reduce((acc, row) => acc + (safeNumber(row[key]) ?? 0), 0);
}

function calculateAvg(rows: any[], key: string): number | null {
  const values = rows.map(r => safeNumber(r[key])).filter(v => v !== null) as number[];
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateMin(rows: any[], key: string): number | null {
  const values = rows.map(r => safeNumber(r[key])).filter(v => v !== null) as number[];
  if (values.length === 0) return null;
  return Math.min(...values);
}

function calculateMax(rows: any[], key: string): number | null {
  const values = rows.map(r => safeNumber(r[key])).filter(v => v !== null) as number[];
  if (values.length === 0) return null;
  return Math.max(...values);
}

function calculateStdDev(rows: any[], key: string): number | null {
  const values = rows.map(r => safeNumber(r[key])).filter(v => v !== null) as number[];
  if (values.length < 2) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// =====================================================
// SCHEMA DETECTION
// =====================================================
interface SchemaInfo {
  date_column: string | null;
  metrics: { name: string; kind: 'currency' | 'percent' | 'count' | 'rate' | 'number'; format: string }[];
  dimensions: string[];
  currency_columns: string[];
  percent_columns: string[];
}

function detectSchema(rows: any[]): SchemaInfo {
  if (rows.length === 0) {
    return { date_column: null, metrics: [], dimensions: [], currency_columns: [], percent_columns: [] };
  }
  
  const columns = Object.keys(rows[0]);
  
  // Detect date column
  const datePatterns = ['dia', 'date', 'created_at', 'data', 'dt'];
  const date_column = columns.find(c => 
    datePatterns.some(p => c.toLowerCase().includes(p))
  ) || null;
  
  // Classify columns
  const metrics: SchemaInfo['metrics'] = [];
  const dimensions: string[] = [];
  const currency_columns: string[] = [];
  const percent_columns: string[] = [];
  
  for (const col of columns) {
    const lowerCol = col.toLowerCase();
    const sampleValue = rows[0][col];
    const isNumeric = typeof sampleValue === 'number' || !isNaN(Number(sampleValue));
    
    if (lowerCol === date_column) continue;
    
    // Currency columns
    if (lowerCol.includes('custo') || lowerCol.includes('cac') || lowerCol.includes('cpl') || 
        lowerCol.includes('receita') || lowerCol.includes('revenue') || lowerCol.includes('cost')) {
      metrics.push({ name: col, kind: 'currency', format: 'BRL' });
      currency_columns.push(col);
    }
    // Percentage columns
    else if (lowerCol.includes('taxa') || lowerCol.includes('rate') || lowerCol.includes('percent') || lowerCol.includes('pct')) {
      metrics.push({ name: col, kind: 'percent', format: '%' });
      percent_columns.push(col);
    }
    // Count columns
    else if (lowerCol.includes('total') || lowerCol.includes('count') || lowerCol.includes('leads') || 
             lowerCol.includes('venda') || lowerCol.includes('entrada') || lowerCol.includes('reuniao')) {
      metrics.push({ name: col, kind: 'count', format: 'int' });
    }
    // Other numeric columns
    else if (isNumeric) {
      metrics.push({ name: col, kind: 'number', format: 'auto' });
    }
    // Dimensions (string columns)
    else {
      dimensions.push(col);
    }
  }
  
  return { date_column, metrics, dimensions, currency_columns, percent_columns };
}

// =====================================================
// ANOMALY DETECTION
// =====================================================
interface Anomaly {
  date: string;
  metric: string;
  value: number;
  expected: number;
  deviation_pct: number;
  severity: 'low' | 'medium' | 'high';
  direction: 'spike' | 'drop';
}

function detectAnomalies(rows: any[], schema: SchemaInfo): Anomaly[] {
  if (rows.length < 7 || !schema.date_column) return [];
  
  const anomalies: Anomaly[] = [];
  const metricsToCheck = schema.metrics.filter(m => m.kind !== 'percent').slice(0, 5);
  
  for (const metric of metricsToCheck) {
    const values = rows.map(r => ({
      date: r[schema.date_column!],
      value: safeNumber(r[metric.name])
    })).filter(v => v.value !== null);
    
    if (values.length < 7) continue;
    
    const avg = values.reduce((a, b) => a + (b.value || 0), 0) / values.length;
    const stdDev = calculateStdDev(rows, metric.name) || 1;
    
    for (const point of values) {
      if (point.value === null) continue;
      const deviation = Math.abs(point.value - avg);
      const deviationPct = (deviation / avg) * 100;
      
      // Flag if more than 2 standard deviations
      if (deviation > stdDev * 2) {
        const severity: 'low' | 'medium' | 'high' = 
          deviation > stdDev * 3 ? 'high' : deviation > stdDev * 2.5 ? 'medium' : 'low';
        
        anomalies.push({
          date: String(point.date),
          metric: metric.name,
          value: point.value,
          expected: Math.round(avg * 100) / 100,
          deviation_pct: Math.round(deviationPct * 10) / 10,
          severity,
          direction: point.value > avg ? 'spike' : 'drop'
        });
      }
    }
  }
  
  // Limit to top 10 most severe
  return anomalies
    .sort((a, b) => b.deviation_pct - a.deviation_pct)
    .slice(0, 10);
}

// =====================================================
// DATA QUALITY CHECK
// =====================================================
interface DataQuality {
  missing_days: string[];
  null_columns: { column: string; null_rate: number }[];
  zero_suspect: { date: string; issue: string }[];
  negative_values: { column: string; count: number }[];
  total_rows: number;
  date_range_days: number;
  coverage_pct: number;
}

function checkDataQuality(rows: any[], schema: SchemaInfo, startDate: string, endDate: string): DataQuality {
  const quality: DataQuality = {
    missing_days: [],
    null_columns: [],
    zero_suspect: [],
    negative_values: [],
    total_rows: rows.length,
    date_range_days: 0,
    coverage_pct: 100
  };
  
  if (rows.length === 0) return quality;
  
  // Check missing days
  if (schema.date_column) {
    const dates = new Set(rows.map(r => String(r[schema.date_column!]).slice(0, 10)));
    const start = new Date(startDate);
    const end = new Date(endDate);
    const expectedDays: string[] = [];
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      expectedDays.push(d.toISOString().slice(0, 10));
    }
    
    quality.date_range_days = expectedDays.length;
    quality.missing_days = expectedDays.filter(d => !dates.has(d)).slice(0, 10);
    quality.coverage_pct = Math.round((dates.size / expectedDays.length) * 100);
  }
  
  // Check null rates per column
  for (const metric of schema.metrics) {
    const nullCount = rows.filter(r => safeNumber(r[metric.name]) === null).length;
    const nullRate = (nullCount / rows.length) * 100;
    if (nullRate > 10) {
      quality.null_columns.push({ column: metric.name, null_rate: Math.round(nullRate) });
    }
  }
  
  // Check zero suspects (e.g., cost > 0 but leads = 0)
  for (const row of rows.slice(0, 100)) {
    const cost = safeNumber(row.custo_total) ?? 0;
    const leads = safeNumber(row.leads_total) ?? 0;
    if (cost > 0 && leads === 0) {
      quality.zero_suspect.push({ 
        date: String(row[schema.date_column || 'dia'] || 'unknown'),
        issue: 'custo > 0 mas leads = 0'
      });
    }
  }
  quality.zero_suspect = quality.zero_suspect.slice(0, 5);
  
  // Check negative values
  for (const metric of schema.metrics.filter(m => m.kind === 'currency' || m.kind === 'count')) {
    const negCount = rows.filter(r => (safeNumber(r[metric.name]) ?? 0) < 0).length;
    if (negCount > 0) {
      quality.negative_values.push({ column: metric.name, count: negCount });
    }
  }
  
  return quality;
}

// =====================================================
// KPI CALCULATION
// =====================================================
interface KPI {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  delta_vs_compare: number | null;
  trend: 'up' | 'down' | 'stable' | null;
}

function calculateKPIs(
  rows: any[], 
  compareRows: any[], 
  schema: SchemaInfo
): KPI[] {
  const kpis: KPI[] = [];
  
  // Core KPIs
  const coreMetrics = [
    { key: 'custo_total', label: 'Custo Total', unit: 'BRL', aggregate: 'sum' },
    { key: 'leads_total', label: 'Total Leads', unit: 'int', aggregate: 'sum' },
    { key: 'entrada_total', label: 'Entradas', unit: 'int', aggregate: 'sum' },
    { key: 'venda_total', label: 'Vendas', unit: 'int', aggregate: 'sum' },
    { key: 'cpl', label: 'CPL Médio', unit: 'BRL', aggregate: 'avg' },
    { key: 'cac', label: 'CAC Médio', unit: 'BRL', aggregate: 'avg' },
    { key: 'taxa_entrada', label: 'Taxa Entrada', unit: '%', aggregate: 'avg' },
    { key: 'taxa_venda_total', label: 'Taxa Venda', unit: '%', aggregate: 'avg' },
  ];
  
  for (const m of coreMetrics) {
    const currentValue = m.aggregate === 'sum' ? calculateSum(rows, m.key) : calculateAvg(rows, m.key);
    const compareValue = compareRows.length > 0 
      ? (m.aggregate === 'sum' ? calculateSum(compareRows, m.key) : calculateAvg(compareRows, m.key))
      : null;
    
    let delta: number | null = null;
    let trend: 'up' | 'down' | 'stable' | null = null;
    
    if (currentValue !== null && compareValue !== null && compareValue !== 0) {
      delta = ((currentValue - compareValue) / compareValue) * 100;
      trend = delta > 2 ? 'up' : delta < -2 ? 'down' : 'stable';
    }
    
    // Format value based on unit
    let formattedValue = currentValue;
    if (m.unit === '%' && currentValue !== null && currentValue < 1) {
      formattedValue = currentValue * 100;
    }
    
    kpis.push({
      key: m.key,
      label: m.label,
      value: formattedValue !== null ? Math.round(formattedValue * 100) / 100 : null,
      unit: m.unit,
      delta_vs_compare: delta !== null ? Math.round(delta * 10) / 10 : null,
      trend
    });
  }
  
  // Calculated KPIs
  const custoTotal = calculateSum(rows, 'custo_total');
  const leadsTotal = calculateSum(rows, 'leads_total');
  const vendasTotal = calculateSum(rows, 'venda_total');
  
  if (leadsTotal > 0) {
    kpis.push({
      key: 'cpl_calculated',
      label: 'CPL Calculado',
      value: Math.round((custoTotal / leadsTotal) * 100) / 100,
      unit: 'BRL',
      delta_vs_compare: null,
      trend: null
    });
  }
  
  if (vendasTotal > 0) {
    kpis.push({
      key: 'cac_calculated',
      label: 'CAC Calculado',
      value: Math.round((custoTotal / vendasTotal) * 100) / 100,
      unit: 'BRL',
      delta_vs_compare: null,
      trend: null
    });
  }
  
  return kpis.filter(k => k.value !== null);
}

// =====================================================
// RANKINGS
// =====================================================
interface Ranking {
  date: string;
  metric: string;
  value: number;
  rank_type: 'best' | 'worst';
  reason: string;
}

function calculateRankings(rows: any[], schema: SchemaInfo): Ranking[] {
  if (rows.length < 3 || !schema.date_column) return [];
  
  const rankings: Ranking[] = [];
  const dateCol = schema.date_column;
  
  // Best/worst by CPL (lower is better)
  const byCPL = [...rows]
    .filter(r => safeNumber(r.cpl) !== null && safeNumber(r.cpl)! > 0)
    .sort((a, b) => (safeNumber(a.cpl) || 0) - (safeNumber(b.cpl) || 0));
  
  for (const row of byCPL.slice(0, 3)) {
    rankings.push({
      date: String(row[dateCol]),
      metric: 'cpl',
      value: safeNumber(row.cpl)!,
      rank_type: 'best',
      reason: `Menor CPL: R$ ${safeNumber(row.cpl)?.toFixed(2)}`
    });
  }
  
  for (const row of byCPL.slice(-3).reverse()) {
    rankings.push({
      date: String(row[dateCol]),
      metric: 'cpl',
      value: safeNumber(row.cpl)!,
      rank_type: 'worst',
      reason: `Maior CPL: R$ ${safeNumber(row.cpl)?.toFixed(2)}`
    });
  }
  
  // Best by leads (higher is better)
  const byLeads = [...rows]
    .filter(r => safeNumber(r.leads_total) !== null)
    .sort((a, b) => (safeNumber(b.leads_total) || 0) - (safeNumber(a.leads_total) || 0));
  
  for (const row of byLeads.slice(0, 3)) {
    rankings.push({
      date: String(row[dateCol]),
      metric: 'leads_total',
      value: safeNumber(row.leads_total)!,
      rank_type: 'best',
      reason: `Mais leads: ${safeNumber(row.leads_total)}`
    });
  }
  
  return rankings;
}

// =====================================================
// SERIES BUILDER
// =====================================================
function buildSeries(rows: any[], schema: SchemaInfo): Record<string, any[]> {
  if (!schema.date_column) return { by_day: rows.slice(0, 200) };
  
  const series: Record<string, any[]> = {};
  const dateCol = schema.date_column;
  
  // Main series by day
  series.by_day = rows.map(r => ({
    [dateCol]: r[dateCol],
    custo_total: safeNumber(r.custo_total),
    leads_total: safeNumber(r.leads_total),
    cpl: safeNumber(r.cpl),
    cac: safeNumber(r.cac),
    entrada_total: safeNumber(r.entrada_total),
    venda_total: safeNumber(r.venda_total)
  })).slice(0, 400);
  
  // Aggregate by week if > 60 days
  if (rows.length > 60) {
    const weeklyAgg: Record<string, any> = {};
    
    for (const row of rows) {
      const date = new Date(row[dateCol]);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      
      if (!weeklyAgg[weekKey]) {
        weeklyAgg[weekKey] = { 
          week_start: weekKey, 
          custo_total: 0, 
          leads_total: 0,
          entrada_total: 0,
          venda_total: 0,
          days: 0 
        };
      }
      
      weeklyAgg[weekKey].custo_total += safeNumber(row.custo_total) || 0;
      weeklyAgg[weekKey].leads_total += safeNumber(row.leads_total) || 0;
      weeklyAgg[weekKey].entrada_total += safeNumber(row.entrada_total) || 0;
      weeklyAgg[weekKey].venda_total += safeNumber(row.venda_total) || 0;
      weeklyAgg[weekKey].days++;
    }
    
    series.by_week = Object.values(weeklyAgg).map(w => ({
      ...w,
      cpl: w.leads_total > 0 ? w.custo_total / w.leads_total : null,
      cac: w.venda_total > 0 ? w.custo_total / w.venda_total : null
    }));
  }
  
  return series;
}

// =====================================================
// FORECAST (MVP)
// =====================================================
interface Forecast {
  enabled: boolean;
  method: string;
  horizon_days: number;
  series: { date: string; leads_pred: number; cpl_pred: number | null; confidence: string }[];
  notes: string;
}

function generateForecast(rows: any[], schema: SchemaInfo, horizonDays: number = 7): Forecast {
  if (rows.length < 14 || !schema.date_column) {
    return { 
      enabled: false, 
      method: 'moving_average', 
      horizon_days: horizonDays,
      series: [], 
      notes: 'Dados insuficientes (mínimo 14 dias)' 
    };
  }
  
  const lastRows = rows.slice(-7);
  const avgLeads = calculateAvg(lastRows, 'leads_total') ?? 0;
  const avgCPL = calculateAvg(lastRows, 'cpl');
  const stdDevLeads = calculateStdDev(lastRows, 'leads_total') ?? 0;
  
  const lastDateStr = rows[rows.length - 1]?.[schema.date_column];
  if (!lastDateStr) {
    return { enabled: false, method: 'moving_average', horizon_days: horizonDays, series: [], notes: 'Sem data identificável' };
  }
  
  const lastDate = new Date(lastDateStr);
  const series: Forecast['series'] = [];
  
  for (let i = 1; i <= horizonDays; i++) {
    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + i);
    
    series.push({
      date: forecastDate.toISOString().split('T')[0],
      leads_pred: Math.round(avgLeads),
      cpl_pred: avgCPL ? Math.round(avgCPL * 100) / 100 : null,
      confidence: stdDevLeads / avgLeads > 0.3 ? 'low' : 'medium'
    });
  }
  
  return {
    enabled: true,
    method: 'moving_average_7d',
    horizon_days: horizonDays,
    series,
    notes: `Previsão baseada na média móvel dos últimos 7 dias. Variação histórica: ${Math.round(stdDevLeads)}. Use como referência.`
  };
}

// =====================================================
// MAIN CONTEXT PACK BUILDER
// =====================================================
interface ContextPackV2 {
  meta: {
    dashboard_id: string;
    dashboard_name: string;
    tenant_id: string;
    start: string;
    end: string;
    compare_start: string | null;
    compare_end: string | null;
    generated_at: string;
    rows_count: number;
    compare_rows_count: number;
    cached: boolean;
  };
  schema: SchemaInfo;
  kpis: KPI[];
  series: Record<string, any[]>;
  rankings: Ranking[];
  anomalies: Anomaly[];
  data_quality: DataQuality;
  forecast: Forecast;
  evidence_sample: any[];
}

function buildContextPackV2(
  rows: any[],
  compareRows: any[],
  dashboard: any,
  startDate: string,
  endDate: string,
  compareStart: string | null,
  compareEnd: string | null
): ContextPackV2 {
  const schema = detectSchema(rows);
  const kpis = calculateKPIs(rows, compareRows, schema);
  const series = buildSeries(rows, schema);
  const rankings = calculateRankings(rows, schema);
  const anomalies = detectAnomalies(rows, schema);
  const data_quality = checkDataQuality(rows, schema, startDate, endDate);
  const forecast = generateForecast(rows, schema, 7);
  
  return {
    meta: {
      dashboard_id: dashboard.id,
      dashboard_name: dashboard.name,
      tenant_id: dashboard.tenant_id,
      start: startDate,
      end: endDate,
      compare_start: compareStart,
      compare_end: compareEnd,
      generated_at: new Date().toISOString(),
      rows_count: rows.length,
      compare_rows_count: compareRows.length,
      cached: false
    },
    schema,
    kpis,
    series,
    rankings,
    anomalies,
    data_quality,
    forecast,
    evidence_sample: rows.slice(0, 50)
  };
}

// =====================================================
// CACHE HELPERS
// =====================================================
function computeCacheHash(dashboardId: string, start: string, end: string, specVersion?: string): string {
  const data = `${dashboardId}:${start}:${end}:${specVersion || 'v1'}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// =====================================================
// MAIN HANDLER
// =====================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { 
      dashboard_id, 
      start, 
      end, 
      compare_mode,
      skip_cache 
    } = await req.json();
    
    if (!dashboard_id || !start || !end) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: dashboard_id, start, end' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();
    
    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Perfil não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get dashboard
    const { data: dashboard, error: dashError } = await supabase
      .from('dashboards')
      .select('*, data_source:tenant_data_sources(*)')
      .eq('id', dashboard_id)
      .single();
    
    if (dashError || !dashboard) {
      return new Response(
        JSON.stringify({ error: 'Dashboard não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Compute cache hash
    const cacheHash = computeCacheHash(dashboard_id, start, end);
    
    // Check cache first (unless skip_cache)
    if (!skip_cache) {
      const { data: cached } = await supabase
        .from('dashboard_context_cache')
        .select('payload, expires_at')
        .eq('dashboard_id', dashboard_id)
        .eq('start_date', start)
        .eq('end_date', end)
        .eq('cache_hash', cacheHash)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (cached) {
        console.log(`Cache hit for dashboard ${dashboard_id}`);
        const payload = cached.payload as ContextPackV2;
        payload.meta.cached = true;
        
        return new Response(
          JSON.stringify({ 
            context_pack: payload,
            latency_ms: Date.now() - startTime,
            from_cache: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Calculate compare period
    let compareStart: string | null = null;
    let compareEnd: string | null = null;
    
    if (compare_mode) {
      const startD = new Date(start);
      const endD = new Date(end);
      const periodDays = Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
      
      if (compare_mode === 'prev_period') {
        const prevEnd = new Date(startD);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - periodDays + 1);
        compareStart = prevStart.toISOString().split('T')[0];
        compareEnd = prevEnd.toISOString().split('T')[0];
      } else if (compare_mode === 'prev_month') {
        const prevStart = new Date(startD);
        prevStart.setMonth(prevStart.getMonth() - 1);
        const prevEnd = new Date(endD);
        prevEnd.setMonth(prevEnd.getMonth() - 1);
        compareStart = prevStart.toISOString().split('T')[0];
        compareEnd = prevEnd.toISOString().split('T')[0];
      }
    }
    
    // Fetch data
    let rows: any[] = [];
    let compareRows: any[] = [];
    
    if (dashboard.data_source) {
      const ds = dashboard.data_source;
      let remoteKey: string | null = null;
      
      if (ds.anon_key_encrypted) {
        try {
          remoteKey = await decrypt(ds.anon_key_encrypted);
        } catch (e) {
          console.error('Failed to decrypt anon_key:', e);
        }
      }
      
      if (!remoteKey && ds.service_role_key_encrypted) {
        try {
          remoteKey = await decrypt(ds.service_role_key_encrypted);
        } catch (e) {
          console.error('Failed to decrypt service_role_key:', e);
        }
      }
      
      // Afonsina fallback
      if (!remoteKey) {
        const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL');
        const afonsinaKey = Deno.env.get('AFONSINA_SUPABASE_ANON_KEY') || Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY');
        if (afonsinaUrl && ds.project_url === afonsinaUrl && afonsinaKey) {
          remoteKey = afonsinaKey;
        }
      }
      
      if (remoteKey && dashboard.view_name) {
        const fetchData = async (startD: string, endD: string): Promise<any[]> => {
          const restUrl = `${ds.project_url}/rest/v1/${dashboard.view_name}?select=*&dia=gte.${startD}&dia=lte.${endD}&order=dia.asc&limit=1000`;
          
          try {
            const response = await fetch(restUrl, {
              headers: {
                'apikey': remoteKey!,
                'Authorization': `Bearer ${remoteKey}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              return await response.json();
            }
          } catch (e) {
            console.error('Fetch error:', e);
          }
          return [];
        };
        
        rows = await fetchData(start, end);
        
        if (compareStart && compareEnd) {
          compareRows = await fetchData(compareStart, compareEnd);
        }
        
        console.log(`Fetched ${rows.length} rows, ${compareRows.length} compare rows`);
      }
    }
    
    // Build context pack
    const contextPack = buildContextPackV2(
      rows, 
      compareRows, 
      dashboard, 
      start, 
      end, 
      compareStart, 
      compareEnd
    );
    
    // Cache the result (TTL 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    
    await supabase
      .from('dashboard_context_cache')
      .upsert({
        tenant_id: dashboard.tenant_id,
        dashboard_id: dashboard_id,
        start_date: start,
        end_date: end,
        cache_hash: cacheHash,
        payload: contextPack,
        expires_at: expiresAt
      }, {
        onConflict: 'dashboard_id,start_date,end_date,cache_hash'
      });
    
    const latencyMs = Date.now() - startTime;
    console.log(`Context pack v2 generated in ${latencyMs}ms`);
    
    return new Response(
      JSON.stringify({ 
        context_pack: contextPack,
        latency_ms: latencyMs,
        from_cache: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Context pack error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao gerar context pack',
        trace_id: crypto.randomUUID().slice(0, 8)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
