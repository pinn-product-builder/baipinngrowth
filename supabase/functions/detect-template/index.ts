import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Encryption helpers
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

interface ColumnInfo {
  name: string;
  type: string;
  isNullable: boolean;
}

interface DetectionResult {
  template_kind: 'none' | 'costs_funnel_daily' | 'custom';
  columns: ColumnInfo[];
  suggested_spec: Record<string, any>;
  confidence: number;
  reasoning: string[];
}

// Template detection rules
function detectCostsFunnelDaily(columns: ColumnInfo[]): { match: boolean; confidence: number; reasoning: string[] } {
  const colNames = columns.map(c => c.name.toLowerCase());
  const reasoning: string[] = [];
  let score = 0;
  
  // Check for date column
  const hasDateColumn = colNames.some(c => 
    c === 'dia' || c === 'date' || c === 'created_at' || c === 'data'
  );
  if (hasDateColumn) {
    score += 25;
    reasoning.push('✓ Coluna de data encontrada (dia/date)');
  } else {
    reasoning.push('✗ Nenhuma coluna de data reconhecida');
  }
  
  // Check for custo_total
  const hasCusto = colNames.some(c => c.includes('custo') && c.includes('total'));
  if (hasCusto) {
    score += 25;
    reasoning.push('✓ Coluna custo_total encontrada');
  } else {
    reasoning.push('✗ Coluna custo_total não encontrada');
  }
  
  // Check for *_total columns (at least 2)
  const totalColumns = colNames.filter(c => c.endsWith('_total') && !c.includes('custo'));
  if (totalColumns.length >= 2) {
    score += 25;
    reasoning.push(`✓ ${totalColumns.length} colunas *_total encontradas: ${totalColumns.slice(0, 5).join(', ')}`);
  } else {
    reasoning.push(`✗ Apenas ${totalColumns.length} coluna(s) *_total (mínimo: 2)`);
  }
  
  // Check for CPL/CAC (optional but boosts score)
  const hasCplCac = colNames.some(c => c === 'cpl' || c === 'cac');
  if (hasCplCac) {
    score += 15;
    reasoning.push('✓ CPL/CAC encontrado');
  }
  
  // Check for taxa_* columns (optional)
  const hasTaxas = colNames.some(c => c.startsWith('taxa_'));
  if (hasTaxas) {
    score += 10;
    reasoning.push('✓ Colunas de taxa encontradas');
  }
  
  return {
    match: score >= 75,
    confidence: score,
    reasoning
  };
}

