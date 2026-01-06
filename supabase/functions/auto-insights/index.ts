import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// System prompt for daily summary
const SYSTEM_PROMPT = `Você é o BAI AI Analyst gerando um resumo automático diário.
Seja conciso e objetivo. Máximo 4 parágrafos.

FORMATO:
1) Resumo (2 linhas)
2) Números principais (3-5 bullet points)
3) Alerta principal (se houver)
4) Ação recomendada (1 linha)

Use português do Brasil, profissional, sem emojis.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This function is meant to be called by a cron job or scheduler
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get all active dashboards that need auto-insights
    const { data: dashboards, error: dashError } = await supabase
      .from('dashboards')
      .select('id, name, tenant_id, view_name, data_source:tenant_data_sources(*)')
      .eq('is_active', true)
      .eq('source_kind', 'supabase_view');
    
    if (dashError) {
      throw new Error(`Failed to fetch dashboards: ${dashError.message}`);
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);
    
    const startDate = last30Days.toISOString().split('T')[0];
    const endDate = yesterday.toISOString().split('T')[0];
    const insightDate = yesterday.toISOString().split('T')[0];
    
    const results: any[] = [];
    
    for (const dashboard of dashboards || []) {
      try {
        // Check if insight already exists for today
        const { data: existingInsight } = await supabase
          .from('ai_auto_insights')
          .select('id')
          .eq('dashboard_id', dashboard.id)
          .eq('date', insightDate)
          .single();
        
        if (existingInsight) {
          results.push({ dashboard_id: dashboard.id, status: 'skipped', reason: 'already_exists' });
          continue;
        }
        
        // Fetch data from the dashboard's data source
        let rows: any[] = [];
        
        if (dashboard.data_source && !Array.isArray(dashboard.data_source)) {
          const ds = dashboard.data_source as any;
          const externalClient = createClient(
            ds.project_url || '',
            ds.service_role_key_encrypted || ds.anon_key_encrypted || '',
            { auth: { persistSession: false } }
          );
          
          if (dashboard.view_name) {
            const { data: viewData } = await externalClient
              .from(dashboard.view_name)
              .select('*')
              .gte('dia', startDate)
              .lte('dia', endDate)
              .order('dia', { ascending: true });
            
            rows = viewData || [];
          }
        }
        
        if (rows.length < 7) {
          results.push({ dashboard_id: dashboard.id, status: 'skipped', reason: 'insufficient_data' });
          continue;
        }
        
        // Calculate KPIs
        const sum = (key: string) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
        const avg = (key: string) => {
          const vals = rows.map(r => Number(r[key])).filter(v => !isNaN(v) && isFinite(v));
          return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };
        
        const kpis = {
          custo_total: sum('custo_total'),
          leads_total: sum('leads_total'),
          venda_total: sum('venda_total'),
          cpl_avg: avg('cpl'),
          cac_avg: avg('cac'),
        };
        
        // Simple alert detection
        const alerts: any[] = [];
        const halfIdx = Math.floor(rows.length / 2);
        const firstHalf = rows.slice(0, halfIdx);
        const secondHalf = rows.slice(halfIdx);
        
        const firstCost = firstHalf.reduce((a, r) => a + (Number(r.custo_total) || 0), 0);
        const secondCost = secondHalf.reduce((a, r) => a + (Number(r.custo_total) || 0), 0);
        
        if (secondCost > firstCost * 1.2) {
          alerts.push({ type: 'cost_increase', severity: 'medium', message: 'Custo aumentou significativamente' });
        }
        
        // Generate AI summary
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        let summary = `Resumo automático do dashboard ${dashboard.name}:\n\n`;
        summary += `Período: ${startDate} a ${endDate}\n`;
        summary += `• Custo total: R$ ${kpis.custo_total.toFixed(2)}\n`;
        summary += `• Leads: ${kpis.leads_total}\n`;
        summary += `• Vendas: ${kpis.venda_total}\n`;
        
        if (LOVABLE_API_KEY) {
          try {
            const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                  { role: 'system', content: SYSTEM_PROMPT },
                  { 
                    role: 'user', 
                    content: `Dashboard: ${dashboard.name}\nPeríodo: ${startDate} a ${endDate}\nKPIs: ${JSON.stringify(kpis)}\nAlertas: ${JSON.stringify(alerts)}\nTotal de dias: ${rows.length}` 
                  }
                ],
                max_tokens: 500,
              }),
            });
            
            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              summary = aiData.choices?.[0]?.message?.content || summary;
            }
          } catch (aiErr) {
            console.error('AI call failed, using fallback summary:', aiErr);
          }
        }
        
        // Save insight
        const { error: insertError } = await supabase
          .from('ai_auto_insights')
          .insert({
            tenant_id: dashboard.tenant_id,
            dashboard_id: dashboard.id,
            date: insightDate,
            summary,
            highlights: kpis,
            alerts,
            meta: { rows_count: rows.length, generated_at: new Date().toISOString() },
          });
        
        if (insertError) {
          results.push({ dashboard_id: dashboard.id, status: 'error', error: insertError.message });
        } else {
          results.push({ dashboard_id: dashboard.id, status: 'success' });
        }
        
      } catch (dashErr) {
        console.error(`Error processing dashboard ${dashboard.id}:`, dashErr);
        results.push({ dashboard_id: dashboard.id, status: 'error', error: String(dashErr) });
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Auto-insights error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
