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
// RFC6902 PATCH APPLICATION
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

function validatePatchPath(path: string): boolean {
  for (const blocked of BLOCKED_PATHS) {
    if (path === blocked || path.startsWith(blocked + '/')) {
      return false
    }
  }
  return true
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

function applyPatch(spec: any, patch: RFC6902Operation[]): { result: any; error?: string } {
  try {
    let result = JSON.parse(JSON.stringify(spec))
    
    for (const op of patch) {
      // Validate path
      if (!validatePatchPath(op.path)) {
        return { result: spec, error: `PATCH_PATH_FORBIDDEN: ${op.path}` }
      }
      
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
          if (!op.from) throw new Error('move requires from')
          if (!validatePatchPath(op.from)) {
            return { result: spec, error: `PATCH_PATH_FORBIDDEN: ${op.from}` }
          }
          const fromParts = op.from.split('/').filter(Boolean)
          const valueToMove = getAtPath(result, fromParts)
          result = applyRemove(result, fromParts)
          result = applyAdd(result, pathParts, valueToMove)
          break
        case 'copy':
          if (!op.from) throw new Error('copy requires from')
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

// =====================================================
// SPEC VALIDATION
// =====================================================

function validateSpec(spec: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Must have version
  if (!spec.version) {
    errors.push('Spec deve ter version')
  }
  
  // KPIs validation
  if (spec.kpis && !Array.isArray(spec.kpis)) {
    errors.push('kpis deve ser um array')
  }
  
  // Charts validation
  if (spec.charts && !Array.isArray(spec.charts)) {
    errors.push('charts deve ser um array')
  }
  
  // Funnel validation
  if (spec.funnel) {
    if (!spec.funnel.stages && !spec.funnel.steps) {
      errors.push('funnel deve ter stages ou steps')
    }
  }
  
  // Check for NaN/Infinity in numeric values
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
  
  return { valid: errors.length === 0, errors }
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

    // Check role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager'])

    if (!roleData || roleData.length === 0) {
      return errorResponse('FORBIDDEN', 'Acesso negado', undefined, traceId)
    }

    // Parse request
    const body = await req.json()
    const { 
      dashboard_id, 
      patch,
      patch_format = 'rfc6902',
      expected_version,
      change_reason = 'Edição via IA'
    } = body

    if (!dashboard_id || !patch) {
      return errorResponse('VALIDATION_ERROR', 'dashboard_id e patch são obrigatórios', undefined, traceId)
    }

    console.log(`[${traceId}] Applying patch to dashboard ${dashboard_id}`)

    // Fetch current dashboard
    const { data: dashboard, error: dashError } = await adminClient
      .from('dashboards')
      .select('id, dashboard_spec, tenant_id')
      .eq('id', dashboard_id)
      .single()

    if (dashError || !dashboard) {
      return errorResponse('NOT_FOUND', 'Dashboard não encontrado', undefined, traceId)
    }

    const currentSpec = dashboard.dashboard_spec || { version: 1 }

    // Get current version number
    const { data: versionData } = await adminClient
      .from('dashboard_spec_versions')
      .select('version')
      .eq('dashboard_id', dashboard_id)
      .order('version', { ascending: false })
      .limit(1)

    const currentVersion = versionData?.[0]?.version || 0

    // Check expected version (optimistic locking)
    if (expected_version !== undefined && expected_version !== currentVersion) {
      return errorResponse(
        'VERSION_CONFLICT', 
        `Conflito de versão: esperado ${expected_version}, atual ${currentVersion}`,
        undefined,
        traceId
      )
    }

    // Apply patch
    const { result: newSpec, error: applyError } = applyPatch(currentSpec, patch)
    
    if (applyError) {
      return errorResponse('PATCH_ERROR', 'Erro ao aplicar patch', applyError, traceId)
    }

    // Validate new spec
    const validation = validateSpec(newSpec)
    if (!validation.valid) {
      return errorResponse('VALIDATION_ERROR', 'Spec resultante inválido', validation.errors.join(', '), traceId)
    }

    // Create diff summary
    const diffSummary: string[] = []
    for (const op of patch) {
      switch (op.op) {
        case 'add':
          diffSummary.push(`+ Adicionado: ${op.path}`)
          break
        case 'remove':
          diffSummary.push(`- Removido: ${op.path}`)
          break
        case 'replace':
          diffSummary.push(`~ Alterado: ${op.path}`)
          break
        case 'move':
          diffSummary.push(`→ Movido: ${op.from} para ${op.path}`)
          break
      }
    }

    // Save new version
    const newVersion = currentVersion + 1
    
    const { error: versionError } = await adminClient
      .from('dashboard_spec_versions')
      .insert({
        dashboard_id,
        version: newVersion,
        dashboard_spec: newSpec,
        created_by: user.id,
        notes: change_reason
      })

    if (versionError) {
      console.error(`[${traceId}] Failed to save version:`, versionError)
      return errorResponse('SAVE_ERROR', 'Erro ao salvar versão', versionError.message, traceId)
    }

    // Update dashboard with new spec
    const { error: updateError } = await adminClient
      .from('dashboards')
      .update({
        dashboard_spec: newSpec,
        updated_at: new Date().toISOString()
      })
      .eq('id', dashboard_id)

    if (updateError) {
      console.error(`[${traceId}] Failed to update dashboard:`, updateError)
      return errorResponse('UPDATE_ERROR', 'Erro ao atualizar dashboard', updateError.message, traceId)
    }

    // Log audit trail
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    await adminClient.from('activity_logs').insert({
      user_id: user.id,
      action: 'AI_PATCH_APPLIED',
      entity_type: 'dashboard',
      entity_id: dashboard_id,
      details: {
        trace_id: traceId,
        version: newVersion,
        change_reason,
        diff_summary: diffSummary,
        patch_operations: patch.length
      }
    })

    console.log(`[${traceId}] Dashboard ${dashboard_id} updated to version ${newVersion}`)

    return successResponse({
      trace_id: traceId,
      dashboard_id,
      version: newVersion,
      previous_version: currentVersion,
      diff_summary: diffSummary,
      new_spec: newSpec,
      applied_at: new Date().toISOString()
    })

  } catch (error: any) {
    console.error(`[${traceId}] Error in apply-dashboard-patch:`, error)
    return errorResponse('INTERNAL_ERROR', 'Erro interno', error.message, traceId)
  }
})
