import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function errorResponse(code: string, message: string, details?: string) {
  return jsonResponse({ ok: false, error: { code, message, details } }, 400);
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data });
}

// =====================================================
// CODER SYSTEM PROMPTS
// =====================================================

const CODER_REACT_SYSTEM_PROMPT = `Você é o BAI Dashboard Coder (React), especialista em implementar dashboards usando React + Tailwind + Recharts.
Você recebe um CoderPrompt + DashboardPlan e gera um DashboardSpec JSON que será renderizado pelo ModernDashboardViewer.

REGRAS DURAS:
1. NÃO decida KPIs/filtros - apenas implemente o que está no Plan
2. NÃO altere a lógica de agregação - use exatamente as fórmulas do Plan
3. NÃO use LIMIT 1000 para agregados - o backend cuida disso
4. SIGA o layout do Plan (tabs, ordem dos tiles)
5. Use os endpoints definidos no CoderPrompt

FORMATO DE SAÍDA (DashboardSpec v1):
{
  "version": 1,
  "time": { "column": "string" } | null,
  "kpis": [{ "key": "string", "label": "string", "format": "integer|currency|percent", "aggregation": "count_distinct|sum_truthy|sum|avg", "goal_direction": "higher_better|lower_better" }],
  "charts": [{ "type": "line|bar", "metric": "string", "groupBy": "string", "label": "string" }],
  "funnel": { "stages": [{ "column": "string", "label": "string" }], "id_column": "string" } | null,
  "tabs": ["string"],
  "filters": [{ "column": "string", "label": "string", "type": "select|multiselect|date_range" }],
  "table": { "columns": [{ "key": "string", "label": "string", "format": "text|number|currency|date" }] },
  "labels": {},
  "formatting": {}
}

NÃO inclua explicações, apenas JSON válido.`;

const CODER_HTML_SYSTEM_PROMPT = `Você é o BAI Dashboard Coder (HTML), especialista em criar dashboards HTML self-contained.
Você recebe um CoderPrompt + DashboardPlan e gera HTML completo com CSS e JavaScript inline.

REGRAS DURAS:
1. HTML deve ser self-contained (CSS e JS inline)
2. NÃO decida KPIs/filtros - apenas implemente o que está no Plan
3. Use dark mode por padrão
4. Inclua tabs funcionais
5. Inclua filtros interativos
6. Inclua export CSV
7. Responsive design

ESTRUTURA DO HTML:
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard</title>
  <style>/* CSS inline com dark mode */</style>
</head>
<body>
  <!-- Estrutura do dashboard -->
  <script>/* JavaScript para interatividade */</script>
</body>
</html>

FORMATO DE SAÍDA:
{
  "html": "<!DOCTYPE html>...",
  "metadata": {
    "title": "string",
    "kpi_count": number,
    "chart_count": number,
    "has_funnel": boolean,
    "has_filters": boolean
  }
}

NÃO inclua explicações, apenas JSON válido.`;

// =====================================================
// CODE GENERATION
// =====================================================

function convertPlanToSpec(plan: any): any {
  const spec: any = {
    version: 1,
    time: plan.time_column ? { column: plan.time_column } : null,
    kpis: [],
    charts: [],
    funnel: null,
    tabs: plan.tabs?.map((t: any) => t.name) || ['Executivo', 'Detalhes'],
    filters: [],
    table: { columns: [] },
    labels: {},
    formatting: {}
  };

  // Convert KPIs
  if (Array.isArray(plan.kpis)) {
    spec.kpis = plan.kpis.map((k: any) => ({
      key: k.column,
      label: k.label,
      format: k.format || 'integer',
      aggregation: k.formula?.includes('truthy') ? 'truthy_count' : 
                   k.formula?.includes('count_distinct') ? 'count_distinct' :
                   k.formula?.includes('sum') ? 'sum' : 
                   k.formula?.includes('avg') ? 'avg' : 'count',
      goal_direction: k.goal_direction || 'higher_better'
    }));
  }

  // Convert Charts
  if (Array.isArray(plan.charts)) {
    spec.charts = plan.charts.map((c: any) => ({
      type: c.type || 'line',
      metric: c.series?.[0]?.column || c.x_column,
      groupBy: c.x_column,
      label: c.title
    }));
  }

  // Convert Funnel
  if (plan.funnel?.stages?.length >= 2) {
    spec.funnel = {
      stages: plan.funnel.stages.map((s: any) => ({
        column: s.column,
        label: s.label
      })),
      id_column: plan.id_column || 'lead_id'
    };
  }

  // Convert Filters
  if (Array.isArray(plan.filters)) {
    spec.filters = plan.filters.map((f: any) => ({
      column: f.column,
      label: f.label,
      type: f.type || 'select'
    }));
  }

  return spec;
}

