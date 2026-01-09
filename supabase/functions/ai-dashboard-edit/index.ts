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
  return jsonResponse({ 
    ok: false, 
    error: { code, message, details },
    trace_id: traceId
  }, code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : 400)
}

function successResponse(data: Record<string, any>) {
  return jsonResponse({ ok: true, ...data })
}

// =====================================================
// WIDGET CATALOG (supported widgets)
// =====================================================

const WIDGET_CATALOG = [
  'KpiCard',
  'LineChart',
  'BarChart',
  'AreaChart',
  'FunnelChart',
  'RankingTable',
  'DataTable',
  'InsightList',
  'StatusSummary',
  'PieChart'
]

// =====================================================
// ALLOWED/BLOCKED PATHS (Mode Travado)
// =====================================================

const ALLOWED_PATHS = [
  '/title',
  '/time',
  '/columns',
  '/kpis',
  '/funnel',
  '/charts',
  '/ui',
  '/filters',
  '/table',
  '/layout',
  '/labels',
  '/formatting',
  '/tabs',
  '/goals'
]

const BLOCKED_PATHS = [
  '/data_source_id',
  '/dataset_id',
  '/dataset_ref',
  '/tenant_id',
  '/credentials',
  '/secrets',
  '/api_keys',
  '/datasource'
]

// =====================================================
// DEFAULT GUARDRAILS
// =====================================================

const DEFAULT_GUARDRAILS = {
  max_kpis: 8,
  max_charts: 4,
  max_funnel_steps: 7,
  max_filters: 10,
  max_tabs: 6,
  allow_create_new_tabs: true,
  allow_remove_tabs: true,
  protected_tabs: ['Detalhes']  // Cannot remove these
}

// =====================================================
// RFC6902 PATCH VALIDATION
// =====================================================

interface RFC6902Operation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  path: string
  value?: any
  from?: string
}

function validatePatchPath(path: string): { valid: boolean; error?: string } {
  // Check if path is in blocked list
  for (const blocked of BLOCKED_PATHS) {
    if (path === blocked || path.startsWith(blocked + '/')) {
      return { valid: false, error: `PATCH_PATH_FORBIDDEN: Caminho ${path} não pode ser modificado` }
    }
  }
  
  // Check if path starts with allowed prefix
  const rootPath = '/' + path.split('/')[1]
  const isAllowed = ALLOWED_PATHS.some(allowed => 
    path === allowed || path.startsWith(allowed + '/') || path.startsWith(allowed + '/')
  )
  
  if (!isAllowed && path !== '' && path !== '/') {
    return { valid: false, error: `PATCH_PATH_NOT_ALLOWED: Caminho ${path} não está na allowlist` }
  }
  
  return { valid: true }
}

