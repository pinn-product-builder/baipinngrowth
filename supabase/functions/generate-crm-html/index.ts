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

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
  })
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({ ok: false, error: { code, message, details } }, 400)
}

// =====================================================
// ENCRYPTION HELPERS - Support both formats
// =====================================================

// Google Sheets format (Base64 key)
async function getEncryptionKeyGoogleFormat(): Promise<CryptoKey> {
  const keyB64 = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!keyB64) throw new Error('MASTER_ENCRYPTION_KEY not configured')
  const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
}

// Supabase datasource format (raw text padded)
async function getEncryptionKeySupabaseFormat(): Promise<CryptoKey> {
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

async function decryptGoogleFormat(ciphertext: string): Promise<string> {
  const key = await getEncryptionKeyGoogleFormat()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

async function decryptSupabaseFormat(ciphertext: string): Promise<string> {
  const key = await getEncryptionKeySupabaseFormat()
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

// =====================================================
// CRM PATTERNS
// =====================================================

const CRM_TIME_COLUMNS = ['created_at', 'data', 'dia', 'date', 'data_criacao', 'inserted_at', 'created_at_ts']
const CRM_ID_COLUMNS = ['lead_id', 'id_lead', 'id', 'idd']

const CRM_FUNNEL_STAGES = [
  { key: 'entrada', label: 'Entradas', order: 1 },
  { key: 'lead_ativo', label: 'Leads Ativos', order: 2 },
  { key: 'qualificado', label: 'Qualificados', order: 3 },
  { key: 'exp_nao_confirmada', label: 'Exp. Não Confirmada', order: 4 },
  { key: 'exp_agendada', label: 'Exp. Agendadas', order: 5 },
  { key: 'faltou_exp', label: 'Faltou Exp.', order: 6 },
  { key: 'reagendou', label: 'Reagendou', order: 7 },
  { key: 'exp_realizada', label: 'Exp. Realizadas', order: 8 },
  { key: 'venda', label: 'Vendas', order: 9 },
  { key: 'perdida', label: 'Perdidas', order: 10 }
]

const CRM_DIMENSIONS = ['unidade', 'unidade_final', 'vendedora', 'vendedor', 'professor', 'modalidade', 'origem', 'retencao']

// =====================================================
// TRUTHY & DATE PARSING
// =====================================================

const TRUTHY_VALUES = new Set([
  '1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'on',
  'ativo', 'realizado', 'agendado', 'ganho', 'concluido'
])

function parseTruthy(value: any): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const v = String(value).toLowerCase().trim()
  return TRUTHY_VALUES.has(v)
}

function parseTextDate(value: any): { date: Date; day: string; month: string } | null {
  if (!value) return null
  const text = String(value).trim()
  
  // ISO format
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`)
    if (!isNaN(date.getTime())) {
      return { date, day: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, month: `${isoMatch[1]}-${isoMatch[2]}` }
    }
  }
  
  // Brazilian DD/MM/YYYY
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (brMatch) {
    const [_, day, month, year] = brMatch
    const date = new Date(`${year}-${month}-${day}T00:00:00`)
    if (!isNaN(date.getTime())) {
      return { date, day: `${year}-${month}-${day}`, month: `${year}-${month}` }
    }
  }
  
  // Brazilian DD-MM-YYYY
  const brDashMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (brDashMatch) {
    const [_, day, month, year] = brDashMatch
    const date = new Date(`${year}-${month}-${day}T00:00:00`)
    if (!isNaN(date.getTime())) {
      return { date, day: `${year}-${month}-${day}`, month: `${year}-${month}` }
    }
  }
  
  // Fallback
  const date = new Date(text)
  if (!isNaN(date.getTime())) {
    const day = date.toISOString().split('T')[0]
    const month = day.substring(0, 7)
    return { date, day, month }
  }
  
  return null
}

// =====================================================
// COLUMN ANALYSIS
// =====================================================

interface ColumnMapping {
  timeColumn: string | null
  idColumn: string | null
  funnelStages: { column: string; key: string; label: string; order: number }[]
  dimensions: string[]
  unitFlags: string[]
  statusFlags: string[]
}

function analyzeColumns(columnNames: string[]): ColumnMapping {
  const lowerMap = new Map(columnNames.map(c => [c.toLowerCase(), c]))
  
  // Find time column
  let timeColumn: string | null = null
  for (const tc of CRM_TIME_COLUMNS) {
    for (const [lower, original] of lowerMap) {
      if (lower === tc || lower.includes(tc)) {
        timeColumn = original
        break
      }
    }
    if (timeColumn) break
  }
  
  // Find ID column
  let idColumn: string | null = null
  for (const idc of CRM_ID_COLUMNS) {
    for (const [lower, original] of lowerMap) {
      if (lower === idc) {
        idColumn = original
        break
      }
    }
    if (idColumn) break
  }
  
  // Find funnel stages
  const funnelStages: ColumnMapping['funnelStages'] = []
  for (const stage of CRM_FUNNEL_STAGES) {
    for (const [lower, original] of lowerMap) {
      const matchPatterns = [
        lower === stage.key,
        lower === `st_${stage.key}`,
        lower.startsWith(`st_${stage.key}`),
        lower.startsWith(stage.key + '_')
      ]
      if (matchPatterns.some(m => m)) {
        funnelStages.push({
          column: original,
          key: stage.key,
          label: stage.label,
          order: stage.order
        })
        break
      }
    }
  }
  funnelStages.sort((a, b) => a.order - b.order)
  
  // Find dimensions
  const dimensions: string[] = []
  for (const dim of CRM_DIMENSIONS) {
    for (const [lower, original] of lowerMap) {
      if (lower === dim || (dim === 'unidade' && lower === 'unidade_final')) {
        if (!dimensions.includes(original)) {
          dimensions.push(original)
        }
        break
      }
    }
  }
  
  // Find unit flags
  const unitFlags: string[] = []
  for (const [lower, original] of lowerMap) {
    if (/^unidade_\d{2}_/.test(lower)) {
      unitFlags.push(original)
    }
  }
  
  // Find status flags
  const statusFlags: string[] = []
  for (const flag of ['aluno_ativo', 'lead_ativo', 'status']) {
    for (const [lower, original] of lowerMap) {
      if (lower === flag) {
        statusFlags.push(original)
      }
    }
  }
  
  return { timeColumn, idColumn, funnelStages, dimensions, unitFlags, statusFlags }
}

function resolveUnit(row: Record<string, any>, unitFlags: string[], fallbackColumn?: string): string | null {
  for (const col of unitFlags.sort()) {
    if (parseTruthy(row[col])) {
      const match = col.match(/^unidade_\d{2}_(.+)$/i)
      if (match) {
        return match[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      }
    }
  }
  if (fallbackColumn && row[fallbackColumn]) {
    return String(row[fallbackColumn])
  }
  return null
}

// =====================================================
// HTML GENERATOR
// =====================================================

interface DashboardData {
  dashboardName: string
  mapping: ColumnMapping
  rows: Record<string, any>[]
  dateRange: { start: string; end: string }
}

function generateHTML(data: DashboardData): string {
  const { dashboardName, mapping, rows, dateRange } = data
  
  // Pre-process rows with parsed dates and resolved units
  const processedRows = rows.map(row => {
    const parsed = mapping.timeColumn ? parseTextDate(row[mapping.timeColumn]) : null
    let resolvedUnit: string | null = null
    
    if (mapping.unitFlags.length > 0) {
      resolvedUnit = resolveUnit(row, mapping.unitFlags, mapping.dimensions.find(d => d.toLowerCase().includes('unidade')))
    } else if (mapping.dimensions.find(d => d.toLowerCase().includes('unidade'))) {
      const unidadeCol = mapping.dimensions.find(d => d.toLowerCase().includes('unidade'))!
      resolvedUnit = row[unidadeCol] ? String(row[unidadeCol]) : null
    }
    
    return {
      ...row,
      _parsed_date: parsed,
      _day: parsed?.day || null,
      _month: parsed?.month || null,
      _unidade_resolved: resolvedUnit
    }
  })
  
  // Calculate aggregate data
  const totalRows = processedRows.length
  
  // Generate dimension options
  const dimensionOptions: Record<string, string[]> = {}
  for (const dim of mapping.dimensions) {
    const values = new Set<string>()
    for (const row of processedRows) {
      const val = dim.toLowerCase().includes('unidade') ? row._unidade_resolved : row[dim]
      if (val && String(val).trim()) {
        values.add(String(val).trim())
      }
    }
    dimensionOptions[dim] = Array.from(values).sort()
  }
  
  // Get months for filter
  const months = new Set<string>()
  for (const row of processedRows) {
    if (row._month) months.add(row._month)
  }
  const monthList = Array.from(months).sort()
  
  // Build funnel stages data structure
  const stagesJSON = JSON.stringify(mapping.funnelStages)
  const dimensionsJSON = JSON.stringify(mapping.dimensions)
  const dimensionOptionsJSON = JSON.stringify(dimensionOptions)
  const monthsJSON = JSON.stringify(monthList)
  
  // Escape rows for inline JSON
  const rowsJSON = JSON.stringify(processedRows)
  
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(dashboardName)}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-light: #3b82f6;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #1e293b;
      --text-muted: #64748b;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    
    .container { max-width: 1400px; margin: 0 auto; padding: 1rem; }
    
    header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
      color: white;
      padding: 1.5rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    
    header h1 { font-size: 1.5rem; font-weight: 600; }
    header .meta { font-size: 0.875rem; opacity: 0.9; }
    
    .tabs {
      display: flex;
      gap: 0.25rem;
      background: var(--card);
      padding: 0.25rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    
    .tab-btn {
      padding: 0.5rem 1rem;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: 0.375rem;
      font-weight: 500;
      color: var(--text-muted);
      transition: all 0.2s;
    }
    
    .tab-btn.active { background: var(--primary); color: white; }
    .tab-btn:hover:not(.active) { background: var(--bg); }
    
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    
    .filters {
      background: var(--card);
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      margin-bottom: 1rem;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: flex-end;
    }
    
    .filter-group { display: flex; flex-direction: column; gap: 0.25rem; min-width: 150px; }
    .filter-group label { font-size: 0.75rem; font-weight: 500; color: var(--text-muted); }
    
    select, input {
      padding: 0.5rem;
      border: 1px solid var(--border);
      border-radius: 0.375rem;
      font-size: 0.875rem;
      background: white;
    }
    
    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }
    
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-light); }
    .btn-outline { background: white; border: 1px solid var(--border); }
    .btn-outline:hover { background: var(--bg); }
    
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .kpi-card {
      background: var(--card);
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
    }
    
    .kpi-card .label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; }
    .kpi-card .value { font-size: 1.75rem; font-weight: 700; color: var(--text); }
    .kpi-card .rate { font-size: 0.875rem; color: var(--primary); margin-top: 0.25rem; }
    
    .funnel-container {
      background: var(--card);
      padding: 1.5rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      margin-bottom: 1rem;
    }
    
    .funnel-container h3 { margin-bottom: 1rem; font-size: 1rem; }
    
    .funnel-step {
      display: flex;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    
    .funnel-step .step-label {
      width: 150px;
      font-size: 0.875rem;
      font-weight: 500;
    }
    
    .funnel-step .step-bar {
      flex: 1;
      height: 32px;
      background: var(--bg);
      border-radius: 4px;
      overflow: hidden;
      margin: 0 1rem;
      position: relative;
    }
    
    .funnel-step .step-bar .fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), var(--primary-light));
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    
    .funnel-step .step-value {
      width: 100px;
      text-align: right;
      font-weight: 600;
    }
    
    .funnel-step .step-rate {
      width: 80px;
      text-align: right;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    
    .chart-container {
      background: var(--card);
      padding: 1.5rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      margin-bottom: 1rem;
      min-height: 300px;
    }
    
    .chart-container h3 { margin-bottom: 1rem; }
    
    .simple-chart {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 200px;
      padding-top: 2rem;
    }
    
    .chart-bar {
      flex: 1;
      background: linear-gradient(180deg, var(--primary), var(--primary-light));
      border-radius: 4px 4px 0 0;
      min-width: 20px;
      position: relative;
      transition: height 0.3s ease;
    }
    
    .chart-bar .tooltip {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: var(--text);
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    
    .chart-bar:hover .tooltip { opacity: 1; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border-radius: 0.5rem;
      overflow: hidden;
      font-size: 0.875rem;
    }
    
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    
    th {
      background: var(--bg);
      font-weight: 600;
      cursor: pointer;
      user-select: none;
    }
    
    th:hover { background: var(--border); }
    th.sorted-asc::after { content: ' ↑'; }
    th.sorted-desc::after { content: ' ↓'; }
    
    tr:hover { background: var(--bg); }
    
    .pagination {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      justify-content: center;
      margin-top: 1rem;
    }
    
    .badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: var(--text-muted);
    }
    
    @media (max-width: 768px) {
      .filters { flex-direction: column; }
      .filter-group { width: 100%; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>${escapeHtml(dashboardName)}</h1>
        <div class="meta">
          <span id="filtered-count">${totalRows.toLocaleString('pt-BR')}</span> registros
          • Período: <span id="date-range">${dateRange.start} a ${dateRange.end}</span>
        </div>
      </div>
      <button class="btn btn-outline" onclick="exportCSV()">📥 Exportar CSV</button>
    </header>
    
    <div class="tabs">
      <button class="tab-btn active" data-tab="overview">Visão Geral</button>
      <button class="tab-btn" data-tab="funnel">Funil</button>
      <button class="tab-btn" data-tab="trend">Tendência</button>
      <button class="tab-btn" data-tab="table">Tabela</button>
    </div>
    
    <div class="filters">
      <div class="filter-group">
        <label>Mês</label>
        <select id="filter-month">
          <option value="">Todos</option>
        </select>
      </div>
      ${mapping.dimensions.map(dim => `
      <div class="filter-group">
        <label>${dim.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</label>
        <select id="filter-${dim.toLowerCase().replace(/[^a-z0-9]/g, '')}">
          <option value="">Todos</option>
        </select>
      </div>
      `).join('')}
      <div class="filter-group">
        <label>Busca</label>
        <input type="text" id="filter-search" placeholder="Buscar...">
      </div>
      <button class="btn btn-primary" onclick="applyFilters()">Filtrar</button>
      <button class="btn btn-outline" onclick="clearFilters()">Limpar</button>
    </div>
    
    <!-- OVERVIEW TAB -->
    <div id="tab-overview" class="tab-content active">
      <div class="kpi-grid" id="kpi-container"></div>
      <div class="funnel-container">
        <h3>Funil de Conversão (Base: Lead Ativo)</h3>
        <div id="funnel-mini"></div>
      </div>
    </div>
    
    <!-- FUNNEL TAB -->
    <div id="tab-funnel" class="tab-content">
      <div class="funnel-container">
        <h3>Funil Completo</h3>
        <div id="funnel-full"></div>
      </div>
    </div>
    
    <!-- TREND TAB -->
    <div id="tab-trend" class="tab-content">
      <div class="chart-container">
        <h3>Volume Diário (últimos 21 dias)</h3>
        <div id="trend-chart" class="simple-chart"></div>
      </div>
      <div class="chart-container">
        <h3>Vendas por Dia</h3>
        <div id="sales-chart" class="simple-chart"></div>
      </div>
    </div>
    
    <!-- TABLE TAB -->
    <div id="tab-table" class="tab-content">
      <div style="overflow-x: auto;">
        <table id="data-table">
          <thead id="table-head"></thead>
          <tbody id="table-body"></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>
  </div>
  
  <script>
    // Data injected from server
    const RAW_ROWS = ${rowsJSON};
    const FUNNEL_STAGES = ${stagesJSON};
    const DIMENSIONS = ${dimensionsJSON};
    const DIMENSION_OPTIONS = ${dimensionOptionsJSON};
    const MONTHS = ${monthsJSON};
    const TIME_COLUMN = ${JSON.stringify(mapping.timeColumn)};
    const ID_COLUMN = ${JSON.stringify(mapping.idColumn)};
    
    // State
    let filteredRows = [...RAW_ROWS];
    let currentPage = 1;
    const pageSize = 50;
    let sortColumn = null;
    let sortDirection = 'asc';
    
    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      initFilters();
      initTabs();
      render();
    });
    
    function initFilters() {
      // Month filter
      const monthSelect = document.getElementById('filter-month');
      MONTHS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = formatMonth(m);
        monthSelect.appendChild(opt);
      });
      
      // Dimension filters
      DIMENSIONS.forEach(dim => {
        const selectId = 'filter-' + dim.toLowerCase().replace(/[^a-z0-9]/g, '');
        const select = document.getElementById(selectId);
        if (select && DIMENSION_OPTIONS[dim]) {
          DIMENSION_OPTIONS[dim].forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            select.appendChild(opt);
          });
        }
      });
    }
    
    function initTabs() {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
      });
    }
    
    function applyFilters() {
      const month = document.getElementById('filter-month').value;
      const search = document.getElementById('filter-search').value.toLowerCase();
      
      const dimFilters = {};
      DIMENSIONS.forEach(dim => {
        const selectId = 'filter-' + dim.toLowerCase().replace(/[^a-z0-9]/g, '');
        const select = document.getElementById(selectId);
        if (select) dimFilters[dim] = select.value;
      });
      
      filteredRows = RAW_ROWS.filter(row => {
        // Month filter
        if (month && row._month !== month) return false;
        
        // Dimension filters
        for (const dim of DIMENSIONS) {
          const filterVal = dimFilters[dim];
          if (!filterVal) continue;
          
          const rowVal = dim.toLowerCase().includes('unidade') ? row._unidade_resolved : row[dim];
          if (String(rowVal || '') !== filterVal) return false;
        }
        
        // Search filter
        if (search) {
          const searchable = Object.values(row).map(v => String(v || '').toLowerCase()).join(' ');
          if (!searchable.includes(search)) return false;
        }
        
        return true;
      });
      
      currentPage = 1;
      render();
    }
    
    function clearFilters() {
      document.getElementById('filter-month').value = '';
      document.getElementById('filter-search').value = '';
      DIMENSIONS.forEach(dim => {
        const selectId = 'filter-' + dim.toLowerCase().replace(/[^a-z0-9]/g, '');
        const select = document.getElementById(selectId);
        if (select) select.value = '';
      });
      filteredRows = [...RAW_ROWS];
      currentPage = 1;
      render();
    }
    
    function render() {
      document.getElementById('filtered-count').textContent = filteredRows.length.toLocaleString('pt-BR');
      renderKPIs();
      renderFunnel('funnel-mini', true);
      renderFunnel('funnel-full', false);
      renderTrendChart();
      renderSalesChart();
      renderTable();
    }
    
    function renderKPIs() {
      const container = document.getElementById('kpi-container');
      
      // Calculate KPIs
      const total = filteredRows.length;
      const counts = {};
      FUNNEL_STAGES.forEach(s => counts[s.key] = 0);
      
      filteredRows.forEach(row => {
        FUNNEL_STAGES.forEach(s => {
          if (isTruthy(row[s.column])) counts[s.key]++;
        });
      });
      
      // Base for rates
      const base = counts['lead_ativo'] || total;
      
      const kpis = [
        { label: 'Total Registros', value: total },
        { label: 'Leads Ativos', value: counts['lead_ativo'] || 0, rate: base > 0 ? ((counts['lead_ativo'] || 0) / total * 100).toFixed(1) + '%' : null },
        { label: 'Qualificados', value: counts['qualificado'] || 0, rate: base > 0 ? ((counts['qualificado'] || 0) / base * 100).toFixed(1) + '%' : null },
        { label: 'Exp. Agendadas', value: counts['exp_agendada'] || 0, rate: base > 0 ? ((counts['exp_agendada'] || 0) / base * 100).toFixed(1) + '%' : null },
        { label: 'Exp. Realizadas', value: counts['exp_realizada'] || 0, rate: counts['exp_agendada'] > 0 ? ((counts['exp_realizada'] || 0) / counts['exp_agendada'] * 100).toFixed(1) + '%' : null },
        { label: 'Vendas', value: counts['venda'] || 0, rate: counts['exp_realizada'] > 0 ? ((counts['venda'] || 0) / counts['exp_realizada'] * 100).toFixed(1) + '%' : null },
        { label: 'Perdidas', value: counts['perdida'] || 0, rate: base > 0 ? ((counts['perdida'] || 0) / base * 100).toFixed(1) + '%' : null },
      ];
      
      container.innerHTML = kpis.map(kpi => \`
        <div class="kpi-card">
          <div class="label">\${kpi.label}</div>
          <div class="value">\${kpi.value.toLocaleString('pt-BR')}</div>
          \${kpi.rate ? \`<div class="rate">\${kpi.rate} taxa</div>\` : ''}
        </div>
      \`).join('');
    }
    
    function renderFunnel(containerId, mini) {
      const container = document.getElementById(containerId);
      
      const counts = {};
      FUNNEL_STAGES.forEach(s => counts[s.key] = 0);
      filteredRows.forEach(row => {
        FUNNEL_STAGES.forEach(s => {
          if (isTruthy(row[s.column])) counts[s.key]++;
        });
      });
      
      // Base for funnel is Lead Ativo (business rule)
      const base = counts['lead_ativo'] || filteredRows.length;
      const maxCount = Math.max(...Object.values(counts), 1);
      
      // Filter stages for mini view
      const stages = mini 
        ? FUNNEL_STAGES.filter(s => ['lead_ativo', 'qualificado', 'exp_agendada', 'exp_realizada', 'venda'].includes(s.key))
        : FUNNEL_STAGES;
      
      container.innerHTML = stages.map(stage => {
        const count = counts[stage.key] || 0;
        const width = (count / maxCount * 100).toFixed(1);
        const rate = base > 0 ? (count / base * 100).toFixed(1) : 0;
        
        return \`
          <div class="funnel-step">
            <div class="step-label">\${stage.label}</div>
            <div class="step-bar"><div class="fill" style="width: \${width}%"></div></div>
            <div class="step-value">\${count.toLocaleString('pt-BR')}</div>
            <div class="step-rate">\${rate}%</div>
          </div>
        \`;
      }).join('');
    }
    
    function renderTrendChart() {
      const container = document.getElementById('trend-chart');
      
      // Group by day
      const dayData = {};
      filteredRows.forEach(row => {
        if (!row._day) return;
        if (!dayData[row._day]) dayData[row._day] = 0;
        dayData[row._day]++;
      });
      
      // Get last 21 days
      const days = Object.keys(dayData).sort().slice(-21);
      if (days.length === 0) {
        container.innerHTML = '<div class="empty-state">Sem dados para exibir</div>';
        return;
      }
      
      const maxVal = Math.max(...days.map(d => dayData[d]), 1);
      
      container.innerHTML = days.map(day => {
        const val = dayData[day];
        const height = (val / maxVal * 100).toFixed(1);
        return \`
          <div class="chart-bar" style="height: \${height}%">
            <div class="tooltip">\${formatDate(day)}: \${val}</div>
          </div>
        \`;
      }).join('');
    }
    
    function renderSalesChart() {
      const container = document.getElementById('sales-chart');
      
      const vendaStage = FUNNEL_STAGES.find(s => s.key === 'venda');
      if (!vendaStage) {
        container.innerHTML = '<div class="empty-state">Coluna de vendas não encontrada</div>';
        return;
      }
      
      // Group by day
      const dayData = {};
      filteredRows.forEach(row => {
        if (!row._day) return;
        if (!isTruthy(row[vendaStage.column])) return;
        if (!dayData[row._day]) dayData[row._day] = 0;
        dayData[row._day]++;
      });
      
      const days = Object.keys(dayData).sort().slice(-21);
      if (days.length === 0) {
        container.innerHTML = '<div class="empty-state">Sem vendas no período</div>';
        return;
      }
      
      const maxVal = Math.max(...days.map(d => dayData[d]), 1);
      
      container.innerHTML = days.map(day => {
        const val = dayData[day];
        const height = (val / maxVal * 100).toFixed(1);
        return \`
          <div class="chart-bar" style="height: \${height}%; background: linear-gradient(180deg, #22c55e, #16a34a)">
            <div class="tooltip">\${formatDate(day)}: \${val}</div>
          </div>
        \`;
      }).join('');
    }
    
    function renderTable() {
      const thead = document.getElementById('table-head');
      const tbody = document.getElementById('table-body');
      
      // Determine columns to show (skip internal columns)
      const allCols = Object.keys(RAW_ROWS[0] || {}).filter(c => !c.startsWith('_'));
      const priorityCols = [ID_COLUMN, TIME_COLUMN, ...DIMENSIONS].filter(Boolean);
      const stageCols = FUNNEL_STAGES.map(s => s.column);
      const otherCols = allCols.filter(c => !priorityCols.includes(c) && !stageCols.includes(c));
      
      const columns = [...priorityCols, ...stageCols.slice(0, 5), ...otherCols.slice(0, 5)];
      
      // Header
      thead.innerHTML = '<tr>' + columns.map(col => {
        const sortClass = sortColumn === col ? (sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc') : '';
        const label = col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return \`<th class="\${sortClass}" onclick="sortTable('\${col}')">\${label}</th>\`;
      }).join('') + '</tr>';
      
      // Sort
      let sorted = [...filteredRows];
      if (sortColumn) {
        sorted.sort((a, b) => {
          const aVal = a[sortColumn];
          const bVal = b[sortColumn];
          if (aVal === bVal) return 0;
          if (aVal === null || aVal === undefined) return 1;
          if (bVal === null || bVal === undefined) return -1;
          const cmp = String(aVal).localeCompare(String(bVal), 'pt-BR', { numeric: true });
          return sortDirection === 'asc' ? cmp : -cmp;
        });
      }
      
      // Paginate
      const start = (currentPage - 1) * pageSize;
      const pageRows = sorted.slice(start, start + pageSize);
      
      // Body
      tbody.innerHTML = pageRows.map(row => {
        return '<tr>' + columns.map(col => {
          let val = col === TIME_COLUMN ? row._day : row[col];
          if (val === null || val === undefined) val = '';
          if (FUNNEL_STAGES.some(s => s.column === col)) {
            val = isTruthy(val) ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-danger">Não</span>';
          }
          return \`<td>\${val}</td>\`;
        }).join('') + '</tr>';
      }).join('');
      
      // Pagination
      const totalPages = Math.ceil(sorted.length / pageSize);
      const pagination = document.getElementById('pagination');
      pagination.innerHTML = \`
        <button class="btn btn-outline" onclick="goToPage(1)" \${currentPage === 1 ? 'disabled' : ''}>«</button>
        <button class="btn btn-outline" onclick="goToPage(\${currentPage - 1})" \${currentPage === 1 ? 'disabled' : ''}>‹</button>
        <span>Página \${currentPage} de \${totalPages}</span>
        <button class="btn btn-outline" onclick="goToPage(\${currentPage + 1})" \${currentPage >= totalPages ? 'disabled' : ''}>›</button>
        <button class="btn btn-outline" onclick="goToPage(\${totalPages})" \${currentPage >= totalPages ? 'disabled' : ''}>»</button>
      \`;
    }
    
    function sortTable(column) {
      if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = column;
        sortDirection = 'asc';
      }
      renderTable();
    }
    
    function goToPage(page) {
      const totalPages = Math.ceil(filteredRows.length / pageSize);
      if (page < 1 || page > totalPages) return;
      currentPage = page;
      renderTable();
    }
    
    function exportCSV() {
      const allCols = Object.keys(RAW_ROWS[0] || {}).filter(c => !c.startsWith('_'));
      
      let csv = allCols.join(';') + '\\n';
      filteredRows.forEach(row => {
        csv += allCols.map(col => {
          let val = row[col];
          if (val === null || val === undefined) val = '';
          val = String(val).replace(/"/g, '""');
          if (val.includes(';') || val.includes('"') || val.includes('\\n')) {
            val = '"' + val + '"';
          }
          return val;
        }).join(';') + '\\n';
      });
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dados_filtrados.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
    
    // Helpers
    function isTruthy(val) {
      if (val === null || val === undefined || val === '') return false;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'number') return val > 0;
      const v = String(val).toLowerCase().trim();
      return ['1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'on', 'ativo', 'realizado', 'agendado', 'ganho'].includes(v);
    }
    
    function formatDate(dateStr) {
      if (!dateStr) return '';
      const [y, m, d] = dateStr.split('-');
      return \`\${d}/\${m}\`;
    }
    
    function formatMonth(monthStr) {
      if (!monthStr) return '';
      const [y, m] = monthStr.split('-');
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      return \`\${months[parseInt(m) - 1]} \${y}\`;
    }
  </script>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// =====================================================
// MAIN HANDLER
// =====================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado')
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request
    const body = await req.json()
    const {
      dashboard_id,
      dataset_id,
      datasource_id,
      object_name,
      dashboard_name,
      limit = 50000, // Higher limit for full aggregations
      output = 'json' // 'json' or 'html'
    } = body

    // Get dashboard info if dashboard_id provided
    let dataSource: any = null
    let targetObjectName = object_name
    let name = dashboard_name || 'Dashboard CRM'

    if (dashboard_id) {
      const { data: dashboard, error: dashError } = await adminClient
        .from('dashboards')
        .select('*, tenant_data_sources(*)')
        .eq('id', dashboard_id)
        .single()

      if (dashError || !dashboard) {
        return errorResponse('NOT_FOUND', 'Dashboard não encontrado')
      }

      dataSource = dashboard.tenant_data_sources
      targetObjectName = dashboard.view_name
      name = dashboard.name
    } else if (dataset_id) {
      const { data: dataset, error: dsError } = await adminClient
        .from('datasets')
        .select('*, tenant_data_sources:datasource_id(*)')
        .eq('id', dataset_id)
        .single()

      if (dsError || !dataset) {
        return errorResponse('NOT_FOUND', 'Dataset não encontrado')
      }

      dataSource = dataset.tenant_data_sources
      targetObjectName = dataset.object_name
      name = dataset.name
    } else if (datasource_id && object_name) {
      const { data: ds, error: dsErr } = await adminClient
        .from('tenant_data_sources')
        .select('*')
        .eq('id', datasource_id)
        .single()

      if (dsErr || !ds) {
        return errorResponse('NOT_FOUND', 'Data source não encontrado')
      }

      dataSource = ds
    }

    if (!dataSource) {
      return errorResponse('VALIDATION_ERROR', 'Data source não encontrado')
    }

    // Detect data source type
    const isGoogleSheets = dataSource.type === 'google_sheets' || 
      Boolean(dataSource.google_spreadsheet_id) || 
      Boolean(dataSource.google_access_token_encrypted)

    let rawRows: any[] = []

    if (isGoogleSheets) {
      // =====================================================
      // GOOGLE SHEETS DATA SOURCE
      // =====================================================
      console.log(`[generate-crm-html] Google Sheets data source detected`)

      let accessToken: string | null = null
      
      // Try to get access token
      if (dataSource.google_access_token_encrypted) {
        try {
          accessToken = await decryptGoogleFormat(dataSource.google_access_token_encrypted)
        } catch (e) {
          console.error('[generate-crm-html] Failed to decrypt access token:', e)
        }
      }

      // Check if token is expired and refresh if needed
      const tokenExpiresAt = dataSource.google_token_expires_at ? new Date(dataSource.google_token_expires_at) : null
      const isExpired = tokenExpiresAt && tokenExpiresAt <= new Date()

      if ((!accessToken || isExpired) && dataSource.google_refresh_token_encrypted) {
        console.log('[generate-crm-html] Refreshing Google access token...')
        try {
          const refreshToken = await decryptGoogleFormat(dataSource.google_refresh_token_encrypted)
          const clientId = dataSource.google_client_id_encrypted 
            ? await decryptGoogleFormat(dataSource.google_client_id_encrypted) 
            : Deno.env.get('GOOGLE_CLIENT_ID')
          const clientSecret = dataSource.google_client_secret_encrypted 
            ? await decryptGoogleFormat(dataSource.google_client_secret_encrypted) 
            : Deno.env.get('GOOGLE_CLIENT_SECRET')

          if (clientId && clientSecret && refreshToken) {
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
              console.log('[generate-crm-html] Token refreshed successfully')
            } else {
              console.error('[generate-crm-html] Token refresh failed:', await tokenResponse.text())
            }
          }
        } catch (e) {
          console.error('[generate-crm-html] Error refreshing token:', e)
        }
      }

      if (!accessToken) {
        return errorResponse('NO_CREDENTIALS', 'Credenciais do Google Sheets não configuradas ou expiradas')
      }

      // Fetch from Google Sheets
      const spreadsheetId = dataSource.google_spreadsheet_id
      const sheetName = targetObjectName || dataSource.google_sheet_name || 'Sheet1'
      
      if (!spreadsheetId) {
        return errorResponse('VALIDATION_ERROR', 'Spreadsheet ID não configurado')
      }

      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`
      
      console.log(`[generate-crm-html] Fetching from Google Sheets: ${sheetName}`)
      
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text()
        console.error('[generate-crm-html] Google Sheets API error:', errorText)
        return errorResponse('FETCH_ERROR', 'Erro ao acessar Google Sheets', errorText.slice(0, 200))
      }

      const sheetsData = await sheetsResponse.json()
      const values = sheetsData.values || []

      if (values.length < 2) {
        return jsonResponse({
          ok: true,
          html: null,
          message: 'Nenhum dado encontrado',
          stats: { rows: 0 }
        })
      }

      // Convert to objects: first row is headers
      const headers = values[0].map((h: any) => String(h).trim())
      rawRows = values.slice(1).map((row: any[]) => {
        const obj: Record<string, any> = {}
        headers.forEach((header: string, i: number) => {
          obj[header] = row[i] !== undefined ? row[i] : null
        })
        return obj
      })

      console.log(`[generate-crm-html] Got ${rawRows.length} rows from Google Sheets with ${headers.length} columns`)

    } else {
      // =====================================================
      // SUPABASE DATA SOURCE
      // =====================================================
      
      // Get credentials
      let apiKey: string | null = null
      if (dataSource.anon_key_encrypted) {
        try {
          apiKey = await decryptSupabaseFormat(dataSource.anon_key_encrypted)
        } catch (e) {
          console.error('Failed to decrypt anon_key')
        }
      }
      if (!apiKey && dataSource.service_role_key_encrypted) {
        try {
          apiKey = await decryptSupabaseFormat(dataSource.service_role_key_encrypted)
        } catch (e) {
          console.error('Failed to decrypt service_role_key')
        }
      }

      // Fallback to Afonsina keys
      if (!apiKey) {
        const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL')
        const afonsinaKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('AFONSINA_SUPABASE_ANON_KEY')
        if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
          apiKey = afonsinaKey || null
        }
      }

      if (!apiKey) {
        return errorResponse('NO_CREDENTIALS', 'Credenciais não configuradas')
      }

      if (!targetObjectName) {
        return errorResponse('VALIDATION_ERROR', 'Nome do objeto não especificado')
      }

      console.log(`[generate-crm-html] Generating for ${targetObjectName} (limit=${limit})...`)

      // Fetch raw data with higher limit
      const fetchUrl = `${dataSource.project_url}/rest/v1/${targetObjectName}?select=*&limit=${limit}`
      
      const response = await fetch(fetchUrl, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        return errorResponse('FETCH_ERROR', `Erro ao acessar ${targetObjectName}`, errorText.slice(0, 200))
      }

      rawRows = await response.json()
    }
    
    if (!rawRows || rawRows.length === 0) {
      return jsonResponse({
        ok: true,
        html: null,
        message: 'Nenhum dado encontrado',
        stats: { rows: 0 }
      })
    }

    console.log(`Fetched ${rawRows.length} rows`)

    // P0 HOTFIX: Robust column extraction
    let columnNames: string[] = []
    const firstRow = rawRows[0]
    
    // Handle different row formats
    if (typeof firstRow === 'string') {
      // Row might be stringified JSON
      try {
        const parsed = JSON.parse(firstRow)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          columnNames = Object.keys(parsed)
          console.log('P0: Parsed stringified JSON row')
        }
      } catch {
        console.warn('P0: First row is string but not valid JSON')
      }
    } else if (Array.isArray(firstRow)) {
      // CSV-like: check if first row looks like headers
      const looksLikeHeaders = firstRow.every((v: any) => typeof v === 'string' && !/^\d+$/.test(String(v)))
      if (looksLikeHeaders) {
        columnNames = firstRow.map((v: any) => String(v))
        console.log('P0: Using array first row as headers')
      } else {
        columnNames = firstRow.map((_: any, i: number) => `col_${i}`)
        console.log('P0: Generated col_0, col_1... for array rows')
      }
    } else if (typeof firstRow === 'object' && firstRow !== null) {
      // Normal object row - get union of keys from first 20 rows
      const allKeys = new Set<string>()
      for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
        const row = rawRows[i]
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          Object.keys(row).forEach(k => allKeys.add(String(k)))
        }
      }
      columnNames = Array.from(allKeys)
    }
    
    // P0: Fallback if still no columns
    if (columnNames.length === 0) {
      console.error('P0 CRITICAL: No columns detected from rows!', {
        firstRowType: typeof firstRow,
        firstRowSample: JSON.stringify(firstRow).slice(0, 200)
      })
      return errorResponse('NO_COLUMNS', 'Nenhuma coluna detectada no dataset', 
        `firstRowType: ${typeof firstRow}, rowsCount: ${rawRows.length}`)
    }
    
    console.log(`P0: Detected ${columnNames.length} columns: ${columnNames.slice(0, 5).join(', ')}...`)
    
    const mapping = analyzeColumns(columnNames)

    console.log(`Time: ${mapping.timeColumn}, Stages: ${mapping.funnelStages.length}, Dims: ${mapping.dimensions.length}`)

    // Determine date range
    let minDate = '2020-01-01'
    let maxDate = new Date().toISOString().split('T')[0]
    
    if (mapping.timeColumn) {
      const dates = rawRows
        .map((r: any) => parseTextDate(r[mapping.timeColumn]))
        .filter(Boolean)
        .map((p: any) => p.day)
        .sort()
      
      if (dates.length > 0) {
        minDate = dates[0]
        maxDate = dates[dates.length - 1]
      }
    }

    const dashboardData: DashboardData = {
      dashboardName: name,
      mapping,
      rows: rawRows,
      dateRange: { start: minDate, end: maxDate }
    }

    if (output === 'html') {
      const html = generateHTML(dashboardData)
      return htmlResponse(html)
    }

    // Return JSON with HTML string
    const html = generateHTML(dashboardData)
    
    // P0 FIX: Build KPIs for diagnostics
    const kpis = [
      { key: 'total_leads', label: 'Total Leads', aggregation: 'count', format: 'integer' }
    ]
    
    // Add funnel stage KPIs
    for (const stage of mapping.funnelStages.slice(0, 6)) {
      kpis.push({
        key: stage.column,
        label: stage.label,
        aggregation: 'truthy_count',
        format: 'integer'
      })
    }
    
    // P0 FIX: Build structured funnel_stages array with column names
    const funnelStagesStructured = mapping.funnelStages.map((s, i) => ({
      column: s.column,
      label: s.label,
      order: i + 1
    }))
    
    return jsonResponse({
      ok: true,
      html,
      rows_used: rawRows.length,
      columns_used: columnNames,
      time_column: mapping.timeColumn,
      // P0 FIX: Return structured data for frontend diagnostics
      funnel_stages: funnelStagesStructured,
      kpis: kpis,
      charts: [
        { type: 'line', title: 'Leads por Dia', x_column: mapping.timeColumn, series: ['entrada'] },
        { type: 'bar', title: 'Leads por Dimensão', x_column: mapping.dimensions[0] || null, series: ['total'] }
      ],
      warnings: [],
      stats: {
        rows: rawRows.length,
        time_column: mapping.timeColumn,
        funnel_stages: mapping.funnelStages.length,
        dimensions: mapping.dimensions.length,
        date_range: { start: minDate, end: maxDate }
      },
      mapping: {
        time_column: mapping.timeColumn,
        id_column: mapping.idColumn,
        funnel_stages: mapping.funnelStages.map(s => s.column),
        dimensions: mapping.dimensions
      },
      // P0 DEBUG: Include extraction info
      _debug: {
        column_count: columnNames.length,
        extraction_method: 'object_keys',
        kpis_count: kpis.length,
        funnel_stages_count: funnelStagesStructured.length
      }
    })

  } catch (error) {
    console.error('Error generating CRM HTML:', error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno ao gerar dashboard', String(error))
  }
})
