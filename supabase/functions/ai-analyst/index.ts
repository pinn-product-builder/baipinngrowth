import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const { dashboard_id, start, end, question, conversation_id, quick_action } = await req.json();
    
    if (!dashboard_id || !start || !end) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: dashboard_id, start, end' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get auth token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get user profile with AI settings
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id, ai_enabled, ai_daily_limit_messages, ai_daily_limit_tokens, ai_style')
      .eq('id', user.id)
      .single();
    
    if (profileError || !profile) {
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
      .eq('user_id', user.id)
      .eq('date', today)
      .single();
    
    if (usageData && usageData.requests >= profile.ai_daily_limit_messages) {
      return new Response(
        JSON.stringify({ error: `Limite diário atingido (${profile.ai_daily_limit_messages} mensagens/dia)` }),
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
        .eq('user_id', user.id)
        .single();
      
      if (roleData?.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Acesso negado a este dashboard' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Fetch dashboard data (same logic as dashboard-data function)
    let rows: any[] = [];
    
    if (dashboard.data_source) {
      const ds = dashboard.data_source;
      
      // Decrypt keys if needed
      let serviceKey = ds.service_role_key_encrypted;
      const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY');
      
      if (serviceKey && masterKey) {
        try {
          // Simple XOR decryption for demo - in production use proper encryption
          const decoded = atob(serviceKey);
          serviceKey = decoded; // Simplified - implement proper decryption
        } catch {
          // Use as-is if decryption fails
        }
      }
      
      // Create client for external Supabase
      const externalClient = createClient(
        ds.project_url,
        serviceKey || ds.anon_key_encrypted || '',
        { auth: { persistSession: false } }
      );
      
      // Query the view
      const viewName = dashboard.view_name;
      if (viewName) {
        const { data: viewData, error: viewError } = await externalClient
          .from(viewName)
          .select('*')
          .gte('dia', start)
          .lte('dia', end)
          .order('dia', { ascending: true });
        
        if (!viewError && viewData) {
          rows = viewData;
        }
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
    
    // Adjust prompt based on user style
    let styleInstructions = '';
    if (profile.ai_style === 'analista') {
      styleInstructions = '\n\nEstilo: Analista técnico. Inclua mais detalhes numéricos, variações percentuais e análise estatística.';
    } else {
      styleInstructions = '\n\nEstilo: Executivo. Seja conciso, foque em insights acionáveis e próximos passos.';
    }
    
    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
    
    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos de AI esgotados. Contate o administrador.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Erro ao processar com IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const aiData = await aiResponse.json();
    const answerText = aiData.choices?.[0]?.message?.content || 'Não foi possível gerar resposta.';
    const tokensUsed = aiData.usage?.total_tokens || 0;
    
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
          user_id: user.id,
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
          user_id: user.id,
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
            model: 'google/gemini-2.5-flash',
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
