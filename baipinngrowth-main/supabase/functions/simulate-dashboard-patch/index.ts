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
// RFC6902 PATCH APPLICATION (same as apply-dashboard-patch)
// =====================================================

interface RFC6902Operation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  path: string
  value?: any
  from?: string
}

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

const PROTECTED_TABS = ['Detalhes']

function validatePatchPath(path: string): { valid: boolean; error?: string } {
  for (const blocked of BLOCKED_PATHS) {
    if (path === blocked || path.startsWith(blocked + '/')) {
      return { valid: false, error: `Caminho bloqueado: ${path}` }
    }
  }
  return { valid: true }
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

function applyPatch(spec: any, patch: RFC6902Operation[]): { result: any; errors: string[] } {
  const errors: string[] = []
  
  try {
    let result = JSON.parse(JSON.stringify(spec))
    
    for (const op of patch) {
      // Validate path
      const pathCheck = validatePatchPath(op.path)
      if (!pathCheck.valid) {
        errors.push(pathCheck.error!)
        continue
      }
      
      const pathParts = op.path.split('/').filter(Boolean)
      
      // Check for protected tab removal
      if (op.op === 'remove' && (op.path.includes('/tabs') || op.path.includes('/ui/tabs'))) {
        const tabIndex = parseInt(pathParts[pathParts.length - 1])
        if (!isNaN(tabIndex)) {
          const tabs = result?.ui?.tabs || result?.tabs || []
          const tabName = tabs[tabIndex]
          if (PROTECTED_TABS.includes(tabName)) {
            errors.push(`Aba "${tabName}" é protegida e não pode ser removida`)
            continue
          }
        }
      }
      
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
          if (!op.from) {
            errors.push('move requer "from"')
            continue
          }
          const fromCheck = validatePatchPath(op.from)
          if (!fromCheck.valid) {
            errors.push(fromCheck.error!)
            continue
          }
          const fromParts = op.from.split('/').filter(Boolean)
          const valueToMove = getAtPath(result, fromParts)
          result = applyRemove(result, fromParts)
          result = applyAdd(result, pathParts, valueToMove)
          break
        case 'copy':
          if (!op.from) {
            errors.push('copy requer "from"')
            continue
          }
          const copyFromParts = op.from.split('/').filter(Boolean)
          const valueToCopy = getAtPath(result, copyFromParts)
          result = applyAdd(result, pathParts, JSON.parse(JSON.stringify(valueToCopy)))
          break
        case 'test':
          const actual = getAtPath(result, pathParts)
          if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
            errors.push(`Test falhou em ${op.path}`)
          }
          break
      }
    }
    
    return { result, errors }
  } catch (error: any) {
    return { result: spec, errors: [error.message] }
  }
}

// =====================================================
// SPEC VALIDATION
// =====================================================

function validateSpec(spec: any): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  
  if (!spec.version) {
    warnings.push('Spec não tem version, usando 1')
  }
  
  // Check for empty spec
  const hasContent = 
    (spec.kpis && spec.kpis.length > 0) ||
    (spec.charts && spec.charts.length > 0) ||
    (spec.funnel && (spec.funnel.stages?.length > 0 || spec.funnel.steps?.length > 0))
  
  if (!hasContent) {
    warnings.push('Spec parece vazio (sem KPIs, charts ou funnel)')
  }
  
  // KPIs validation
  if (spec.kpis) {
    if (!Array.isArray(spec.kpis)) {
      errors.push('kpis deve ser um array')
    } else {
      spec.kpis.forEach((kpi: any, i: number) => {
        if (!kpi.key && !kpi.column) {
          errors.push(`KPI ${i} não tem key/column`)
        }
      })
    }
  }
  
  // Charts validation
  if (spec.charts) {
    if (!Array.isArray(spec.charts)) {
      errors.push('charts deve ser um array')
    }
  }
  
  // Tabs validation
  const tabs = spec?.ui?.tabs || spec?.tabs || []
  if (!tabs.includes('Detalhes')) {
    warnings.push('Aba "Detalhes" não encontrada - recomendado manter')
  }
  
  // Check for NaN/Infinity
  const checkForInvalidNumbers = (obj: any, path: string = ''): void => {
    if (obj === null || obj === undefined) return
    if (typeof obj === 'number') {
      if (!isFinite(obj)) {
        errors.push(`Valor numérico inválido em ${path}`)
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, i) => checkForInvalidNumbers(item, `${path}[${i}]`))
    } else if (typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        checkForInvalidNumbers(value, path ? `${path}.${key}` : key)
      })
    }
  }
  
  checkForInvalidNumbers(spec)
  
  return { valid: errors.length === 0, errors, warnings }
}

// =====================================================
// DIFF GENERATOR
// =====================================================

