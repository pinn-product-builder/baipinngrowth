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
// COLUMN METADATA TYPE
// =====================================================

interface ColumnMeta {
  name: string;
  db_type: string;
  semantic_type: string | null;
  role_hint: string | null;
  display_label: string;
  aggregator_default: string;
  format: string | null;
}

interface DatasetProfile {
  columns: {
    name: string;
    db_type: string;
    semantic_type: string | null;
    display_label: string;
    role_hint: string | null;
    stats: {
      null_rate: number;
      distinct_count: number;
      date_parseable_rate?: number;
      boolean_rate?: number;
    };
  }[];
  sample_rows: any[];
  basic_stats: {
    total_rows: number;
    has_time_column: boolean;
    has_funnel: boolean;
    funnel_step_count: number;
  };
  detected_candidates: {
    time_columns: { name: string; confidence: number; parseable_rate: number }[];
    funnel_stages: { name: string; label: string; order: number }[];
    metric_columns: string[];
    currency_columns: string[];
    percent_columns: string[];
    dimension_columns: string[];
  };
}

// =====================================================
// SPEC VALIDATION
// =====================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixedSpec?: any;
}

function validateAndFixSpec(spec: any, columns: ColumnMeta[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validColumns = columns.filter(c => c && c.name);
  
  const columnNames = new Set(validColumns.map(c => c.name));
  const columnNamesLower = new Set(validColumns.map(c => c.name.toLowerCase()));
  
  // Create mappings for column name resolution
  const labelToName = new Map<string, string>();
  const lowerToName = new Map<string, string>();
  validColumns.forEach(c => {
    lowerToName.set(c.name.toLowerCase(), c.name);
    if (c.display_label) {
      labelToName.set(c.display_label.toLowerCase(), c.name);
      labelToName.set(c.display_label.toLowerCase().replace(/_/g, ' '), c.name);
    }
  });
  
  const resolveColumnName = (aiColumn: string | undefined): string | null => {
    if (!aiColumn) return null;
    if (columnNames.has(aiColumn)) return aiColumn;
    const lower = aiColumn.toLowerCase();
    if (lowerToName.has(lower)) return lowerToName.get(lower)!;
    if (labelToName.has(lower)) return labelToName.get(lower)!;
    const withUnderscores = lower.replace(/\s+/g, '_');
    if (lowerToName.has(withUnderscores)) return lowerToName.get(withUnderscores)!;
    return null;
  };
  
  const numericColumns = new Set(
    validColumns
      .filter(c => ['currency', 'count', 'metric', 'percent'].includes(c.semantic_type || ''))
      .map(c => c.name)
  );
  
  const timeColumns = validColumns.filter(c => c.semantic_type === 'time').map(c => c.name);
  const timeByName = validColumns.filter(c => 
    c.name && (
      c.name.includes('created') || c.name.includes('date') || 
      c.name.includes('dia') || c.name.includes('data') ||
      c.name.includes('time') || c.name.includes('timestamp')
    )
  ).map(c => c.name);
  
  const allTimeColumns = [...new Set([...timeColumns, ...timeByName])];
  
  const funnelColumnNames = new Set([
    'entrada', 'lead_ativo', 'qualificado', 'exp_agendada', 'exp_realizada',
    'exp_nao_confirmada', 'faltou_exp', 'reagendou', 'venda', 'perdida', 'aluno_ativo'
  ]);

  const fixed = JSON.parse(JSON.stringify(spec));

  // Validate version
  if (typeof fixed.version !== 'number') {
    fixed.version = 1;
    warnings.push('Adicionada versão 1 ao spec');
  }

  // Validate and fix time column
  if (fixed.time?.column) {
    const resolvedTime = resolveColumnName(fixed.time.column);
    if (resolvedTime) {
      fixed.time.column = resolvedTime;
    } else if (allTimeColumns.length > 0) {
      fixed.time.column = allTimeColumns[0];
      fixed.time.type = 'date';
      warnings.push(`Coluna de tempo corrigida para ${allTimeColumns[0]}`);
    } else {
      delete fixed.time;
      warnings.push('Sem coluna de tempo detectada');
    }
  } else if (allTimeColumns.length > 0) {
    fixed.time = { column: allTimeColumns[0], type: 'date' };
    warnings.push(`Coluna de tempo definida para ${allTimeColumns[0]}`);
  }

  // Validate and fix KPIs
  if (Array.isArray(fixed.kpis)) {
    fixed.kpis = fixed.kpis.map((kpi: any) => {
      const resolved = resolveColumnName(kpi.column);
      if (resolved) kpi.column = resolved;
      return kpi;
    }).filter((kpi: any) => {
      const resolved = resolveColumnName(kpi.column);
      if (!resolved) {
        warnings.push(`KPI removido: coluna ${kpi.column || 'indefinida'} não existe`);
        return false;
      }
      
      const isFunnelColumn = funnelColumnNames.has(resolved.toLowerCase());
      if (!numericColumns.has(resolved) && !isFunnelColumn && kpi.agg !== 'count') {
        kpi.agg = 'count';
      }
      
      if (!kpi.label || typeof kpi.label !== 'string') {
        kpi.label = validColumns.find(c => c.name === resolved)?.display_label || resolved;
      }
      
      return true;
    });
  }

  // Validate funnel
  if (fixed.funnel?.steps && Array.isArray(fixed.funnel.steps)) {
    fixed.funnel.steps = fixed.funnel.steps.map((step: any) => {
      const resolved = resolveColumnName(step.column);
      if (resolved) step.column = resolved;
      return step;
    }).filter((step: any) => {
      const resolved = resolveColumnName(step.column);
      if (!resolved) {
        warnings.push(`Etapa de funil removida: coluna ${step.column || 'indefinida'} não existe`);
        return false;
      }
      step.column = resolved;
      
      if (!step.label || typeof step.label !== 'string') {
        step.label = validColumns.find(c => c.name === resolved)?.display_label || resolved;
      }
      return true;
    });

    if (fixed.funnel.steps.length < 2) {
      delete fixed.funnel;
      warnings.push('Funil removido: menos de 2 etapas válidas');
    }
  }

  // Validate charts
  if (Array.isArray(fixed.charts)) {
    fixed.charts = fixed.charts.filter((chart: any) => {
      const resolvedX = resolveColumnName(chart.x);
      if (!resolvedX && allTimeColumns.length > 0) {
        chart.x = allTimeColumns[0];
      } else if (!resolvedX) {
        warnings.push(`Chart ${chart.title} removido: sem eixo X válido`);
        return false;
      } else {
        chart.x = resolvedX;
      }

      if (Array.isArray(chart.series)) {
        chart.series = chart.series.filter((s: any) => {
          const resolvedY = resolveColumnName(s.y);
          if (!resolvedY) {
            warnings.push(`Série ${s.label || s.y} removida: coluna não existe`);
            return false;
          }
          s.y = resolvedY;
          if (!s.label) {
            s.label = validColumns.find(c => c.name === resolvedY)?.display_label || resolvedY;
          }
          return true;
        });
      }

      if (!chart.series || chart.series.length === 0) {
        warnings.push(`Chart ${chart.title} removido: sem séries válidas`);
        return false;
      }

      return true;
    });
  }

  // Validate columns
  if (Array.isArray(fixed.columns)) {
    fixed.columns = fixed.columns.filter((col: any) => {
      const resolved = resolveColumnName(col.name);
      if (!resolved) {
        warnings.push(`Coluna ${col.name} removida: não existe no dataset`);
        return false;
      }
      col.name = resolved;
      return true;
    });
  }

  // Ensure UI defaults
  if (!fixed.ui) fixed.ui = {};
  if (!fixed.ui.tabs) {
    fixed.ui.tabs = ['Decisões', 'Executivo', 'Detalhes'];
    if (fixed.funnel) fixed.ui.tabs.splice(2, 0, 'Funil');
    if (fixed.charts?.length > 0) fixed.ui.tabs.splice(-1, 0, 'Tendências');
  }
  if (!fixed.ui.defaultTab) fixed.ui.defaultTab = 'Decisões';
  if (fixed.ui.comparePeriods === undefined) fixed.ui.comparePeriods = true;

  // Ensure Detalhes tab always exists
  if (!fixed.ui.tabs.includes('Detalhes')) {
    fixed.ui.tabs.push('Detalhes');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixedSpec: fixed
  };
}

// =====================================================
// NORMALIZE COLUMN NAME
// =====================================================

function normalizeColName(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

// =====================================================
// FALLBACK HEURISTIC SPEC GENERATOR
// =====================================================

function generateFallbackSpec(
  columns: ColumnMeta[], 
  datasetName: string,
  profile?: DatasetProfile | null
): any {
  console.log('generateFallbackSpec: Starting with', columns.length, 'columns');
  
  const normalizedMap = new Map<string, ColumnMeta>();
  columns.forEach(c => {
    normalizedMap.set(normalizeColName(c.name), c);
    if (c.display_label) {
      normalizedMap.set(normalizeColName(c.display_label), c);
    }
  });
  
  // Use profile detected candidates if available
  let timeCol: ColumnMeta | undefined;
  if (profile?.detected_candidates?.time_columns?.length) {
    const bestTime = profile.detected_candidates.time_columns[0];
    timeCol = columns.find(c => c.name === bestTime.name);
  }
  
  if (!timeCol) {
    timeCol = columns.find(c => c.semantic_type === 'time');
  }
  if (!timeCol) {
    timeCol = columns.find(c => 
      c.name.includes('created') || c.name.includes('date') || 
      c.name.includes('dia') || c.name.includes('data')
    );
  }
  
  console.log('generateFallbackSpec: Time column:', timeCol?.name || 'NONE');
  
  const currencyCols = columns.filter(c => c.semantic_type === 'currency');
  const countCols = columns.filter(c => c.semantic_type === 'count');
  const percentCols = columns.filter(c => c.semantic_type === 'percent');

  // Get funnel stages from profile or detect by name
  let funnelSteps: ColumnMeta[] = [];
  
  if (profile?.detected_candidates?.funnel_stages?.length) {
    funnelSteps = profile.detected_candidates.funnel_stages
      .map(fs => columns.find(c => c.name === fs.name))
      .filter((c): c is ColumnMeta => c !== undefined);
  }
  
  if (funnelSteps.length < 2) {
    const funnelOrder = ['entrada', 'lead_ativo', 'qualificado', 'exp_agendada', 'exp_realizada', 'venda'];
    funnelSteps = funnelOrder
      .map(name => columns.find(c => normalizeColName(c.name).includes(name)))
      .filter((c): c is ColumnMeta => c !== undefined)
      .slice(0, 6);
  }
  
  console.log('generateFallbackSpec: Funnel steps:', funnelSteps.map(f => f.name).join(', '));

  const spec: any = {
    version: 1,
    title: datasetName,
    ui: {
      tabs: ['Decisões', 'Executivo', 'Detalhes'],
      defaultTab: 'Decisões',
      comparePeriods: true
    }
  };

  if (timeCol) {
    spec.time = { column: timeCol.name, type: 'date' };
  }

  spec.columns = columns.map(c => ({
    name: c.name,
    type: c.semantic_type === 'currency' ? 'currency' : 
          c.semantic_type === 'percent' ? 'percent' :
          c.semantic_type === 'time' ? 'date' :
          ['count', 'metric'].includes(c.semantic_type || '') ? 'number' : 'string',
    label: c.display_label || c.name
  }));

  // Build KPIs
  const kpiOrder = [
    'custo_total', 'spend', 'cpl', 'cac',
    'leads_total', 'leads_new', 'entrada_total', 'entrada',
    'qualificado', 'exp_agendada', 'exp_realizada',
    'venda_total', 'sales', 'venda', 'reuniao_realizada_total', 'meetings_completed'
  ];
  
  const orderedKpis = kpiOrder
    .map(name => columns.find(c => normalizeColName(c.name) === normalizeColName(name)))
    .filter((c): c is ColumnMeta => c !== undefined);

  const funnelKpis = funnelSteps.filter(c => !orderedKpis.includes(c));
  const remainingKpis = [...currencyCols, ...countCols]
    .filter(c => !orderedKpis.includes(c) && !funnelKpis.includes(c))
    .slice(0, 6 - orderedKpis.length);

  const kpiCandidates = [...orderedKpis, ...funnelKpis, ...remainingKpis].slice(0, 10);
  
  spec.kpis = kpiCandidates.map(c => ({
    label: c.display_label || c.name,
    column: c.name,
    agg: c.aggregator_default === 'avg' ? 'avg' : 'sum',
    format: c.semantic_type === 'currency' ? 'currency' : 
            c.semantic_type === 'percent' ? 'percent' : 'integer',
    goalDirection: ['cpl', 'cac', 'custo'].some(k => c.name.toLowerCase().includes(k)) 
      ? 'lower_better' : 'higher_better'
  }));

  // Add rate KPIs
  const rateKpis = percentCols.slice(0, 4).map(c => ({
    label: c.display_label || c.name,
    column: c.name,
    agg: 'avg',
    format: 'percent',
    goalDirection: 'higher_better'
  }));
  spec.kpis.push(...rateKpis);

  // Funnel
  if (funnelSteps.length >= 2) {
    spec.funnel = {
      steps: funnelSteps.map(c => ({
        label: c.display_label || c.name,
        column: c.name
      }))
    };
    spec.ui.tabs.splice(2, 0, 'Funil');
  }

  // Charts
  spec.charts = [];
  
  if (timeCol) {
    const costMetrics = currencyCols.filter(c => 
      c.name.includes('custo') || c.name === 'spend'
    ).slice(0, 1);
    const resultMetrics = [...countCols, ...funnelSteps].filter(c => 
      c.name.includes('leads') || c.name.includes('venda') || c.name.includes('sales') ||
      c.name.includes('entrada') || c.name.includes('qualificado')
    ).slice(0, 3);
    
    if (costMetrics.length > 0 || resultMetrics.length > 0) {
      spec.charts.push({
        type: 'line',
        title: 'Investimento e Resultados',
        x: timeCol.name,
        series: [...costMetrics, ...resultMetrics].map(c => ({
          label: c.display_label || c.name,
          y: c.name,
          format: c.semantic_type === 'currency' ? 'currency' : 'number'
        }))
      });
    }

    if (funnelSteps.length >= 2) {
      spec.charts.push({
        type: 'line',
        title: 'Evolução do Funil',
        x: timeCol.name,
        series: funnelSteps.slice(0, 4).map(c => ({
          label: c.display_label || c.name,
          y: c.name,
          format: 'number'
        }))
      });
    }

    if (percentCols.length > 0) {
      spec.charts.push({
        type: 'line',
        title: 'Taxas de Conversão',
        x: timeCol.name,
        series: percentCols.slice(0, 4).map(c => ({
          label: c.display_label || c.name,
          y: c.name,
          format: 'percent'
        }))
      });
    }
  }

  if (spec.charts.length > 0) {
    spec.ui.tabs.splice(-1, 0, 'Tendências');
  }
  
  // Ensure minimum KPIs
  if (spec.kpis.length === 0 && columns.length > 0) {
    spec.kpis = columns.slice(0, 4).map(c => ({
      label: c.display_label || c.name,
      column: c.name,
      agg: 'count',
      format: 'integer',
      goalDirection: 'higher_better'
    }));
  }

  console.log('generateFallbackSpec: Final - KPIs:', spec.kpis.length, 'Charts:', spec.charts.length);

  return spec;
}

// =====================================================
// AI SPEC GENERATION WITH USER PROMPT
// =====================================================

async function generateSpecWithAI(
  columns: ColumnMeta[], 
  datasetName: string, 
  profile: DatasetProfile | null,
  userPrompt?: string
): Promise<any> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!lovableApiKey) {
    console.log('LOVABLE_API_KEY not available, using fallback');
    return null;
  }

  const validColumnNames = columns.filter(c => c && c.name).map(c => c.name);
  const columnSummary = columns.filter(c => c && c.name).map(c => ({
    name: c.name,
    type: c.db_type,
    semantic: c.semantic_type,
    label: c.display_label,
    role: c.role_hint
  }));

  // Build detected info from profile
  let detectedInfo = '';
  if (profile) {
    const timeInfo = profile.detected_candidates?.time_columns?.[0];
    const funnelInfo = profile.detected_candidates?.funnel_stages || [];
    
    detectedInfo = `
Detecções automáticas:
- Linhas totais: ${profile.basic_stats?.total_rows || 'desconhecido'}
- Coluna de tempo: ${timeInfo?.name || 'não detectada'} (parseável: ${timeInfo?.parseable_rate ? Math.round(timeInfo.parseable_rate * 100) + '%' : 'N/A'})
- Etapas de funil detectadas: ${funnelInfo.map(f => f.name).join(', ') || 'nenhuma'}
- Colunas de métrica: ${profile.detected_candidates?.metric_columns?.join(', ') || 'nenhuma'}
- Colunas de moeda: ${profile.detected_candidates?.currency_columns?.join(', ') || 'nenhuma'}
- Colunas de taxa: ${profile.detected_candidates?.percent_columns?.join(', ') || 'nenhuma'}`;
  }

  const systemPrompt = `Você é um especialista em Business Intelligence que cria especificações de dashboards.

REGRAS CRÍTICAS - SIGA EXATAMENTE:
1. Use APENAS os nomes de colunas EXATOS fornecidos na lista abaixo
2. O campo "column" em KPIs DEVE ser o nome exato da coluna (ex: "entrada", NÃO "Entrada")
3. O campo "y" em series DEVE ser o nome exato da coluna
4. O campo "x" em charts DEVE ser o nome exato da coluna de tempo
5. Nomes são CASE-SENSITIVE - use exatamente como fornecidos
6. NUNCA invente nomes de colunas que não existam

Lista de nomes de colunas válidos:
${validColumnNames.join(', ')}

ESTRUTURA DO SPEC:
{
  "version": 1,
  "title": "Nome do Dashboard",
  "time": { "column": "NOME_EXATO", "type": "date" },
  "columns": [{ "name": "NOME_EXATO", "type": "currency|number|percent|date|string", "label": "Label" }],
  "kpis": [{ "label": "Label", "column": "NOME_EXATO", "agg": "sum|avg", "format": "currency|number|percent|integer", "goalDirection": "higher_better|lower_better" }],
  "funnel": { "steps": [{ "label": "Label", "column": "NOME_EXATO" }] },
  "charts": [{ "type": "line", "title": "Título", "x": "NOME_EXATO", "series": [{ "label": "Label", "y": "NOME_EXATO", "format": "number" }] }],
  "ui": { "tabs": ["Decisões", "Executivo", "Funil", "Tendências", "Detalhes"], "defaultTab": "Decisões", "comparePeriods": true }
}

IMPORTANTE:
- Sempre inclua a aba "Detalhes"
- Se não houver coluna de tempo válida, omita "time" e "charts"
- KPIs máximo 8
- Funil mínimo 2 etapas ou omita`;

  const basePrompt = userPrompt || `Gere um DashboardSpec otimizado para visualização de dados de CRM/tráfego pago.
Priorize KPIs acionáveis e funil de conversão se aplicável.`;

  const userMessage = `Dataset: "${datasetName}"

COLUNAS (use EXATAMENTE estes nomes):
${JSON.stringify(columnSummary, null, 2)}
${detectedInfo}

${basePrompt}

Retorne APENAS o JSON válido, sem markdown ou explicações.`;

  try {
    console.log('Calling Lovable AI for spec generation...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 4000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI API error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      console.error('Empty response from AI');
      return null;
    }

    // Extract JSON
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    jsonStr = jsonStr.trim().replace(/^```\w*\n?/, '').replace(/```$/, '');

    try {
      const parsed = JSON.parse(jsonStr);
      console.log('AI spec parsed successfully');
      return parsed;
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr);
      console.error('Raw content (first 500 chars):', jsonStr.slice(0, 500));
      return null;
    }
  } catch (err) {
    console.error('AI generation error:', err);
    return null;
  }
}