// Generate suggested spec based on detected columns
function generateSuggestedSpec(columns: ColumnInfo[], templateKind: string): Record<string, any> {
  const colNames = columns.map(c => c.name.toLowerCase());
  
  if (templateKind !== 'costs_funnel_daily') {
    return {
      kpis: [],
      charts: [],
      tableColumns: colNames,
      formatting: {}
    };
  }
  
  // Build formatting rules
  const formatting: Record<string, string> = {};
  const kpis: string[] = [];
  const tableColumns: string[] = [];
  
  columns.forEach(col => {
    const name = col.name.toLowerCase();
    
    // Currency formatting
    if (name.includes('custo') || name === 'cpl' || name === 'cac' || name.startsWith('custo_por_')) {
      formatting[col.name] = 'currency';
    }
    // Percentage formatting
    else if (name.startsWith('taxa_')) {
      formatting[col.name] = 'percent';
    }
    // Integer formatting for totals
    else if (name.endsWith('_total')) {
      formatting[col.name] = 'integer';
    }
    
    // Add to table columns (excluding some meta columns)
    if (!['id', 'created_at', 'updated_at'].includes(name)) {
      tableColumns.push(col.name);
    }
  });
  
  // Suggested KPIs for executive view
  const possibleKpis = ['custo_total', 'leads_total', 'entrada_total', 'reuniao_realizada_total', 'venda_total', 'cpl', 'cac'];
  possibleKpis.forEach(kpi => {
    if (colNames.includes(kpi)) {
      kpis.push(kpi);
    }
  });
  
  return {
    kpis,
    charts: {
      executive: [
        { type: 'line', dataKeys: ['custo_total'], name: 'Custo por Dia' },
        { type: 'line', dataKeys: ['leads_total'], name: 'Leads por Dia', secondaryAxis: true },
        { type: 'line', dataKeys: ['cpl', 'cac'], name: 'CPL e CAC por Dia' }
      ],
      funnel: [
        { type: 'funnel', stages: ['leads_total', 'entrada_total', 'reuniao_agendada_total', 'reuniao_realizada_total', 'venda_total'] }
      ],
      efficiency: [
        { type: 'bar', dataKeys: ['custo_por_entrada', 'custo_por_reuniao_agendada', 'custo_por_reuniao_realizada', 'cac'], name: 'Custo por Etapa' }
      ]
    },
    tableColumns,
    formatting,
    funnelStages: {
      leads_total: 'Leads',
      entrada_total: 'Entradas',
      reuniao_agendada_total: 'Reuniões Agendadas',
      reuniao_realizada_total: 'Reuniões Realizadas',
      venda_total: 'Vendas'
    },
    lossColumns: ['falta_total', 'desmarque_total'],
    taxaColumns: ['taxa_entrada', 'taxa_reuniao_agendada', 'taxa_comparecimento', 'taxa_venda_pos_reuniao', 'taxa_venda_total']
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is authenticated and has admin/manager role
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'manager']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Requer role admin ou manager.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request
    const body = await req.json();
    const { data_source_id, view_name, dashboard_id } = body;

    if (!data_source_id || !view_name) {
      return new Response(JSON.stringify({ error: 'data_source_id e view_name são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch data source
    const { data: dataSource, error: dsError } = await adminClient
      .from('tenant_data_sources')
      .select('*')
      .eq('id', data_source_id)
      .maybeSingle();

    if (dsError || !dataSource) {
      return new Response(JSON.stringify({ error: 'Data source não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate view is allowed
    if (!dataSource.allowed_views.includes(view_name)) {
      return new Response(JSON.stringify({ error: 'View não permitida neste data source' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get credentials - try encrypted keys first
    let remoteKey: string | null = null;

    if (dataSource.anon_key_encrypted) {
      try {
        remoteKey = await decrypt(dataSource.anon_key_encrypted);
      } catch (e) {
        console.error('Failed to decrypt anon_key');
      }
    }

    if (!remoteKey && dataSource.service_role_key_encrypted) {
      try {
        remoteKey = await decrypt(dataSource.service_role_key_encrypted);
      } catch (e) {
        console.error('Failed to decrypt service_role_key');
      }
    }

    // Fallback to hardcoded Afonsina keys
    if (!remoteKey) {
      const afonsinaUrl = Deno.env.get('AFONSINA_SUPABASE_URL');
      const afonsinaServiceKey = Deno.env.get('AFONSINA_SUPABASE_SERVICE_ROLE_KEY');
      const afonsinaAnonKey = Deno.env.get('AFONSINA_SUPABASE_ANON_KEY');
      
      if (afonsinaUrl && dataSource.project_url === afonsinaUrl) {
        remoteKey = afonsinaAnonKey || afonsinaServiceKey || null;
      }
    }

    if (!remoteKey) {
      return new Response(JSON.stringify({ error: 'Credenciais do data source não configuradas' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch sample data to analyze columns (limit 200 rows)
    const restUrl = `${dataSource.project_url}/rest/v1/${view_name}?select=*&limit=200`;
    
    console.log('Fetching sample data from:', restUrl);
    
    const response = await fetch(restUrl, {
      headers: {
        'apikey': remoteKey,
        'Authorization': `Bearer ${remoteKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Remote error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'Erro ao acessar a view remota', details: errorText }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const sampleData = await response.json();
    
    if (!sampleData || sampleData.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'View está vazia. Adicione dados para detectar o template.',
        columns: [],
        template_kind: 'none'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Analyze columns from sample data
    const firstRow = sampleData[0];
    const columns: ColumnInfo[] = Object.keys(firstRow).map(key => {
      const value = firstRow[key];
      let type = 'text';
      
      if (value === null) {
        type = 'nullable';
      } else if (typeof value === 'number') {
        type = Number.isInteger(value) ? 'integer' : 'numeric';
      } else if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (typeof value === 'string') {
        // Try to detect date
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
          type = 'date';
        }
      }
      
      return {
        name: key,
        type,
        isNullable: value === null
      };
    });

    console.log('Detected columns:', columns.map(c => `${c.name}:${c.type}`).join(', '));

    // Run template detection
    const costsFunnelResult = detectCostsFunnelDaily(columns);
    
    let result: DetectionResult;
    
    if (costsFunnelResult.match) {
      result = {
        template_kind: 'costs_funnel_daily',
        columns,
        suggested_spec: generateSuggestedSpec(columns, 'costs_funnel_daily'),
        confidence: costsFunnelResult.confidence,
        reasoning: costsFunnelResult.reasoning
      };
    } else {
      result = {
        template_kind: 'none',
        columns,
        suggested_spec: generateSuggestedSpec(columns, 'none'),
        confidence: costsFunnelResult.confidence,
        reasoning: costsFunnelResult.reasoning
      };
    }

    console.log('Template detection result:', result.template_kind, 'confidence:', result.confidence);

    // If dashboard_id is provided, update the dashboard with detected info
    if (dashboard_id) {
      const { error: updateError } = await adminClient
        .from('dashboards')
        .update({
          template_kind: result.template_kind,
          dashboard_spec: result.suggested_spec,
          detected_columns: columns
        })
        .eq('id', dashboard_id);

      if (updateError) {
        console.error('Error updating dashboard:', updateError);
      } else {
        console.log('Dashboard updated with template:', result.template_kind);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in detect-template:', error);
    return new Response(JSON.stringify({ error: 'Erro interno', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