function generateHtmlFromPlan(plan: any, coderPrompt: any): { html: string; metadata: any } {
  const title = plan.title || 'Dashboard';
  const kpis = plan.kpis || [];
  const funnel = plan.funnel;
  const filters = plan.filters || [];
  const tabs = plan.tabs || [];

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-card: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --accent: #3b82f6;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 1rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .header h1 { font-size: 1.5rem; font-weight: 600; }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; background: var(--bg-secondary); padding: 0.25rem; border-radius: 0.5rem; }
    .tab { padding: 0.5rem 1rem; border-radius: 0.375rem; cursor: pointer; transition: all 0.2s; border: none; background: transparent; color: var(--text-secondary); }
    .tab.active { background: var(--accent); color: white; }
    .tab:hover:not(.active) { background: var(--bg-card); }
    .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
    .filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
    .filter-label { font-size: 0.75rem; color: var(--text-secondary); }
    .filter-select { padding: 0.5rem; border-radius: 0.375rem; border: 1px solid var(--bg-card); background: var(--bg-secondary); color: var(--text-primary); min-width: 150px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-card { background: var(--bg-secondary); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--bg-card); }
    .kpi-label { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
    .kpi-value { font-size: 1.75rem; font-weight: 700; }
    .kpi-delta { font-size: 0.875rem; margin-top: 0.25rem; }
    .kpi-delta.positive { color: var(--success); }
    .kpi-delta.negative { color: var(--danger); }
    .funnel-container { background: var(--bg-secondary); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; }
    .funnel-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; }
    .funnel-stage { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem; }
    .funnel-bar-container { flex: 1; height: 2rem; background: var(--bg-card); border-radius: 0.375rem; overflow: hidden; }
    .funnel-bar { height: 100%; background: linear-gradient(90deg, var(--accent), #60a5fa); transition: width 0.5s ease; }
    .funnel-label { min-width: 120px; font-size: 0.875rem; }
    .funnel-value { min-width: 80px; text-align: right; font-weight: 600; }
    .funnel-rate { min-width: 60px; text-align: right; font-size: 0.75rem; color: var(--text-secondary); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .chart-placeholder { background: var(--bg-secondary); padding: 2rem; border-radius: 0.75rem; text-align: center; color: var(--text-secondary); margin-bottom: 1rem; }
    .table-container { background: var(--bg-secondary); border-radius: 0.75rem; overflow: hidden; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--bg-card); }
    .table th { background: var(--bg-card); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); }
    .export-btn { padding: 0.5rem 1rem; border-radius: 0.375rem; border: 1px solid var(--accent); background: transparent; color: var(--accent); cursor: pointer; }
    .export-btn:hover { background: var(--accent); color: white; }
    @media (max-width: 768px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .filters { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
      <button class="export-btn" onclick="exportCSV()">Exportar CSV</button>
    </div>
    
    <div class="tabs">
      ${tabs.map((t: any, i: number) => `<button class="tab${i === 0 ? ' active' : ''}" onclick="showTab('${t.name}')">${t.name}</button>`).join('')}
    </div>
    
    ${filters.length > 0 ? `
    <div class="filters">
      ${filters.map((f: any) => `
      <div class="filter-group">
        <label class="filter-label">${f.label}</label>
        <select class="filter-select" id="filter-${f.column}">
          <option value="">Todos</option>
        </select>
      </div>
      `).join('')}
    </div>
    ` : ''}
    
    <div id="tab-decisoes" class="tab-content active">
      <div class="kpi-grid">
        ${kpis.slice(0, 6).map((k: any) => `
        <div class="kpi-card">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value" id="kpi-${k.id}">-</div>
          <div class="kpi-delta" id="delta-${k.id}">--</div>
        </div>
        `).join('')}
      </div>
      
      ${funnel ? `
      <div class="funnel-container">
        <div class="funnel-title">${funnel.title || 'Funil de Conversão'}</div>
        ${funnel.stages.map((s: any) => `
        <div class="funnel-stage">
          <div class="funnel-label">${s.label}</div>
          <div class="funnel-bar-container">
            <div class="funnel-bar" id="funnel-bar-${s.column}" style="width: 0%"></div>
          </div>
          <div class="funnel-value" id="funnel-val-${s.column}">-</div>
          <div class="funnel-rate" id="funnel-rate-${s.column}">--</div>
        </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
    
    <div id="tab-executivo" class="tab-content">
      <div class="kpi-grid">
        ${kpis.map((k: any) => `
        <div class="kpi-card">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value" id="kpi-exec-${k.id}">-</div>
        </div>
        `).join('')}
      </div>
    </div>
    
    ${funnel ? `
    <div id="tab-funil" class="tab-content">
      <div class="funnel-container">
        <div class="funnel-title">${funnel.title || 'Funil de Conversão'}</div>
        ${funnel.stages.map((s: any) => `
        <div class="funnel-stage">
          <div class="funnel-label">${s.label}</div>
          <div class="funnel-bar-container">
            <div class="funnel-bar" id="funnel2-bar-${s.column}" style="width: 0%"></div>
          </div>
          <div class="funnel-value" id="funnel2-val-${s.column}">-</div>
          <div class="funnel-rate" id="funnel2-rate-${s.column}">--</div>
        </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
    
    <div id="tab-tendencias" class="tab-content">
      <div class="chart-placeholder">
        📊 Gráficos de tendência serão carregados aqui
      </div>
    </div>
    
    <div id="tab-detalhes" class="tab-content">
      <div class="table-container">
        <table class="table" id="details-table">
          <thead><tr><th>Carregando...</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </div>
  
  <script>
    function showTab(tabName) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      
      const tabId = 'tab-' + tabName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const tabEl = document.getElementById(tabId);
      if (tabEl) tabEl.classList.add('active');
      
      event.target.classList.add('active');
    }
    
    function exportCSV() {
      alert('Export CSV - conectar ao endpoint de dados');
    }
    
    // Initialize with placeholder data
    document.addEventListener('DOMContentLoaded', function() {
      console.log('Dashboard loaded. Connect to data endpoints to populate.');
    });
  </script>
</body>
</html>`;

  return {
    html,
    metadata: {
      title,
      kpi_count: kpis.length,
      chart_count: plan.charts?.length || 0,
      has_funnel: !!funnel,
      has_filters: filters.length > 0
    }
  };
}

async function generateWithLLM(
  plan: any, 
  coderPrompt: any, 
  targetMode: 'react' | 'html'
): Promise<any | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.log('No LOVABLE_API_KEY, falling back to heuristic coder');
    return null;
  }

  try {
    const systemPrompt = targetMode === 'react' ? CODER_REACT_SYSTEM_PROMPT : CODER_HTML_SYSTEM_PROMPT;
    
    const prompt = `DASHBOARD PLAN:
${JSON.stringify(plan, null, 2)}

CODER PROMPT:
${JSON.stringify(coderPrompt, null, 2)}

Gere o ${targetMode === 'react' ? 'DashboardSpec JSON' : 'HTML completo'} seguindo as regras do sistema.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 12000
      })
    });

    if (!response.ok) {
      console.error('LLM Coder request failed:', response.status);
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) return null;

    // Extract JSON
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('LLM Coder error:', error);
    return null;
  }
}

// =====================================================
// DENO SERVE
// =====================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Token de autorização não fornecido');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Authenticate
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager']);

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado');
    }

    // Parse request
    const body = await req.json();
    const { 
      dashboard_plan, 
      coder_prompt, 
      target_mode = 'react',
      use_llm = true 
    } = body;

    if (!dashboard_plan) {
      return errorResponse('VALIDATION_ERROR', 'dashboard_plan é obrigatório');
    }

    // Generate code
    let result;
    let source: 'llm' | 'heuristic' = 'heuristic';

    if (use_llm) {
      result = await generateWithLLM(dashboard_plan, coder_prompt, target_mode);
      if (result) {
        source = 'llm';
      }
    }

    if (!result) {
      // Fallback to heuristic
      if (target_mode === 'html') {
        result = generateHtmlFromPlan(dashboard_plan, coder_prompt);
      } else {
        result = convertPlanToSpec(dashboard_plan);
      }
    }

    console.log(`Coder generated: mode=${target_mode}, source=${source}`);

    return successResponse({
      code: result,
      target_mode,
      source
    });

  } catch (error: any) {
    console.error('Error in generate-dashboard-coder:', error);
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message);
  }
});