function validatePatch(
  patch: RFC6902Operation[], 
  currentSpec: any,
  guardrails: typeof DEFAULT_GUARDRAILS
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  
  for (const op of patch) {
    // Validate path
    const pathResult = validatePatchPath(op.path)
    if (!pathResult.valid) {
      errors.push(pathResult.error!)
      continue
    }
    
    // Validate 'from' path for move/copy
    if ((op.op === 'move' || op.op === 'copy') && op.from) {
      const fromResult = validatePatchPath(op.from)
      if (!fromResult.valid) {
        errors.push(fromResult.error!)
      }
    }
    
    // Check guardrails for add operations
    if (op.op === 'add') {
      if (op.path.startsWith('/kpis')) {
        const currentKpis = Array.isArray(currentSpec?.kpis) ? currentSpec.kpis.length : 0
        if (currentKpis >= guardrails.max_kpis) {
          errors.push(`GUARDRAIL_EXCEEDED: Máximo de ${guardrails.max_kpis} KPIs permitido`)
        }
      }
      
      if (op.path.startsWith('/charts')) {
        const currentCharts = Array.isArray(currentSpec?.charts) ? currentSpec.charts.length : 0
        if (currentCharts >= guardrails.max_charts) {
          errors.push(`GUARDRAIL_EXCEEDED: Máximo de ${guardrails.max_charts} gráficos permitido`)
        }
      }
      
      if (op.path.startsWith('/filters')) {
        const currentFilters = Array.isArray(currentSpec?.filters) ? currentSpec.filters.length : 0
        if (currentFilters >= guardrails.max_filters) {
          errors.push(`GUARDRAIL_EXCEEDED: Máximo de ${guardrails.max_filters} filtros permitido`)
        }
      }
      
      if (op.path.startsWith('/tabs') || op.path.startsWith('/ui/tabs')) {
        if (!guardrails.allow_create_new_tabs) {
          errors.push(`GUARDRAIL_BLOCKED: Criação de novas abas não permitida`)
        }
        const currentTabs = Array.isArray(currentSpec?.ui?.tabs) ? currentSpec.ui.tabs.length : 0
        if (currentTabs >= guardrails.max_tabs) {
          errors.push(`GUARDRAIL_EXCEEDED: Máximo de ${guardrails.max_tabs} abas permitido`)
        }
      }
    }
    
    // Check protected tabs for remove operations
    if (op.op === 'remove') {
      if (op.path.startsWith('/tabs') || op.path.startsWith('/ui/tabs')) {
        // Try to determine which tab is being removed
        const tabIndex = parseInt(op.path.split('/').pop() || '')
        if (!isNaN(tabIndex)) {
          const tabs = currentSpec?.ui?.tabs || currentSpec?.tabs || []
          const tabName = tabs[tabIndex]
          if (guardrails.protected_tabs.includes(tabName)) {
            errors.push(`GUARDRAIL_BLOCKED: Aba "${tabName}" é protegida e não pode ser removida`)
          }
        }
      }
    }
  }
  
  return { valid: errors.length === 0, errors, warnings }
}

// =====================================================
// APPLY RFC6902 PATCH
// =====================================================

function applyPatch(spec: any, patch: RFC6902Operation[]): { result: any; error?: string } {
  try {
    let result = JSON.parse(JSON.stringify(spec)) // Deep clone
    
    for (const op of patch) {
      const pathParts = op.path.split('/').filter(Boolean)
      
      switch (op.op) {
        case 'add':
          result = applyAdd(result, pathParts, op.value)
          break
        case 'remove':
          result = applyRemove(result, pathParts)
          break
        case 'replace':
          result = applyReplace(result, pathParts, op.value)
          break
        case 'move':
          if (!op.from) throw new Error('move operation requires "from"')
          const fromParts = op.from.split('/').filter(Boolean)
          const valueToMove = getAtPath(result, fromParts)
          result = applyRemove(result, fromParts)
          result = applyAdd(result, pathParts, valueToMove)
          break
        case 'copy':
          if (!op.from) throw new Error('copy operation requires "from"')
          const copyFromParts = op.from.split('/').filter(Boolean)
          const valueToCopy = getAtPath(result, copyFromParts)
          result = applyAdd(result, pathParts, JSON.parse(JSON.stringify(valueToCopy)))
          break
        case 'test':
          const actual = getAtPath(result, pathParts)
          if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
            return { result: spec, error: `Test failed at ${op.path}` }
          }
          break
      }
    }
    
    return { result }
  } catch (error: any) {
    return { result: spec, error: error.message }
  }
}

function getAtPath(obj: any, path: string[]): any {
  let current = obj
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    if (key === '-') {
      if (!Array.isArray(current)) throw new Error('Cannot use - on non-array')
      return current[current.length - 1]
    }
    current = current[key]
  }
  return current
}

function applyAdd(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value
  
  const result = JSON.parse(JSON.stringify(obj || {}))
  let current = result
  
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (current[key] === undefined) {
      current[key] = isNaN(parseInt(path[i + 1])) ? {} : []
    }
    current = current[key]
  }
  
  const lastKey = path[path.length - 1]
  if (lastKey === '-' && Array.isArray(current)) {
    current.push(value)
  } else if (!isNaN(parseInt(lastKey)) && Array.isArray(current)) {
    current.splice(parseInt(lastKey), 0, value)
  } else {
    current[lastKey] = value
  }
  
  return result
}

