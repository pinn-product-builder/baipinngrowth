import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================
// SYSTEM PROMPT (BASE)
// =====================================================
const SYSTEM_PROMPT_BASE = `Você é o BAI AI Analyst, um analista de dados sênior de um SaaS B2B de dashboards (BAI Analytics).
Seu trabalho é ajudar tomadores de decisão a entender desempenho, custos, funil e eficiência — com clareza, precisão e ações práticas.

PRINCÍPIOS
- Seja factual: use APENAS os dados e métricas fornecidos no "Context Pack" (KPIs, séries, alertas calculados, estatísticas, colunas e limitações).
- Nunca invente números, datas, causas ou campanhas. Se não houver dado suficiente, diga explicitamente "não dá para concluir com segurança" e explique o que faltou.
- Seja útil e direto: respostas estruturadas, com linguagem profissional e clara.
- Linguagem: português do Brasil, profissional, sem emojis.
- Segurança: nunca exponha chaves, tokens, credenciais, SQL sensível, endpoints privados, nem detalhes internos do backend. Se o usuário pedir, recuse.

FORMATO PADRÃO DE RESPOSTA
1) Resumo (2–4 linhas)
2) Números principais (bullet points)
3) O que mudou e por quê (se for hipótese, rotule como "Hipótese")
4) Alertas (se houver)
5) Próximas ações (3 a 7 ações objetivas)
6) Limitações (quando necessário)

COMO INTERPRETAR
- CPL/CAC: trate como custo por evento. Se houver divisão por zero, marque como "indisponível".
- Taxas: podem estar em 0–1 ou 0–100. Siga o spec/context pack. Se não existir, siga o valor já normalizado no Context Pack.
- Datas: respeite o período selecionado.

PREVISÕES (MVP)
- Só apresentar previsões se o Context Pack tiver forecast.enabled = true.
- Sempre rotular como "estimativa", mencionar o método (média móvel / tendência).
- Se os dados forem poucos/instáveis, recusar previsão e justificar.

DIAGNÓSTICO
- Ao sinalizar problemas, cite o "sinal" encontrado (ex.: custo subiu X% e leads caíram Y%).
- Não atribuir culpa a canal/campanha sem dimensão disponível.
- Sugira investigações comuns: tracking, mudança de oferta, queda por etapa do funil, custo de mídia, gargalo comercial, follow-up, sazonalidade.

INTERAÇÃO
- Se a pergunta estiver vaga, faça no máximo 1 pergunta curta para esclarecer.
- Se o usuário pedir recortes que não existem no dataset (ex.: campanha/anúncio) informe que a dimensão não está disponível.`;

// =====================================================
// ENCRYPTION HELPERS
// =====================================================
async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY not configured')
  }
  
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  return keyMaterial
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
// HELPER FUNCTIONS
// =====================================================

function safeNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) || !isFinite(num) ? null : num;
}

function safeString(val: any): string {
  return String(val ?? '');
}

function calculateSum(rows: any[], key: string): number {
  return rows.reduce((acc, row) => {
    const val = safeNumber(row[key]);
    return acc + (val ?? 0);
  }, 0);
}