// =====================================================
// MAIN HANDLER
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager']);

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado. Requer role admin ou manager.');
    }

    const body = await req.json();
    const { dataset_id, use_ai = true, user_prompt, dataset_profile, dataset_mapping } = body;

    if (!dataset_id) {
      return errorResponse('VALIDATION_ERROR', 'dataset_id é obrigatório');
    }

    const { data: dataset, error: dsError } = await adminClient
      .from('datasets')
      .select('*')
      .eq('id', dataset_id)
      .single();

    if (dsError || !dataset) {
      return errorResponse('NOT_FOUND', 'Dataset não encontrado');
    }

    const { data: columnsData, error: colError } = await adminClient
      .from('dataset_columns')
      .select('*')
      .eq('dataset_id', dataset_id)
      .order('sort_priority');

    if (colError) {
      return errorResponse('DB_ERROR', 'Erro ao buscar colunas', colError.message);
    }

    const columns: ColumnMeta[] = (columnsData || []).filter(c => c && c.column_name).map(c => ({
      name: c.column_name,
      db_type: c.db_type,
      semantic_type: c.semantic_type,
      role_hint: c.role_hint,
      display_label: c.display_label || c.column_name,
      aggregator_default: c.aggregator_default || 'sum',
      format: c.format
    }));

    if (columns.length === 0) {
      return errorResponse('NO_COLUMNS', 'Dataset não possui colunas. Execute introspecção primeiro.');
    }

    console.log(`Generating spec for ${dataset.name} with ${columns.length} columns`);

    // Cast dataset_profile to proper type
    const profile = dataset_profile as DatasetProfile | null;
    
    // Apply manual mapping overrides to profile if provided
    interface DatasetMappingInput {
      time_column?: string | null;
      id_column?: string | null;
      dimension_columns?: string[];
      funnel_stages?: string[];
      truthy_rule?: 'default' | 'custom';
      custom_truthy_values?: string[];
    }
    
    const mapping = dataset_mapping as DatasetMappingInput | null;
    
    if (mapping && profile) {
      console.log('Applying manual mapping overrides:', mapping);
      
      // Override time column
      if (mapping.time_column) {
        profile.detected_candidates = profile.detected_candidates || {
          time_columns: [],
          funnel_stages: [],
          metric_columns: [],
          currency_columns: [],
          percent_columns: [],
          dimension_columns: []
        };
        profile.detected_candidates.time_columns = [
          { name: mapping.time_column, confidence: 1.0, parseable_rate: 1.0 }
        ];
      }
      
      // Override funnel stages
      if (mapping.funnel_stages && mapping.funnel_stages.length > 0) {
        profile.detected_candidates = profile.detected_candidates || {
          time_columns: [],
          funnel_stages: [],
          metric_columns: [],
          currency_columns: [],
          percent_columns: [],
          dimension_columns: []
        };
        profile.detected_candidates.funnel_stages = mapping.funnel_stages.map((name, idx) => ({
          name,
          label: name,
          order: idx
        }));
      }
      
      // Override dimension columns
      if (mapping.dimension_columns && mapping.dimension_columns.length > 0) {
        profile.detected_candidates = profile.detected_candidates || {
          time_columns: [],
          funnel_stages: [],
          metric_columns: [],
          currency_columns: [],
          percent_columns: [],
          dimension_columns: []
        };
        profile.detected_candidates.dimension_columns = mapping.dimension_columns;
      }
    }

    // Try AI generation
    let spec: any = null;
    let source = 'fallback';
    let aiError: string | null = null;

    if (use_ai) {
      try {
        spec = await generateSpecWithAI(columns, dataset.name, profile, user_prompt);
        if (spec) {
          source = 'ai';
          console.log('AI spec generated successfully');
        }
      } catch (err: any) {
        aiError = err.message;
        console.error('AI generation failed:', err);
      }
    }

    // Fallback to heuristic
    if (!spec) {
      spec = generateFallbackSpec(columns, dataset.name, profile);
      console.log('Using fallback spec generator');
    }

    // Validate and fix
    let validation = validateAndFixSpec(spec, columns);
    let finalSpec = validation.fixedSpec || spec;
    
    // Never allow empty spec
    const specIsEmpty = (
      (!finalSpec.kpis || finalSpec.kpis.length === 0) &&
      (!finalSpec.charts || finalSpec.charts.length === 0) &&
      (!finalSpec.funnel || !finalSpec.funnel.steps || finalSpec.funnel.steps.length === 0)
    );
    
    if (specIsEmpty && columns.length > 0) {
      console.log('CRITICAL: Empty spec, generating minimum fallback');
      
      const validColumns = columns.filter(c => c && c.name);
      const timeColumn = validColumns.find(c => 
        c.semantic_type === 'time' || 
        (c.name && (c.name.includes('created') || c.name.includes('data') || c.name.includes('dia')))
      );
      
      const minimumSpec: any = {
        version: 1,
        title: dataset.name,
        columns: validColumns.map(c => ({
          name: c.name,
          type: c.semantic_type === 'currency' ? 'currency' : 
                c.semantic_type === 'percent' ? 'percent' :
                c.semantic_type === 'time' ? 'date' :
                ['count', 'metric'].includes(c.semantic_type || '') ? 'number' : 'string',
          label: c.display_label || c.name
        })),
        kpis: validColumns
          .filter(c => ['count', 'currency', 'metric', 'percent'].includes(c.semantic_type || '') || 
                       c.role_hint === 'funnel_step')
          .slice(0, 8)
          .map(c => ({
            label: c.display_label || c.name,
            column: c.name,
            agg: c.semantic_type === 'percent' ? 'avg' : 'sum',
            format: c.semantic_type === 'currency' ? 'currency' : 
                    c.semantic_type === 'percent' ? 'percent' : 'integer',
            goalDirection: 'higher_better'
          })),
        ui: {
          tabs: ['Decisões', 'Executivo', 'Detalhes'],
          defaultTab: 'Decisões',
          comparePeriods: true
        }
      };
      
      if (timeColumn) {
        minimumSpec.time = { column: timeColumn.name, type: 'date' };
      }
      
      if (minimumSpec.kpis.length === 0) {
        minimumSpec.kpis = validColumns.slice(0, 4).map(c => ({
          label: c.display_label || c.name,
          column: c.name,
          agg: 'count',
          format: 'integer',
          goalDirection: 'higher_better'
        }));
      }
      
      console.log('Minimum spec created with', minimumSpec.kpis.length, 'KPIs');
      
      finalSpec = minimumSpec;
      validation = {
        valid: true,
        errors: [],
        warnings: ['Spec mínimo gerado automaticamente (fallback de emergência)'],
        fixedSpec: minimumSpec
      };
    }

    // Build debug info
    const debug = {
      dataset_name: dataset.name,
      dataset_id: dataset.id,
      column_count: columns.length,
      columns_detected: columns.map(c => ({ name: c.name, semantic: c.semantic_type, label: c.display_label })),
      time_column: profile?.detected_candidates?.time_columns?.[0]?.name || finalSpec.time?.column || null,
      time_parseable_rate: profile?.detected_candidates?.time_columns?.[0]?.parseable_rate,
      grain: dataset.grain_hint,
      funnel_candidates: profile?.detected_candidates?.funnel_stages?.map(f => f.name) || 
                         finalSpec.funnel?.steps?.map((s: any) => s.column) || [],
      ai_used: source === 'ai',
      ai_error: aiError,
      assumptions: [],
      final_kpis: finalSpec.kpis?.length || 0,
      final_charts: finalSpec.charts?.length || 0,
      final_funnel_steps: finalSpec.funnel?.steps?.length || 0
    };

    return successResponse({
      spec: finalSpec,
      source,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      },
      debug
    });

  } catch (error: any) {
    console.error('Error in generate-dashboard-spec:', error);
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message);
  }
});
