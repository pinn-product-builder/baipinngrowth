import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DashboardData {
  currentData: Record<string, any>[];
  previousData: Record<string, any>[];
  dashboardId: string;
}

interface Insight {
  type: 'positive' | 'negative' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentData, previousData, dashboardId } = await req.json() as DashboardData;

    if (!currentData || currentData.length === 0) {
      return new Response(
        JSON.stringify({ insights: [], message: "Sem dados para análise" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aggregate current period
    const current = aggregateData(currentData);
    const prev = aggregateData(previousData || []);

    // Build context for AI
    const context = buildContext(current, prev);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fallback to local analysis
      const localInsights = generateLocalInsights(current, prev);
      return new Response(
        JSON.stringify({ insights: localInsights }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call AI for insights
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um analista de marketing digital especializado em funis de vendas e métricas de performance. 
Analise os dados fornecidos e gere insights acionáveis em português brasileiro.

Responda APENAS com um JSON válido no formato:
{
  "insights": [
    {
      "type": "positive" | "negative" | "warning" | "info",
      "title": "Título curto e direto",
      "description": "Descrição detalhada do insight",
      "recommendation": "Ação recomendada (opcional)"
    }
  ]
}

Foque em:
1. Variações significativas (>10%) em CPL, CAC, taxas de conversão
2. Anomalias e padrões incomuns
3. Oportunidades de otimização
4. Alertas de performance

Limite: máximo 5 insights, ordenados por relevância.`
          },
          {
            role: "user",
            content: context
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    // Parse AI response
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      
      const parsed = JSON.parse(jsonStr);
      return new Response(
        JSON.stringify({ insights: parsed.insights || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (parseErr) {
      console.error("Failed to parse AI response:", parseErr, content);
      // Fallback to local insights
      const localInsights = generateLocalInsights(current, prev);
      return new Response(
        JSON.stringify({ insights: localInsights }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    console.error("Error generating insights:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar insights";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function aggregateData(data: Record<string, any>[]): Record<string, number> {
  if (!data || data.length === 0) return {};

  const sums: Record<string, number> = {};
  data.forEach(row => {
    Object.keys(row).forEach(key => {
      if (typeof row[key] === 'number') {
        sums[key] = (sums[key] || 0) + row[key];
      }
    });
  });

  // Calculate derived metrics
  if (sums.custo_total && sums.leads_total) {
    sums.cpl = sums.custo_total / sums.leads_total;
  }
  if (sums.custo_total && sums.venda_total) {
    sums.cac = sums.custo_total / sums.venda_total;
  }
  if (sums.leads_total && sums.entrada_total) {
    sums.taxa_entrada = sums.entrada_total / sums.leads_total;
  }
  if (sums.leads_total && sums.venda_total) {
    sums.taxa_conversao = sums.venda_total / sums.leads_total;
  }
  if (sums.reuniao_agendada_total && sums.reuniao_realizada_total) {
    sums.taxa_comparecimento = sums.reuniao_realizada_total / sums.reuniao_agendada_total;
  }
  if (sums.reuniao_agendada_total && sums.falta_total) {
    sums.taxa_no_show = sums.falta_total / sums.reuniao_agendada_total;
  }

  return sums;
}

function buildContext(current: Record<string, number>, prev: Record<string, number>): string {
  const formatCurrency = (v: number) => `R$ ${(v || 0).toFixed(2)}`;
  const formatPercent = (v: number) => `${((v || 0) * 100).toFixed(1)}%`;
  const formatInt = (v: number) => (v || 0).toLocaleString('pt-BR');

  let context = "PERÍODO ATUAL:\n";
  if (current.custo_total !== undefined) context += `- Investimento: ${formatCurrency(current.custo_total)}\n`;
  if (current.leads_total !== undefined) context += `- Leads: ${formatInt(current.leads_total)}\n`;
  if (current.entrada_total !== undefined) context += `- Entradas: ${formatInt(current.entrada_total)}\n`;
  if (current.reuniao_agendada_total !== undefined) context += `- Reuniões Agendadas: ${formatInt(current.reuniao_agendada_total)}\n`;
  if (current.reuniao_realizada_total !== undefined) context += `- Reuniões Realizadas: ${formatInt(current.reuniao_realizada_total)}\n`;
  if (current.venda_total !== undefined) context += `- Vendas: ${formatInt(current.venda_total)}\n`;
  if (current.falta_total !== undefined) context += `- Faltas: ${formatInt(current.falta_total)}\n`;
  if (current.cpl !== undefined) context += `- CPL: ${formatCurrency(current.cpl)}\n`;
  if (current.cac !== undefined) context += `- CAC: ${formatCurrency(current.cac)}\n`;
  if (current.taxa_entrada !== undefined) context += `- Taxa de Entrada: ${formatPercent(current.taxa_entrada)}\n`;
  if (current.taxa_conversao !== undefined) context += `- Taxa de Conversão: ${formatPercent(current.taxa_conversao)}\n`;
  if (current.taxa_comparecimento !== undefined) context += `- Taxa de Comparecimento: ${formatPercent(current.taxa_comparecimento)}\n`;

  if (Object.keys(prev).length > 0) {
    context += "\nPERÍODO ANTERIOR:\n";
    if (prev.custo_total !== undefined) context += `- Investimento: ${formatCurrency(prev.custo_total)}\n`;
    if (prev.leads_total !== undefined) context += `- Leads: ${formatInt(prev.leads_total)}\n`;
    if (prev.entrada_total !== undefined) context += `- Entradas: ${formatInt(prev.entrada_total)}\n`;
    if (prev.reuniao_agendada_total !== undefined) context += `- Reuniões Agendadas: ${formatInt(prev.reuniao_agendada_total)}\n`;
    if (prev.reuniao_realizada_total !== undefined) context += `- Reuniões Realizadas: ${formatInt(prev.reuniao_realizada_total)}\n`;
    if (prev.venda_total !== undefined) context += `- Vendas: ${formatInt(prev.venda_total)}\n`;
    if (prev.cpl !== undefined) context += `- CPL: ${formatCurrency(prev.cpl)}\n`;
    if (prev.cac !== undefined) context += `- CAC: ${formatCurrency(prev.cac)}\n`;
    if (prev.taxa_entrada !== undefined) context += `- Taxa de Entrada: ${formatPercent(prev.taxa_entrada)}\n`;
    if (prev.taxa_conversao !== undefined) context += `- Taxa de Conversão: ${formatPercent(prev.taxa_conversao)}\n`;
  }

  return context;
}

function generateLocalInsights(current: Record<string, number>, prev: Record<string, number>): Insight[] {
  const insights: Insight[] = [];

  // CPL analysis
  if (prev.cpl && current.cpl) {
    const change = ((current.cpl - prev.cpl) / prev.cpl) * 100;
    if (Math.abs(change) > 10) {
      insights.push({
        type: change > 0 ? 'negative' : 'positive',
        title: `CPL ${change > 0 ? 'aumentou' : 'reduziu'} ${Math.abs(change).toFixed(1)}%`,
        description: `O custo por lead foi de R$ ${prev.cpl.toFixed(2)} para R$ ${current.cpl.toFixed(2)}.`,
        recommendation: change > 0 ? 'Revisar segmentação e criativos dos anúncios.' : undefined
      });
    }
  }

  // CAC analysis
  if (prev.cac && current.cac) {
    const change = ((current.cac - prev.cac) / prev.cac) * 100;
    if (Math.abs(change) > 15) {
      insights.push({
        type: change > 0 ? 'warning' : 'positive',
        title: `CAC ${change > 0 ? 'subiu' : 'caiu'} ${Math.abs(change).toFixed(1)}%`,
        description: `O custo de aquisição foi de R$ ${prev.cac.toFixed(2)} para R$ ${current.cac.toFixed(2)}.`,
        recommendation: change > 0 ? 'Analisar taxas de conversão do funil.' : undefined
      });
    }
  }

  // No-show rate
  if (current.taxa_no_show && current.taxa_no_show > 0.2) {
    insights.push({
      type: 'warning',
      title: `Taxa de faltas alta: ${(current.taxa_no_show * 100).toFixed(1)}%`,
      description: 'Muitos leads não comparecem às reuniões agendadas.',
      recommendation: 'Implementar lembretes automáticos por WhatsApp/SMS.'
    });
  }

  // Conversion rate
  if (prev.taxa_conversao && current.taxa_conversao) {
    const change = ((current.taxa_conversao - prev.taxa_conversao) / prev.taxa_conversao) * 100;
    if (Math.abs(change) > 10) {
      insights.push({
        type: change > 0 ? 'positive' : 'negative',
        title: `Conversão ${change > 0 ? 'melhorou' : 'piorou'} ${Math.abs(change).toFixed(1)}%`,
        description: `Taxa de conversão de leads para vendas ${change > 0 ? 'aumentou' : 'diminuiu'}.`,
        recommendation: change < 0 ? 'Revisar qualidade dos leads e script de vendas.' : undefined
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      type: 'info',
      title: 'Métricas estáveis',
      description: 'Não foram detectadas variações significativas no período analisado.'
    });
  }

  return insights;
}