function calculateAvg(rows: any[], key: string): number | null {
  const values = rows.map(r => safeNumber(r[key])).filter(v => v !== null) as number[];
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// =====================================================
// ALERTS DETECTION
// =====================================================
interface Alert {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  evidence: Record<string, any>;
}

function detectAlerts(rows: any[], kpis: Record<string, number | null>): Alert[] {
  const alerts: Alert[] = [];
  
  if (rows.length < 2) return alerts;
  
  // Sort by date
  const sortedRows = [...rows].sort((a, b) => {
    const dateA = a.dia || a.date || a.created_at || '';
    const dateB = b.dia || b.date || b.created_at || '';
    return String(dateA).localeCompare(String(dateB));
  });
  
  const halfIndex = Math.floor(sortedRows.length / 2);
  const firstHalf = sortedRows.slice(0, halfIndex);
  const secondHalf = sortedRows.slice(halfIndex);
  
  // Compare first half vs second half
  const firstCost = calculateSum(firstHalf, 'custo_total');
  const secondCost = calculateSum(secondHalf, 'custo_total');
  const firstLeads = calculateSum(firstHalf, 'leads_total');
  const secondLeads = calculateSum(secondHalf, 'leads_total');
  
  // Cost up + leads down
  if (firstCost > 0 && secondCost > firstCost * 1.1 && secondLeads < firstLeads * 0.9) {
    const costDelta = ((secondCost - firstCost) / firstCost * 100).toFixed(1);
    const leadsDelta = ((secondLeads - firstLeads) / firstLeads * 100).toFixed(1);
    alerts.push({
      type: 'cost_up_leads_down',
      severity: 'high',
      message: `Custo aumentou ${costDelta}% enquanto leads caíram ${Math.abs(Number(leadsDelta))}% na segunda metade do período.`,
      evidence: { costDelta, leadsDelta, from_day: sortedRows[halfIndex]?.dia, to_day: sortedRows[sortedRows.length-1]?.dia }
    });
  }
  
  // CAC spike
  const firstCAC = calculateAvg(firstHalf, 'cac');
  const secondCAC = calculateAvg(secondHalf, 'cac');
  if (firstCAC && secondCAC && secondCAC > firstCAC * 1.3) {
    alerts.push({
      type: 'cac_spike',
      severity: 'medium',
      message: `CAC aumentou ${((secondCAC - firstCAC) / firstCAC * 100).toFixed(1)}% na segunda metade do período.`,
      evidence: { firstCAC: firstCAC.toFixed(2), secondCAC: secondCAC.toFixed(2) }
    });
  }
  
  // CPL spike
  const firstCPL = calculateAvg(firstHalf, 'cpl');
  const secondCPL = calculateAvg(secondHalf, 'cpl');
  if (firstCPL && secondCPL && secondCPL > firstCPL * 1.3) {
    alerts.push({
      type: 'cpl_spike',
      severity: 'medium',
      message: `CPL aumentou ${((secondCPL - firstCPL) / firstCPL * 100).toFixed(1)}% na segunda metade do período.`,
      evidence: { firstCPL: firstCPL.toFixed(2), secondCPL: secondCPL.toFixed(2) }
    });
  }
  
  // Conversion drop
  const firstTaxa = calculateAvg(firstHalf, 'taxa_entrada');
  const secondTaxa = calculateAvg(secondHalf, 'taxa_entrada');
  if (firstTaxa && secondTaxa && secondTaxa < firstTaxa * 0.7) {
    alerts.push({
      type: 'conversion_drop',
      severity: 'high',
      message: `Taxa de entrada caiu ${((firstTaxa - secondTaxa) / firstTaxa * 100).toFixed(1)}% na segunda metade do período.`,
      evidence: { firstTaxa: (firstTaxa * 100).toFixed(1) + '%', secondTaxa: (secondTaxa * 100).toFixed(1) + '%' }
    });
  }
  
  // Zero leads with cost
  const zeroLeadDays = rows.filter(r => (safeNumber(r.leads_total) ?? 0) === 0 && (safeNumber(r.custo_total) ?? 0) > 0);
  if (zeroLeadDays.length > 0) {
    alerts.push({
      type: 'tracking_suspect',
      severity: 'medium',
      message: `${zeroLeadDays.length} dia(s) com custo > 0 e zero leads. Possível problema de tracking.`,
      evidence: { days: zeroLeadDays.slice(0, 3).map(d => d.dia) }
    });
  }
  
  return alerts;
}

// =====================================================
// FORECAST (MVP - moving average)
// =====================================================
interface ForecastSeries {
  dia: string;
  leads_total_pred: number | null;
  cpl_pred: number | null;
  cac_pred: number | null;
}

function generateForecast(rows: any[], horizonDays: number = 7): { enabled: boolean; method: string; series: ForecastSeries[]; notes: string } {
  if (rows.length < 7) {
    return { enabled: false, method: 'moving_average', series: [], notes: 'Dados insuficientes para previsão (mínimo 7 dias)' };
  }
  
  // Get last 7 days averages
  const lastRows = rows.slice(-7);
  const avgLeads = calculateAvg(lastRows, 'leads_total') ?? 0;
  const avgCPL = calculateAvg(lastRows, 'cpl');
  const avgCAC = calculateAvg(lastRows, 'cac');
  
  // Generate forecast dates
  const lastDateStr = rows[rows.length - 1]?.dia;
  if (!lastDateStr) {
    return { enabled: false, method: 'moving_average', series: [], notes: 'Sem coluna de data identificável' };
  }
  
  const lastDate = new Date(lastDateStr);
  const series: ForecastSeries[] = [];
  
  for (let i = 1; i <= horizonDays; i++) {
    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + i);
    series.push({
      dia: forecastDate.toISOString().split('T')[0],
      leads_total_pred: Math.round(avgLeads),
      cpl_pred: avgCPL ? Math.round(avgCPL * 100) / 100 : null,
      cac_pred: avgCAC ? Math.round(avgCAC * 100) / 100 : null,
    });
  }
  
  return {
    enabled: true,
    method: 'moving_average',
    series,
    notes: `Previsão baseada na média móvel dos últimos 7 dias. Use como referência, não como certeza.`
  };
}