function applyRemove(obj: any, path: string[]): any {
  if (path.length === 0) return undefined
  
  const result = JSON.parse(JSON.stringify(obj))
  let current = result
  
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]]
    if (current === undefined) return result
  }
  
  const lastKey = path[path.length - 1]
  if (Array.isArray(current) && !isNaN(parseInt(lastKey))) {
    current.splice(parseInt(lastKey), 1)
  } else {
    delete current[lastKey]
  }
  
  return result
}

function applyReplace(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value
  
  const result = JSON.parse(JSON.stringify(obj))
  let current = result
  
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]]
    if (current === undefined) return result
  }
  
  current[path[path.length - 1]] = value
  return result
}

// =====================================================
// LLM PROMPT FOR PATCH GENERATION
// =====================================================

function buildEditPrompt(
  userRequest: string,
  currentSpec: any,
  datasetProfile: any,
  semanticModel: any,
  guardrails: typeof DEFAULT_GUARDRAILS
): string {
  const availableColumns = semanticModel?.columns?.map((c: any) => c.name) || []
  
  return `Você é um especialista em edição de dashboards. Gere um patch RFC6902 para modificar o spec do dashboard.

## Regras ESTRITAS:
1. SOMENTE retorne um patch RFC6902 válido como JSON
2. NÃO pode modificar: data_source_id, dataset_id, tenant_id, credentials, secrets
3. Só use colunas que EXISTEM no dataset: ${availableColumns.join(', ')}
4. Só use widgets do catálogo: ${WIDGET_CATALOG.join(', ')}
5. Respeite guardrails: max_kpis=${guardrails.max_kpis}, max_charts=${guardrails.max_charts}, max_tabs=${guardrails.max_tabs}
6. NÃO remova a aba "Detalhes" (protegida)

## Spec atual:
${JSON.stringify(currentSpec, null, 2)}

## Colunas disponíveis (semantic model):
${JSON.stringify(semanticModel?.columns?.map((c: any) => ({
  name: c.name,
  role: c.semantic_role,
  label: c.display_label,
  format: c.format
})) || [], null, 2)}

## Solicitação do usuário:
${userRequest}

## Formato de resposta:
Retorne APENAS um JSON com esta estrutura:
{
  "patch": [
    { "op": "add|remove|replace|move|copy|test", "path": "/caminho", "value": {...} }
  ],
  "summary": ["Descrição da mudança 1", "Descrição da mudança 2"],
  "warnings": ["Aviso opcional"],
  "confidence": 0.0 a 1.0
}

IMPORTANTE: Não inclua explicações fora do JSON. Retorne APENAS o JSON.`
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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')

    if (!lovableApiKey) {
      return errorResponse('CONFIG_ERROR', 'LOVABLE_API_KEY não configurada', undefined, traceId)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Authenticate
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('AUTH_FAILED', 'Usuário não autenticado', undefined, traceId)
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check role (admin/manager only)
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager'])

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado - apenas admins podem editar com IA', undefined, traceId)
    }

    // Parse request
    const body = await req.json()
    const { 
      dashboard_id, 
      user_request, 
      current_spec,
      semantic_model,
      guardrails: customGuardrails
    } = body

    if (!dashboard_id || !user_request) {
      return errorResponse('VALIDATION_ERROR', 'dashboard_id e user_request são obrigatórios', undefined, traceId)
    }

    console.log(`[${traceId}] AI Dashboard Edit: ${dashboard_id}, request="${user_request.substring(0, 100)}..."`)

    // Fetch dashboard if spec not provided
    let spec = current_spec
    if (!spec) {
      const { data: dashboard } = await adminClient
        .from('dashboards')
        .select('dashboard_spec')
        .eq('id', dashboard_id)
        .single()
      
      spec = dashboard?.dashboard_spec || {}
    }

    // Merge guardrails
    const guardrails = { ...DEFAULT_GUARDRAILS, ...customGuardrails }

    // Build prompt
    const prompt = buildEditPrompt(
      user_request,
      spec,
      null,
      semantic_model,
      guardrails
    )

    // Call Lovable AI
    console.log(`[${traceId}] Calling Lovable AI for patch generation...`)
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Você é um assistente especializado em edição de dashboards. Sempre retorne JSON válido.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    })

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text()
      console.error(`[${traceId}] AI error:`, errorText)
      
      if (aiResponse.status === 429) {
        return errorResponse('RATE_LIMITED', 'Limite de requisições excedido, tente novamente em alguns minutos', undefined, traceId)
      }
      if (aiResponse.status === 402) {
        return errorResponse('PAYMENT_REQUIRED', 'Créditos insuficientes para IA', undefined, traceId)
      }
      
      return errorResponse('AI_ERROR', 'Erro ao gerar patch com IA', errorText, traceId)
    }

    const aiData = await aiResponse.json()
    const aiContent = aiData.choices?.[0]?.message?.content || ''
    
    console.log(`[${traceId}] AI response length: ${aiContent.length}`)

    // Parse AI response
    let patchResult: {
      patch: RFC6902Operation[]
      summary: string[]
      warnings: string[]
      confidence: number
    }

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = aiContent.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      patchResult = JSON.parse(jsonStr)
    } catch (parseError) {
      console.error(`[${traceId}] Failed to parse AI response:`, aiContent.substring(0, 500))
      return errorResponse('PARSE_ERROR', 'Resposta da IA não é JSON válido', aiContent.substring(0, 200), traceId)
    }

    // Validate patch
    const validation = validatePatch(patchResult.patch || [], spec, guardrails)
    
    if (!validation.valid) {
      return successResponse({
        trace_id: traceId,
        patch_format: 'rfc6902',
        patch: patchResult.patch,
        summary: patchResult.summary,
        warnings: [...(patchResult.warnings || []), ...validation.warnings],
        validation_errors: validation.errors,
        valid: false,
        confidence: patchResult.confidence || 0
      })
    }

    // Apply patch to get preview
    const { result: newSpec, error: applyError } = applyPatch(spec, patchResult.patch)
    
    if (applyError) {
      return successResponse({
        trace_id: traceId,
        patch_format: 'rfc6902',
        patch: patchResult.patch,
        summary: patchResult.summary,
        warnings: patchResult.warnings,
        validation_errors: [applyError],
        valid: false,
        confidence: patchResult.confidence || 0
      })
    }

    // Log AI usage
    try {
      await adminClient.from('ai_usage_logs').insert({
        tenant_id: (await adminClient.from('profiles').select('tenant_id').eq('id', user.id).single()).data?.tenant_id,
        user_id: user.id,
        dashboard_id,
        request_type: 'dashboard_edit',
        status: 'success',
        model: 'google/gemini-2.5-flash',
        prompt_tokens: aiData.usage?.prompt_tokens,
        completion_tokens: aiData.usage?.completion_tokens,
        total_tokens: aiData.usage?.total_tokens,
        latency_ms: 0
      })
    } catch (logError) {
      console.warn(`[${traceId}] Failed to log AI usage:`, logError)
    }

    return successResponse({
      trace_id: traceId,
      patch_format: 'rfc6902',
      patch: patchResult.patch,
      summary: patchResult.summary,
      warnings: [...(patchResult.warnings || []), ...validation.warnings],
      validation_errors: [],
      valid: true,
      confidence: patchResult.confidence || 0.8,
      preview_spec: newSpec,
      preview_metrics: {
        kpis_count: Array.isArray(newSpec?.kpis) ? newSpec.kpis.length : 0,
        charts_count: Array.isArray(newSpec?.charts) ? newSpec.charts.length : 0,
        tabs: newSpec?.ui?.tabs || newSpec?.tabs || [],
        funnel_steps: newSpec?.funnel?.stages?.length || 0
      }
    })

  } catch (error: any) {
    console.error(`[${traceId}] Error in ai-dashboard-edit:`, error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message, traceId)
  }
})