function generateDiffSummary(
  oldSpec: any, 
  newSpec: any, 
  patch: RFC6902Operation[]
): string[] {
  const summary: string[] = []
  
  // KPIs diff
  const oldKpis = oldSpec?.kpis?.length || 0
  const newKpis = newSpec?.kpis?.length || 0
  if (newKpis > oldKpis) {
    summary.push(`+ ${newKpis - oldKpis} KPI(s) adicionado(s)`)
  } else if (newKpis < oldKpis) {
    summary.push(`- ${oldKpis - newKpis} KPI(s) removido(s)`)
  }
  
  // Charts diff
  const oldCharts = oldSpec?.charts?.length || 0
  const newCharts = newSpec?.charts?.length || 0
  if (newCharts > oldCharts) {
    summary.push(`+ ${newCharts - oldCharts} gráfico(s) adicionado(s)`)
  } else if (newCharts < oldCharts) {
    summary.push(`- ${oldCharts - newCharts} gráfico(s) removido(s)`)
  }
  
  // Tabs diff
  const oldTabs = oldSpec?.ui?.tabs || oldSpec?.tabs || []
  const newTabs = newSpec?.ui?.tabs || newSpec?.tabs || []
  const addedTabs = newTabs.filter((t: string) => !oldTabs.includes(t))
  const removedTabs = oldTabs.filter((t: string) => !newTabs.includes(t))
  
  if (addedTabs.length > 0) {
    summary.push(`+ Abas adicionadas: ${addedTabs.join(', ')}`)
  }
  if (removedTabs.length > 0) {
    summary.push(`- Abas removidas: ${removedTabs.join(', ')}`)
  }
  
  // Funnel diff
  const oldFunnel = oldSpec?.funnel?.stages?.length || oldSpec?.funnel?.steps?.length || 0
  const newFunnel = newSpec?.funnel?.stages?.length || newSpec?.funnel?.steps?.length || 0
  if (newFunnel > oldFunnel) {
    summary.push(`+ ${newFunnel - oldFunnel} etapa(s) de funil adicionada(s)`)
  } else if (newFunnel < oldFunnel) {
    summary.push(`- ${oldFunnel - newFunnel} etapa(s) de funil removida(s)`)
  }
  
  // Filters diff
  const oldFilters = oldSpec?.filters?.length || 0
  const newFilters = newSpec?.filters?.length || 0
  if (newFilters > oldFilters) {
    summary.push(`+ ${newFilters - oldFilters} filtro(s) adicionado(s)`)
  } else if (newFilters < oldFilters) {
    summary.push(`- ${oldFilters - newFilters} filtro(s) removido(s)`)
  }
  
  // If no changes detected from comparison, list operations
  if (summary.length === 0) {
    for (const op of patch.slice(0, 5)) {
      switch (op.op) {
        case 'add':
          summary.push(`+ Adicionado: ${op.path}`)
          break
        case 'remove':
          summary.push(`- Removido: ${op.path}`)
          break
        case 'replace':
          summary.push(`~ Alterado: ${op.path}`)
          break
      }
    }
    if (patch.length > 5) {
      summary.push(`... e mais ${patch.length - 5} operação(ões)`)
    }
  }
  
  return summary
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

    // Parse request
    const body = await req.json()
    const { 
      dashboard_id, 
      patch,
      expected_version
    } = body

    if (!dashboard_id || !patch) {
      return errorResponse('VALIDATION_ERROR', 'dashboard_id e patch são obrigatórios', undefined, traceId)
    }

    console.log(`[${traceId}] Simulating patch for dashboard ${dashboard_id}`)

    // Fetch current dashboard
    const { data: dashboard, error: dashError } = await adminClient
      .from('dashboards')
      .select('id, dashboard_spec')
      .eq('id', dashboard_id)
      .single()

    if (dashError || !dashboard) {
      return errorResponse('NOT_FOUND', 'Dashboard não encontrado', undefined, traceId)
    }

    const currentSpec = dashboard.dashboard_spec || { version: 1 }

    // Get current version
    const { data: versionData } = await adminClient
      .from('dashboard_spec_versions')
      .select('version')
      .eq('dashboard_id', dashboard_id)
      .order('version', { ascending: false })
      .limit(1)

    const currentVersion = versionData?.[0]?.version || 0

    // Check version conflict
    if (expected_version !== undefined && expected_version !== currentVersion) {
      return successResponse({
        trace_id: traceId,
        valid: false,
        validation_errors: [`Conflito de versão: esperado ${expected_version}, atual ${currentVersion}`],
        validation_warnings: [],
        current_version: currentVersion
      })
    }

    // Apply patch (simulation)
    const { result: newSpec, errors: patchErrors } = applyPatch(currentSpec, patch)
    
    // Validate result
    const validation = validateSpec(newSpec)
    
    const allErrors = [...patchErrors, ...validation.errors]
    const allWarnings = validation.warnings
    
    // Generate diff summary
    const diffSummary = generateDiffSummary(currentSpec, newSpec, patch)
    
    // Compute preview metrics
    const previewMetrics = {
      kpis_count: Array.isArray(newSpec?.kpis) ? newSpec.kpis.length : 0,
      charts_count: Array.isArray(newSpec?.charts) ? newSpec.charts.length : 0,
      tabs: newSpec?.ui?.tabs || newSpec?.tabs || [],
      funnel_steps: (newSpec?.funnel?.stages?.length || newSpec?.funnel?.steps?.length || 0),
      filters_count: Array.isArray(newSpec?.filters) ? newSpec.filters.length : 0
    }

    console.log(`[${traceId}] Simulation complete: ${allErrors.length} errors, ${allWarnings.length} warnings`)

    return successResponse({
      trace_id: traceId,
      valid: allErrors.length === 0,
      validation_errors: allErrors,
      validation_warnings: allWarnings,
      new_spec: newSpec,
      current_spec: currentSpec,
      diff_summary: diffSummary,
      preview_metrics: previewMetrics,
      current_version: currentVersion,
      will_be_version: currentVersion + 1
    })

  } catch (error: any) {
    console.error(`[${traceId}] Error in simulate-dashboard-patch:`, error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message, traceId)
  }
})