// =====================================================
// RANKINGS
// =====================================================
function calculateRankings(rows: any[]): { best_days: any[]; worst_days: any[] } {
  if (rows.length === 0) return { best_days: [], worst_days: [] };
  
  const withMetrics = rows.filter(r => r.dia && (r.cpl || r.cac || r.leads_total));
  
  // Best days by CPL (lower is better)
  const sortedByCPL = [...withMetrics]
    .filter(r => safeNumber(r.cpl) !== null && safeNumber(r.cpl)! > 0)
    .sort((a, b) => (safeNumber(a.cpl) ?? Infinity) - (safeNumber(b.cpl) ?? Infinity));
  
  const best_days = sortedByCPL.slice(0, 3).map(r => ({
    dia: r.dia,
    reason: `Menor CPL: R$ ${safeNumber(r.cpl)?.toFixed(2)}`,
    metrics: { cpl: safeNumber(r.cpl), leads: safeNumber(r.leads_total) }
  }));
  
  // Worst days by CPL (higher is worse)
  const worst_days = sortedByCPL.slice(-3).reverse().map(r => ({
    dia: r.dia,
    reason: `Maior CPL: R$ ${safeNumber(r.cpl)?.toFixed(2)}`,
    metrics: { cpl: safeNumber(r.cpl), leads: safeNumber(r.leads_total) }
  }));
  
  return { best_days, worst_days };
}

// =====================================================
// BUILD CONTEXT PACK
// =====================================================
interface ContextPack {
  meta: any;
  spec: any;
  kpis: Record<string, number | null>;
  series: { by_day: any[] };
  rankings: { best_days: any[]; worst_days: any[] };
  alerts: Alert[];
  forecast: any;
  limitations: string[];
  sample_rows: any[];
}

function buildContextPack(
  rows: any[],
  dashboard: any,
  startDate: string,
  endDate: string
): ContextPack {
  const columns = rows.length > 0 ? Object.keys(rows[0]).map(name => ({
    name,
    type: typeof rows[0][name] === 'number' ? 'number' : 
          name.includes('dia') || name.includes('date') ? 'date' : 'string'
  })) : [];
  
  // Calculate KPIs
  const kpis: Record<string, number | null> = {
    custo_total_sum: calculateSum(rows, 'custo_total'),
    leads_total_sum: calculateSum(rows, 'leads_total'),
    entrada_total_sum: calculateSum(rows, 'entrada_total'),
    reuniao_agendada_total_sum: calculateSum(rows, 'reuniao_agendada_total'),
    reuniao_realizada_total_sum: calculateSum(rows, 'reuniao_realizada_total'),
    venda_total_sum: calculateSum(rows, 'venda_total'),
    cpl_avg: calculateAvg(rows, 'cpl'),
    cac_avg: calculateAvg(rows, 'cac'),
    taxa_entrada_avg: calculateAvg(rows, 'taxa_entrada'),
    taxa_comparecimento_avg: calculateAvg(rows, 'taxa_comparecimento'),
    taxa_venda_total_avg: calculateAvg(rows, 'taxa_venda_total'),
  };
  
  // Derived metrics
  if (kpis.custo_total_sum && kpis.leads_total_sum && kpis.leads_total_sum > 0) {
    kpis.cpl_calculated = kpis.custo_total_sum / kpis.leads_total_sum;
  }
  if (kpis.custo_total_sum && kpis.venda_total_sum && kpis.venda_total_sum > 0) {
    kpis.cac_calculated = kpis.custo_total_sum / kpis.venda_total_sum;
  }
  
  const alerts = detectAlerts(rows, kpis);
  const forecast = generateForecast(rows, 7);
  const rankings = calculateRankings(rows);
  
  const limitations: string[] = [];
  if (rows.length < 7) limitations.push('Período curto (menos de 7 dias) limita análises de tendência');
  if (!columns.find(c => c.name.includes('anuncio') || c.name.includes('campanha'))) {
    limitations.push('Sem dimensão de campanha/anúncio disponível');
  }
  
  // Limit series to 400 rows
  const limitedRows = rows.slice(0, 400);
  if (rows.length > 400) {
    limitations.push(`Dataset truncado de ${rows.length} para 400 linhas`);
  }
  
  return {
    meta: {
      tenant_id: dashboard.tenant_id,
      dashboard_id: dashboard.id,
      dashboard_name: dashboard.name,
      table_or_view: dashboard.view_name || 'unknown',
      generated_at: new Date().toISOString(),
      period: { start: startDate, end: endDate },
      rows_count: rows.length,
      columns,
      warnings: [],
      data_quality: {
        null_rate_by_column: {},
        duplicates_hint: null,
        date_gaps_hint: null
      }
    },
    spec: {
      time_column: 'dia',
      metrics: [
        { name: 'custo_total', kind: 'currency', format: 'BRL' },
        { name: 'leads_total', kind: 'count', format: 'int' },
        { name: 'cpl', kind: 'currency', format: 'BRL' },
        { name: 'cac', kind: 'currency', format: 'BRL' },
      ],
      dimensions: [],
      templates: [dashboard.template_kind || 'cost_funnel_daily']
    },
    kpis,
    series: { by_day: limitedRows },
    rankings,
    alerts,
    forecast,
    limitations,
    sample_rows: rows.slice(0, 3)
  };
}

// =====================================================
// MAIN HANDLER
// =====================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dashboard_id, start, end, question, conversation_id, quick_action, response_mode } = await req.json();
    
    if (!dashboard_id || !start || !end) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: dashboard_id, start, end' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get auth token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Service role client for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Validate user with service role client + token
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData?.user) {
      console.error('JWT validation failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Token inválido ou expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const user = userData.user;
    const userId = user.id;
    console.log(`AI Analyst request from user: ${userId}`);
    
    // Get user profile with AI settings
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id, ai_enabled, ai_daily_limit_messages, ai_daily_limit_tokens, ai_style, ai_response_mode')
      .eq('id', userId)
      .single();
    
    if (profileError || !profile) {
      console.log('Profile not found for user:', userId);
      return new Response(
        JSON.stringify({ error: 'Perfil não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!profile.ai_enabled) {
      return new Response(
        JSON.stringify({ error: 'AI não habilitada para este usuário. Solicite ao administrador.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check rate limits
    const today = new Date().toISOString().split('T')[0];
    const { data: usageData } = await supabase
      .from('ai_usage_daily')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .single();
    
    if (usageData && usageData.requests >= (profile.ai_daily_limit_messages || 30)) {
      return new Response(
        JSON.stringify({ error: `Limite diário atingido (${profile.ai_daily_limit_messages || 30} mensagens/dia)` }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get dashboard metadata
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
    
    // Verify tenant access
    if (dashboard.tenant_id !== profile.tenant_id) {
      // Check if user is admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      
      if (roleData?.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Acesso negado a este dashboard' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Fetch dashboard data using proper decryption
    let rows: any[] = [];
    
    if (dashboard.data_source) {
      const ds = dashboard.data_source;
      
      // Get decrypted key
      let remoteKey: string | null = null;
      
      // Try anon key first
      if (ds.anon_key_encrypted) {
        try {
          remoteKey = await decrypt(ds.anon_key_encrypted);
          console.log('Successfully decrypted anon_key for AI analyst');
        } catch (e) {
          console.error('Failed to decrypt anon_key:', e);
        }
      }
      
      // Fallback to service role key
      if (!remoteKey && ds.service_role_key_encrypted) {
        try {
          remoteKey = await decrypt(ds.service_role_key_encrypted);
          console.log('Successfully decrypted service_role_key for AI analyst');
        } catch (e) {
          console.error('Failed to decrypt service_role_key:', e);
        }
      }
      
      // Fallback to Afonsina keys
      if (!remoteKey) {
        const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL');
        const afonsinaServiceKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY');
        const afonsinaAnonKey = Deno.env.get('AFONSINA_SUPABASE_ANON_KEY');
        
        if (afonsinaUrl && ds.project_url === afonsinaUrl) {
          remoteKey = afonsinaAnonKey || afonsinaServiceKey || null;
          console.log('Using Afonsina fallback keys for AI analyst');
        }
      }
      
      if (remoteKey && dashboard.view_name) {
        // Use REST API to query external Supabase
        // P0 FIX: Removed LIMIT 1000 - AI analyst needs FULL data for accurate analysis
        let restUrl = `${ds.project_url}/rest/v1/${dashboard.view_name}?select=*`;
        restUrl += `&dia=gte.${start}`;
        restUrl += `&dia=lte.${end}`;
        restUrl += `&order=dia.asc`;
        // NOTE: No limit - we need full data for accurate AI analysis
        
        console.log('AI analyst fetching from:', restUrl, '(FULL - no limit)');
        
        try {
          const response = await fetch(restUrl, {
            headers: {
              'apikey': remoteKey,
              'Authorization': `Bearer ${remoteKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'count=exact'
            }
          });
          
          if (response.ok) {
            rows = await response.json();
            const total = response.headers.get('content-range')?.split('/')[1] || rows.length;
            console.log(`AI analyst received ${rows.length} rows (total: ${total}) - FULL aggregation`);
          } else {
            console.error('External Supabase error:', response.status, await response.text());
          }
        } catch (fetchError) {
          console.error('Fetch error:', fetchError);
        }
      } else {
        console.log('No valid credentials or view_name for data source');
      }
    }
    
    // Build context pack
    const contextPack = buildContextPack(rows, dashboard, start, end);
    
    // Handle quick actions
    let actualQuestion = question || '';
    if (quick_action) {
      switch (quick_action) {
        case 'resumo':
          actualQuestion = 'Faça um resumo executivo do período selecionado.';
          break;
        case 'alertas':
          actualQuestion = 'Quais são os principais alertas e problemas identificados?';
          break;
        case 'previsao':
          actualQuestion = 'Faça uma previsão para os próximos 7 dias.';
          break;
        case 'piorou':
          actualQuestion = 'O que piorou neste período em comparação com o anterior?';
          break;
        case 'melhorou':
          actualQuestion = 'O que melhorou neste período?';
          break;
        case 'melhores_piores':
          actualQuestion = 'Quais foram os melhores e piores dias do período?';
          break;
      }
    }
    
    if (!actualQuestion) {
      return new Response(
        JSON.stringify({ error: 'Pergunta não fornecida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Adjust prompt based on response mode (from request) or fallback to user style
    let styleInstructions = '';
    const effectiveMode = response_mode || profile.ai_response_mode || 'executivo';
    
    switch (effectiveMode) {
      case 'tecnico':
        styleInstructions = '\n\nEstilo: Técnico. Explique os cálculos, variações percentuais, metodologia, possíveis vieses nos dados, e inclua análise estatística detalhada. Seja preciso e fundamentado.';
        break;
      case 'operacional':
        styleInstructions = '\n\nEstilo: Operacional. Foque no diagnóstico de problemas, hipóteses de causas, etapas do funil com gargalos, e próximos passos de investigação. Seja prático e acionável.';
        break;
      case 'executivo':
      default:
        styleInstructions = '\n\nEstilo: Executivo. Seja conciso (máximo 3-4 parágrafos), foque em insights de alto nível e 3-5 ações estratégicas. Evite detalhes técnicos.';
        break;
    }
    
    // =====================================================
    // TENANT API KEY RESOLUTION
    // =====================================================
    let tenantApiKey: string | null = null;
    let tenantModel: string = 'gpt-4.1-mini';
    let useTenantKey = false;
    let tenantRpmLimit = 60;
    let tenantDailyTokenLimit: number | null = null;
    let tenantMonthlyBudget: number | null = null;
    
    // Try to get tenant's OpenAI settings
    const { data: tenantAiSettings } = await supabase
      .from('tenant_ai_settings')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('provider', 'openai')
      .eq('enabled', true)
      .single();
    
    if (tenantAiSettings?.api_key_encrypted) {
      try {
        tenantApiKey = await decrypt(tenantAiSettings.api_key_encrypted);
        tenantModel = tenantAiSettings.default_model || 'gpt-4.1-mini';
        tenantRpmLimit = tenantAiSettings.max_requests_per_minute || 60;
        tenantDailyTokenLimit = tenantAiSettings.max_tokens_per_day;
        tenantMonthlyBudget = tenantAiSettings.max_spend_month_usd;
        useTenantKey = true;
        console.log(`Using tenant OpenAI key for tenant: ${profile.tenant_id}`);
      } catch (e) {
        console.error('Failed to decrypt tenant API key:', e);
      }
    }
    
    // Check tenant-level rate limits and usage (only if using tenant key)
    if (useTenantKey) {
      // Check daily token limit
      if (tenantDailyTokenLimit) {
        const todayStart = new Date().toISOString().split('T')[0];
        const { data: todayUsage } = await supabase
          .from('ai_usage_logs')
          .select('total_tokens')
          .eq('tenant_id', profile.tenant_id)
          .gte('created_at', todayStart);
        
        const todayTokens = todayUsage?.reduce((acc, r) => acc + (r.total_tokens || 0), 0) || 0;
        if (todayTokens >= tenantDailyTokenLimit) {
          return new Response(
            JSON.stringify({ error: 'Limite diário de tokens do tenant atingido. Tente novamente amanhã.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      // Check monthly budget
      if (tenantMonthlyBudget) {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        const { data: monthUsage } = await supabase
          .from('ai_usage_logs')
          .select('cost_estimated')
          .eq('tenant_id', profile.tenant_id)
          .gte('created_at', monthStart);
        
        const monthCost = monthUsage?.reduce((acc, r) => acc + Number(r.cost_estimated || 0), 0) || 0;
        if (monthCost >= tenantMonthlyBudget) {
          return new Response(
            JSON.stringify({ error: 'Orçamento mensal de IA do tenant atingido. Contate o administrador.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      // Simple RPM check (last minute)
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const { count: recentRequests } = await supabase
        .from('ai_usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', profile.tenant_id)
        .gte('created_at', oneMinuteAgo);
      
      if ((recentRequests || 0) >= tenantRpmLimit) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições por minuto atingido. Aguarde alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    const startTime = Date.now();
    let aiResponse: Response;
    let modelUsed: string;
    let providerUsed: string;
    
    // =====================================================
    // CALL AI (TENANT KEY OR FALLBACK TO LOVABLE AI)
    // =====================================================
    if (useTenantKey && tenantApiKey) {
      // Use OpenAI directly with tenant's key
      providerUsed = 'openai';
      modelUsed = tenantModel;
      
      // Map model names for OpenAI API
      const openAIModel = tenantModel.startsWith('gpt-') ? tenantModel : 'gpt-4.1-mini';
      
      // Determine if model needs max_completion_tokens vs max_tokens
      const isNewerModel = openAIModel.includes('gpt-5') || openAIModel.includes('gpt-4.1') || openAIModel.includes('o3') || openAIModel.includes('o4');
      
      const requestBody: any = {
        model: openAIModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_BASE + styleInstructions },
          { 
            role: 'user', 
            content: `CONTEXT PACK (dados do dashboard):\n${JSON.stringify(contextPack, null, 2)}\n\nPERGUNTA DO USUÁRIO:\n${actualQuestion}` 
          }
        ],
      };
      
      // Add appropriate token limit parameter based on model
      if (isNewerModel) {
        requestBody.max_completion_tokens = 2000;
        // Note: temperature not supported for GPT-5+ and O3/O4 models
      } else {
        requestBody.max_tokens = 2000;
        requestBody.temperature = 0.7;
      }
      
      console.log(`Calling OpenAI with tenant key, model: ${openAIModel}`);
      
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tenantApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
    } else {
      // Fallback to Lovable AI Gateway
      providerUsed = 'lovable_ai';
      modelUsed = 'google/gemini-2.5-flash';
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        // No tenant key AND no Lovable key - AI not available
        return new Response(
          JSON.stringify({ error: 'IA não configurada. Contate o administrador para configurar a API Key do tenant.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Using Lovable AI Gateway (fallback)');
      
      aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_BASE + styleInstructions },
            { 
              role: 'user', 
              content: `CONTEXT PACK (dados do dashboard):\n${JSON.stringify(contextPack, null, 2)}\n\nPERGUNTA DO USUÁRIO:\n${actualQuestion}` 
            }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });
    }
    
    const latencyMs = Date.now() - startTime;
    
    // Handle response errors
    if (!aiResponse.ok) {
      let errorMessage = 'Erro ao processar com IA';
      let errorCode = String(aiResponse.status);
      
      if (aiResponse.status === 429) {
        errorMessage = 'Limite de requisições excedido. Tente novamente em alguns minutos.';
      } else if (aiResponse.status === 402) {
        errorMessage = 'Créditos de AI esgotados. Contate o administrador.';
      } else if (aiResponse.status === 401) {
        errorMessage = 'API Key inválida ou expirada. Contate o administrador.';
        errorCode = 'invalid_key';
      }
      
      const errorText = await aiResponse.text().catch(() => '');
      console.error('AI error:', aiResponse.status, errorText);
      
      // Log failed request
      await supabase.from('ai_usage_logs').insert({
        tenant_id: profile.tenant_id,
        user_id: userId,
        dashboard_id,
        request_type: quick_action || 'chat',
        model: modelUsed,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        latency_ms: latencyMs,
        status: 'error',
        error_code: errorCode,
        error_message: errorMessage,
      });
      
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: aiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const aiData = await aiResponse.json();
    const answerText = aiData.choices?.[0]?.message?.content || 'Não foi possível gerar resposta.';
    const promptTokens = aiData.usage?.prompt_tokens || 0;
    const completionTokens = aiData.usage?.completion_tokens || 0;
    const tokensUsed = aiData.usage?.total_tokens || 0;
    
    // Estimate cost (rough OpenAI pricing)
    let costEstimated = 0;
    if (providerUsed === 'openai') {
      // Approximate costs per 1M tokens (input/output)
      const pricing: Record<string, { input: number; output: number }> = {
        'gpt-4.1-mini': { input: 0.15, output: 0.60 },
        'gpt-4.1': { input: 2.00, output: 8.00 },
        'gpt-4o-mini': { input: 0.15, output: 0.60 },
        'gpt-4o': { input: 2.50, output: 10.00 },
        'gpt-5-nano': { input: 0.10, output: 0.40 },
        'gpt-5-mini': { input: 0.40, output: 1.60 },
        'gpt-5': { input: 3.00, output: 15.00 },
      };
      const modelPricing = pricing[modelUsed] || pricing['gpt-4.1-mini'];
      costEstimated = (promptTokens / 1000000 * modelPricing.input) + (completionTokens / 1000000 * modelPricing.output);
    }
    
    // Log successful request to ai_usage_logs
    await supabase.from('ai_usage_logs').insert({
      tenant_id: profile.tenant_id,
      user_id: userId,
      dashboard_id,
      request_type: quick_action || 'chat',
      model: modelUsed,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: tokensUsed,
      cost_estimated: costEstimated,
      latency_ms: latencyMs,
      status: 'success',
    });
    
    // Update or create usage record
    if (usageData) {
      await supabase
        .from('ai_usage_daily')
        .update({
          requests: usageData.requests + 1,
          tokens_in: (usageData.tokens_in || 0) + (aiData.usage?.prompt_tokens || 0),
          tokens_out: (usageData.tokens_out || 0) + (aiData.usage?.completion_tokens || 0),
        })
        .eq('id', usageData.id);
    } else {
      await supabase
        .from('ai_usage_daily')
        .insert({
          tenant_id: profile.tenant_id,
          user_id: userId,
          date: today,
          requests: 1,
          tokens_in: aiData.usage?.prompt_tokens || 0,
          tokens_out: aiData.usage?.completion_tokens || 0,
        });
    }
    
    // Create or update conversation
    let convId = conversation_id;
    if (!convId) {
      const { data: newConv } = await supabase
        .from('ai_conversations')
        .insert({
          tenant_id: profile.tenant_id,
          user_id: userId,
          dashboard_id,
          start_date: start,
          end_date: end,
          title: actualQuestion.slice(0, 100),
        })
        .select()
        .single();
      convId = newConv?.id;
    }
    
    // Save messages
    if (convId) {
      await supabase.from('ai_messages').insert([
        {
          conversation_id: convId,
          role: 'user',
          content: actualQuestion,
        },
        {
          conversation_id: convId,
          role: 'assistant',
          content: answerText,
          meta: {
            tokens: tokensUsed,
            model: modelUsed,
            provider: providerUsed,
            cost_estimated: costEstimated,
            latency_ms: latencyMs,
            context_pack_rows: contextPack.meta.rows_count,
          },
        },
      ]);
    }
    
    return new Response(
      JSON.stringify({
        answer_text: answerText,
        conversation_id: convId,
        highlights: contextPack.kpis,
        alerts: contextPack.alerts,
        forecast: contextPack.forecast,
        limitations: contextPack.limitations,
        meta: {
          tokens_used: tokensUsed,
          rows_analyzed: contextPack.meta.rows_count,
          period: contextPack.meta.period,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('AI Analyst error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
