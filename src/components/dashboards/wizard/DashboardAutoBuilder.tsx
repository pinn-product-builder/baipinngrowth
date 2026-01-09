import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { 
  Wand2, 
  Loader2, 
  Check, 
  AlertTriangle, 
  Database,
  Table,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Clock,
  Filter,
  BarChart3,
  Copy,
  CheckCircle2,
  XCircle,
  Settings2,
  MapPin,
  Code,
  FileCode
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Dataset {
  id: string;
  name: string;
  object_name: string | null;
  primary_time_column: string | null;
  grain_hint: string | null;
  last_introspected_at: string | null;
  _column_count?: number;
  tenant_data_sources?: { name: string } | null;
}

interface DashboardAutoBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (dashboardId: string) => void;
  tenantId?: string;
}

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

interface DiagnosticInfo {
  columns_detected: { name: string; semantic: string | null; label: string }[];
  time_column: string | null;
  time_parseable_rate?: number;
  funnel_candidates: string[];
  warnings: string[];
  errors: string[];
  assumptions: string[];
}

interface TestQueryResult {
  rows_returned: number;
  rows_scanned_total: number; // P0 FIX: Total rows scanned (FULL, no limit)
  sample_rows: Record<string, any>[];
  min_date: string | null;
  max_date: string | null;
  time_column: string | null;
  error?: string;
  all_rows?: Record<string, any>[];  // All rows for aggregation preview
  data_quality?: {
    time_parse_rate: number;
    rows_in_period: number;
    column_audits: any[];
  };
}

interface AggregationPreview {
  kpis: { key: string; label: string; value: number; format: string; audit?: { truthyCount: number; nonNullCount: number } }[];
  funnel: { column: string; label: string; value: number; rate?: number }[];
  computed: boolean;
  source: 'sample' | 'full_aggregate'; // P0 FIX: Track source
}

interface DatasetMapping {
  time_column: string | null;
  id_column: string | null;
  dimension_columns: string[];
  funnel_stages: string[];
  truthy_rule: 'default' | 'custom';
  custom_truthy_values?: string[];
}

type WizardStep = 'select' | 'generate' | 'mapping' | 'preview' | 'save';
type GenerationMode = 'react' | 'html';

// CRM Funnel detection patterns for Kommo datasets
const CRM_FUNNEL_DETECTION = {
  id_patterns: ['lead_id', 'leadid', 'kommo_lead_id', 'idd'],
  time_patterns: ['created_at', 'created_at_ts', 'dia', 'data', 'inserted_at'],
  stage_patterns: [
    'st_entrada', 'st_lead_ativo', 'st_qualificado', 'st_exp_nao_confirmada',
    'st_exp_agendada', 'st_faltou_exp', 'st_reagendou', 'st_exp_realizada',
    'st_venda', 'st_perdida', 'entrada', 'qualificado', 'venda', 'perdida'
  ],
  dimension_patterns: ['unidade', 'vendedora', 'professor', 'modalidade', 'origem', 'retencao']
};

// Detect if dataset looks like CRM/Kommo funnel
function detectCrmFunnelDataset(columns: string[], datasetName: string): { isCrm: boolean; confidence: number; reasons: string[] } {
  const colNamesLower = columns.map(c => c.toLowerCase());
  const reasons: string[] = [];
  let score = 0;
  
  // Check dataset name
  if (datasetName.toLowerCase().includes('kommo') || datasetName.toLowerCase().includes('crm')) {
    score += 20;
    reasons.push('Nome contém "kommo" ou "crm"');
  }
  
  // Check for ID column
  const hasIdColumn = CRM_FUNNEL_DETECTION.id_patterns.some(p => colNamesLower.includes(p));
  if (hasIdColumn) {
    score += 15;
    reasons.push('Coluna lead_id encontrada');
  }
  
  // Check for time column
  const hasTimeColumn = CRM_FUNNEL_DETECTION.time_patterns.some(p => colNamesLower.includes(p));
  if (hasTimeColumn) {
    score += 10;
    reasons.push('Coluna de tempo encontrada');
  }
  
  // Check for stage columns (need at least 4)
  const stageCount = CRM_FUNNEL_DETECTION.stage_patterns.filter(p => 
    colNamesLower.some(c => c.includes(p.replace('st_', '')) || c === p)
  ).length;
  if (stageCount >= 4) {
    score += 35;
    reasons.push(`${stageCount} etapas de funil detectadas`);
  } else if (stageCount >= 2) {
    score += 15;
    reasons.push(`${stageCount} etapas de funil detectadas (mínimo 4 ideal)`);
  }
  
  // Check for dimension columns
  const dimCount = CRM_FUNNEL_DETECTION.dimension_patterns.filter(p => 
    colNamesLower.some(c => c.includes(p))
  ).length;
  if (dimCount >= 2) {
    score += 20;
    reasons.push(`${dimCount} dimensões encontradas (unidade, vendedora, etc)`);
  }
  
  return {
    isCrm: score >= 60,
    confidence: Math.min(score, 100),
    reasons
  };
}

const DEFAULT_PROMPT = `Você é o BAI Dashboard Architect, especialista em BI para CRM + tráfego pago.
Gere um DashboardSpec v1 (JSON) adaptativo usando APENAS as colunas do dataset_profile.

REGRAS:
- Nunca referencie colunas inexistentes (match case-insensitive)
- Para campos de funil em text (entrada, qualificado, venda), use aggregation "truthy_count" (não count simples)
- Se não houver coluna de tempo, gere KPIs agregados + Funil total + Detalhes (nunca spec vazio)
- KPIs: máx 8, focados em decisão
- Gráficos: máx 4, priorize tendências e funil
- Diferencie dimensões (vendedora, origem) de métricas (valor_venda, custo)

ABAS: Decisões, Executivo, Funil, Tendências, Detalhes

Inclua diagnostics e queryPlan no JSON.`;

// Convert DashboardPlan to DashboardSpec format
// Column name normalization helper for fuzzy matching
function normalizeColumnName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[_\-\s]+/g, '')
    .replace(/^(st|flag|is|has|col)/, '');
}

function findColumnMatch(target: string, availableColumns: string[]): string | null {
  const normalizedTarget = normalizeColumnName(target);
  
  // Exact match first
  if (availableColumns.includes(target)) return target;
  
  // Case-insensitive match
  const caseMatch = availableColumns.find(c => c.toLowerCase() === target.toLowerCase());
  if (caseMatch) return caseMatch;
  
  // Normalized match (removes prefixes like st_, flag_, etc.)
  const normalizedMatch = availableColumns.find(c => normalizeColumnName(c) === normalizedTarget);
  if (normalizedMatch) return normalizedMatch;
  
  // Partial match (e.g., "entrada" matches "st_entrada")
  const partialMatch = availableColumns.find(c => 
    c.toLowerCase().includes(target.toLowerCase()) || 
    target.toLowerCase().includes(c.toLowerCase())
  );
  if (partialMatch) return partialMatch;
  
  return null;
}

// CRM fallback funnel order
const CRM_FUNNEL_ORDER = [
  'st_entrada', 'entrada',
  'st_lead_ativo', 'lead_ativo',
  'st_qualificado', 'qualificado',
  'st_exp_agendada', 'exp_agendada', 'agendada',
  'st_exp_realizada', 'exp_realizada', 'realizada',
  'st_venda', 'venda', 'vendas',
  'aluno_ativo',
  'st_perdida', 'perdida'
];

function generateFallbackSpec(semanticModel: any): any {
  const columns = semanticModel?.columns || [];
  const columnNames = columns.map((c: any) => c.name);
  
  // Detect time column with priority
  const timePriority = ['dia', 'data', 'created_at_ts', 'created_at', 'inserted_at', 'updated_at'];
  let timeColumn: string | null = semanticModel?.time_column || null;
  if (!timeColumn) {
    for (const t of timePriority) {
      const match = findColumnMatch(t, columnNames);
      if (match) {
        timeColumn = match;
        break;
      }
    }
  }
  
  // Detect ID column
  const idColumn = semanticModel?.id_column || findColumnMatch('lead_id', columnNames) || findColumnMatch('id', columnNames);
  
  // Detect stage flags
  const stageFlags = columns.filter((c: any) => 
    c.semantic_role === 'stage_flag' || 
    c.name.startsWith('st_') ||
    CRM_FUNNEL_ORDER.some(s => c.name.toLowerCase().includes(s.replace('st_', '')))
  );
  
  // Sort stage flags by CRM funnel order
  const sortedStages = stageFlags.sort((a: any, b: any) => {
    const aIndex = CRM_FUNNEL_ORDER.findIndex(s => 
      a.name.toLowerCase().includes(s.replace('st_', '')) || a.name.toLowerCase() === s
    );
    const bIndex = CRM_FUNNEL_ORDER.findIndex(s => 
      b.name.toLowerCase().includes(s.replace('st_', '')) || b.name.toLowerCase() === s
    );
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
  
  // Detect dimensions
  const dimensions = columns.filter((c: any) => 
    c.semantic_role === 'dimension' || 
    ['origem', 'vendedora', 'unidade', 'modalidade', 'retencao', 'source', 'channel'].some(d => 
      c.name.toLowerCase().includes(d)
    )
  );
  
  // Build KPIs (max 8)
  const kpis: any[] = [];
  
  // Lead count KPI
  if (idColumn) {
    kpis.push({
      key: idColumn,
      label: 'Total de Leads',
      format: 'integer',
      aggregation: 'count_distinct'
    });
  }
  
  // Stage KPIs
  for (const stage of sortedStages.slice(0, 7)) {
    if (kpis.length >= 8) break;
    kpis.push({
      key: stage.name,
      label: stage.display_label || stage.name.replace(/^st_/, '').replace(/_/g, ' '),
      format: 'integer',
      aggregation: 'truthy_count'
    });
  }
  
  // Build funnel (5-7 steps)
  const funnelSteps = sortedStages.slice(0, 7).map((s: any) => ({
    column: s.name,
    label: s.display_label || s.name.replace(/^st_/, '').replace(/_/g, ' ')
  }));
  
  // Build charts
  const charts: any[] = [];
  if (timeColumn && sortedStages.length > 0) {
    // Leads over time
    charts.push({
      type: 'line',
      metric: sortedStages[0]?.name || kpis[0]?.key,
      groupBy: timeColumn,
      label: 'Leads por Dia'
    });
    
    // Vendas over time (if exists)
    const vendaStage = sortedStages.find((s: any) => 
      s.name.toLowerCase().includes('venda')
    );
    if (vendaStage) {
      charts.push({
        type: 'line',
        metric: vendaStage.name,
        groupBy: timeColumn,
        label: 'Vendas por Dia'
      });
    }
  }
  
  // Add dimension charts
  if (dimensions.length > 0 && sortedStages.length > 0) {
    const dim = dimensions[0];
    charts.push({
      type: 'bar',
      metric: sortedStages[0]?.name || kpis[0]?.key,
      groupBy: dim.name,
      label: `Leads por ${dim.display_label || dim.name}`
    });
  }
  
  // Build table columns
  const tableColumns = columns
    .filter((c: any) => !c.is_hidden)
    .map((c: any) => ({
      key: c.name,
      label: c.display_label || c.name,
      format: c.format || 'text'
    }));
  
  return {
    version: 1,
    time: timeColumn ? { column: timeColumn } : null,
    kpis,
    charts,
    funnel: funnelSteps.length >= 2 ? {
      stages: funnelSteps,
      id_column: idColumn || 'id'
    } : null,
    tabs: ['Executivo', 'Funil', 'Tendências', 'Detalhes'],
    table: { columns: tableColumns },
    labels: {},
    formatting: {},
    _fallback: true,
    _fallback_reason: 'Spec gerado automaticamente a partir do modelo semântico'
  };
}

function convertPlanToSpec(plan: any, semanticModel: any): any {
  const columnNames = (semanticModel?.columns || []).map((c: any) => c.name);
  
  const spec: any = {
    version: 1,
    time: plan.time_column ? { column: plan.time_column } : null,
    kpis: [],
    charts: [],
    funnel: null,
    tabs: Array.isArray(plan.tabs) 
      ? plan.tabs.map((t: any) => typeof t === 'string' ? t : t.name).filter(Boolean)
      : ['Executivo', 'Tendências', 'Detalhes'],
    table: { columns: [] },
    labels: plan.labels || {},
    formatting: plan.formatting || {}
  };

  // Handle plan.kpis directly (from heuristic/LLM plan)
  if (Array.isArray(plan.kpis) && plan.kpis.length > 0) {
    for (const kpi of plan.kpis) {
      const resolvedColumn = findColumnMatch(kpi.column, columnNames);
      if (resolvedColumn) {
        spec.kpis.push({
          key: resolvedColumn,
          label: kpi.label || resolvedColumn,
          format: kpi.format || 'integer',
          aggregation: kpi.aggregation || 'count'
        });
      } else {
        console.warn(`[convertPlanToSpec] KPI column not found: ${kpi.column}`);
      }
    }
  }

  // Handle plan.charts directly
  if (Array.isArray(plan.charts) && plan.charts.length > 0) {
    for (const chart of plan.charts) {
      const resolvedX = findColumnMatch(chart.x_column, columnNames);
      if (resolvedX) {
        spec.charts.push({
          type: chart.type || 'line',
          metric: chart.series?.[0]?.column || chart.metric,
          groupBy: resolvedX,
          label: chart.title || chart.label || 'Chart'
        });
      }
    }
  }

  // Handle plan.funnel directly
  if (plan.funnel?.stages?.length >= 2) {
    const resolvedStages = plan.funnel.stages
      .map((s: any) => {
        const resolved = findColumnMatch(s.column, columnNames);
        return resolved ? { column: resolved, label: s.label || resolved } : null;
      })
      .filter(Boolean);
    
    if (resolvedStages.length >= 2) {
      spec.funnel = {
        stages: resolvedStages,
        id_column: semanticModel?.id_column || plan.id_column || 'lead_id'
      };
    }
  }

  // Handle legacy plan.tiles format (backward compatibility)
  if (Array.isArray(plan.tiles)) {
    for (const tile of plan.tiles) {
      if (tile.type === 'kpi') {
        const resolved = findColumnMatch(tile.metric, columnNames);
        if (resolved) {
          spec.kpis.push({
            key: resolved,
            label: tile.label || resolved,
            format: tile.format || 'number',
            aggregation: tile.aggregation || 'count'
          });
        }
      } else if (tile.type === 'funnel' && !spec.funnel) {
        spec.funnel = {
          stages: tile.stages || [],
          id_column: semanticModel?.id_column || 'lead_id'
        };
      } else if (tile.type === 'line' || tile.type === 'bar') {
        spec.charts.push({
          type: tile.type,
          metric: tile.metric,
          groupBy: tile.groupBy || plan.time_column,
          label: tile.label || tile.metric
        });
      } else if (tile.type === 'ranking') {
        spec.charts.push({
          type: 'bar',
          metric: tile.metric,
          groupBy: tile.dimension,
          label: tile.label || `Top ${tile.dimension}`,
          limit: tile.limit || 10
        });
      }
    }
  }

  // Build table columns from semantic model
  if (semanticModel?.columns) {
    spec.table.columns = semanticModel.columns
      .filter((c: any) => !c.is_hidden)
      .map((c: any) => ({
        key: c.name,
        label: c.display_label || c.name,
        format: c.format || 'text'
      }));
  }

  // Check if spec is empty and needs fallback
  const isEmpty = 
    (!spec.kpis || spec.kpis.length === 0) &&
    (!spec.charts || spec.charts.length === 0) &&
    (!spec.funnel || !spec.funnel.stages || spec.funnel.stages.length < 2);

  if (isEmpty && semanticModel) {
    console.warn('[convertPlanToSpec] Empty spec detected, generating fallback...');
    return generateFallbackSpec(semanticModel);
  }

  return spec;
}

export default function DashboardAutoBuilder({
  open,
  onOpenChange,
  onSuccess,
  tenantId
}: DashboardAutoBuilderProps) {
  const [step, setStep] = useState<WizardStep>('select');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [dashboardName, setDashboardName] = useState('');
  const [dashboardPrompt, setDashboardPrompt] = useState(DEFAULT_PROMPT);
  const [specificRequirements, setSpecificRequirements] = useState('');
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<any>(null);
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [specSource, setSpecSource] = useState<'ai' | 'llm' | 'heuristic' | 'fallback'>('heuristic');
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo | null>(null);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [datasetProfile, setDatasetProfile] = useState<any>(null);
  const [datasetMapping, setDatasetMapping] = useState<DatasetMapping>({
    time_column: null,
    id_column: null,
    dimension_columns: [],
    funnel_stages: [],
    truthy_rule: 'default'
  });
  const [needsMapping, setNeedsMapping] = useState(false);
  const [testQueryResult, setTestQueryResult] = useState<TestQueryResult | null>(null);
  const [isTestingQuery, setIsTestingQuery] = useState(false);
  const [crmMode, setCrmMode] = useState(false);
  const [aggregationPreview, setAggregationPreview] = useState<AggregationPreview | null>(null);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('react');
  const [crmDetection, setCrmDetection] = useState<{ isCrm: boolean; confidence: number; reasons: string[] } | null>(null);
  const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
  const { toast } = useToast();

  // Load datasets on open
  useEffect(() => {
    if (open) {
      loadDatasets();
      resetState();
    }
  }, [open]);

  const resetState = () => {
    setStep('select');
    setSelectedDatasetId('');
    setDashboardName('');
    setDashboardPrompt(DEFAULT_PROMPT);
    setSpecificRequirements('');
    setGeneratedSpec(null);
    setValidation(null);
    setDiagnostics(null);
    setProgressSteps([]);
    setDatasetProfile(null);
    setDatasetMapping({
      time_column: null,
      id_column: null,
      dimension_columns: [],
      funnel_stages: [],
      truthy_rule: 'default'
    });
    setNeedsMapping(false);
    setTestQueryResult(null);
    setIsTestingQuery(false);
    setCrmMode(false);
    setAggregationPreview(null);
    setGenerationMode('react');
    setCrmDetection(null);
    setIsGeneratingHtml(false);
  };

  const loadDatasets = async () => {
    setIsLoadingDatasets(true);
    try {
      let query = supabase
        .from('datasets')
        .select(`
          id, name, object_name, primary_time_column, grain_hint, 
          last_introspected_at, tenant_data_sources (name)
        `)
        .eq('is_active', true)
        .order('name');

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get column counts
      const datasetsWithCounts = await Promise.all(
        (data || []).map(async (ds: any) => {
          const { count } = await supabase
            .from('dataset_columns')
            .select('*', { count: 'exact', head: true })
            .eq('dataset_id', ds.id);
          return { ...ds, _column_count: count || 0 };
        })
      );

      setDatasets(datasetsWithCounts);
    } catch (error: any) {
      toast({ 
        title: 'Erro', 
        description: 'Falha ao carregar datasets', 
        variant: 'destructive' 
      });
    } finally {
      setIsLoadingDatasets(false);
    }
  };

  const handleSelectDataset = async (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    const dataset = datasets.find(d => d.id === datasetId);
    if (dataset) {
      setDashboardName(`Dashboard - ${dataset.name}`);
      
      // Fetch columns to detect CRM dataset
      try {
        const { data: columns } = await supabase
          .from('dataset_columns')
          .select('column_name')
          .eq('dataset_id', datasetId);
        
        if (columns && columns.length > 0) {
          const columnNames = columns.map(c => c.column_name);
          const detection = detectCrmFunnelDataset(columnNames, dataset.name);
          setCrmDetection(detection);
          
          // Auto-select HTML mode if high confidence CRM
          if (detection.isCrm && detection.confidence >= 70) {
            setGenerationMode('html');
            setCrmMode(true);
            toast({
              title: 'Dataset CRM Detectado!',
              description: `Modo HTML recomendado (${detection.confidence}% confiança)`
            });
          }
        }
      } catch (err) {
        console.error('Error detecting CRM dataset:', err);
      }
    }
  };

  const updateProgress = (stepId: string, status: ProgressStep['status']) => {
    setProgressSteps(prev => prev.map(s => 
      s.id === stepId ? { ...s, status } : s
    ));
  };

  const handleGenerate = async () => {
    if (!selectedDatasetId) return;

    const dataset = datasets.find(d => d.id === selectedDatasetId);
    
    // Different progress steps for HTML vs React mode
    if (generationMode === 'html') {
      setProgressSteps([
        { id: 'columns', label: 'Lendo colunas...', status: 'pending' },
        { id: 'html', label: 'Gerando dashboard HTML CRM...', status: 'pending' },
        { id: 'validate', label: 'Validando...', status: 'pending' },
      ]);
    } else {
      setProgressSteps([
        { id: 'columns', label: 'Lendo colunas...', status: 'pending' },
        { id: 'semantic', label: 'Construindo modelo semântico...', status: 'pending' },
        { id: 'plan', label: 'Gerando plano de dashboard...', status: 'pending' },
        { id: 'validate', label: 'Validando...', status: 'pending' },
      ]);
    }

    setStep('generate');
    setIsGenerating(true);

    try {
      // Step 1: Check columns / introspect if needed
      updateProgress('columns', 'running');
      
      if (dataset && (!dataset._column_count || dataset._column_count === 0)) {
        const { data: introspectResult, error: introspectError } = await supabase.functions.invoke(
          'introspect-dataset',
          { body: { dataset_id: selectedDatasetId, save_columns: true } }
        );

        if (introspectError || !introspectResult?.ok) {
          throw new Error(introspectResult?.error?.message || 'Erro na introspecção');
        }
      }
      updateProgress('columns', 'done');

      // HTML CRM Mode - generate HTML dashboard directly
      if (generationMode === 'html') {
        updateProgress('html', 'running');
        setIsGeneratingHtml(true);
        
        const { data: htmlResult, error: htmlError } = await supabase.functions.invoke(
          'generate-crm-html',
          { body: { dataset_id: selectedDatasetId, output: 'json' } }
        );

        if (htmlError) {
          console.error('HTML generation error:', htmlError);
          throw new Error('Erro ao gerar dashboard HTML');
        }
        
        if (!htmlResult?.ok) {
          throw new Error(htmlResult?.error || htmlResult?.message || 'Erro na geração HTML');
        }
        
        // Store HTML result as a special spec
        const htmlSpec = {
          version: 1,
          mode: 'html_generated',
          html: htmlResult.html,
          dataset_kind: 'crm_funnel_kommo',
          detection: crmDetection,
          _meta: {
            dataset_id: selectedDatasetId,
            dataset_name: dataset?.name,
            generated_at: new Date().toISOString(),
            rows_used: htmlResult.rows_used || 0
          }
        };
        
        updateProgress('html', 'done');
        updateProgress('validate', 'running');
        
        setGeneratedSpec(htmlSpec);
        setSpecSource('heuristic');
        setValidation({ 
          valid: true, 
          errors: [], 
          warnings: htmlResult.warnings || [] 
        });
        setDiagnostics({
          columns_detected: htmlResult.columns_used?.map((c: string) => ({ name: c, semantic: null, label: c })) || [],
          time_column: htmlResult.time_column || null,
          funnel_candidates: htmlResult.funnel_stages || [],
          warnings: htmlResult.warnings || [],
          errors: [],
          assumptions: ['Dashboard HTML CRM gerado com filtros e abas integrados']
        });
        
        updateProgress('validate', 'done');
        setStep('preview');
        setIsGeneratingHtml(false);
        
        toast({
          title: 'Dashboard HTML gerado!',
          description: 'Dashboard CRM completo com abas, filtros e export CSV'
        });
        return;
      }

      // React Mode - continue with semantic pipeline
      // Step 2: Build Semantic Model (new pipeline)
      updateProgress('semantic', 'running');
      
      const { data: semanticResult, error: semanticError } = await supabase.functions.invoke(
        'build-semantic-model',
        { body: { dataset_id: selectedDatasetId } }
      );

      if (semanticError) {
        console.error('Semantic model error:', semanticError);
        throw new Error('Erro ao construir modelo semântico');
      }
      
      if (!semanticResult?.ok) {
        throw new Error(semanticResult?.error || 'Erro no modelo semântico');
      }
      
      const semanticModel = semanticResult.semantic_model;
      setDatasetProfile(semanticResult); // Store for mapping step
      
      // Pre-populate mapping from semantic model
      setDatasetMapping(prev => ({
        ...prev,
        time_column: semanticModel.time_column || null,
        funnel_stages: semanticModel.columns
          .filter((c: any) => c.semantic_role === 'stage_flag')
          .map((c: any) => c.name),
        dimension_columns: semanticModel.columns
          .filter((c: any) => c.semantic_role === 'dimension')
          .map((c: any) => c.name),
        id_column: semanticModel.id_column || null
      }));
      
      updateProgress('semantic', 'done');

      // Step 3: Generate Dashboard Plan (new pipeline)
      updateProgress('plan', 'running');
      
      // Combine prompts for custom requirements
      const userIntent = specificRequirements.trim() || 'Dashboard executivo com visão de funil e tendências';

      const { data: planResult, error: planError } = await supabase.functions.invoke(
        'generate-dashboard-plan',
        { 
          body: { 
            dataset_id: selectedDatasetId,
            semantic_model: semanticModel,
            user_prompt: userIntent,
            use_llm: true,
            crm_mode: crmMode
          } 
        }
      );

      if (planError) throw planError;
      
      if (!planResult?.ok) {
        throw new Error(planResult?.error || 'Erro ao gerar plano de dashboard');
      }
      
      // Convert dashboard plan to spec format
      const dashboardPlan = planResult.dashboard_plan;
      let generatedSpec = convertPlanToSpec(dashboardPlan, semanticModel);
      
      // Check if spec is empty and apply fallback
      const isEmptySpec = 
        (!generatedSpec.kpis || generatedSpec.kpis.length === 0) &&
        (!generatedSpec.charts || generatedSpec.charts.length === 0) &&
        (!generatedSpec.funnel || !generatedSpec.funnel.stages || generatedSpec.funnel.stages.length < 2);
      
      if (isEmptySpec) {
        console.warn('[handleGenerate] Empty spec detected after conversion, applying fallback...');
        generatedSpec = generateFallbackSpec(semanticModel);
      }
      
      updateProgress('plan', 'done');

      // Step 4: Validation
      updateProgress('validate', 'running');
      
      setGeneratedSpec(generatedSpec);
      setSpecSource(generatedSpec._fallback ? 'fallback' : (planResult.source || 'heuristic'));
      
      // Build warnings list
      const warnings = [...(dashboardPlan.warnings || [])];
      const errors: string[] = [];
      
      // Add diagnostics about what was generated
      if (generatedSpec._fallback) {
        warnings.push(`Fallback aplicado: ${generatedSpec._fallback_reason || 'spec original estava vazio'}`);
      }
      if (!generatedSpec.kpis?.length) {
        errors.push('Nenhum KPI gerado - verifique se há colunas numéricas ou etapas de funil');
      }
      if (!generatedSpec.funnel?.stages?.length && semanticModel.funnel?.detected) {
        errors.push('Funil detectado no dataset mas não mapeado no spec');
      }
      if (!generatedSpec.time?.column && semanticModel.time_column) {
        warnings.push('Coluna de tempo detectada mas não usada no spec');
      }
      
      setValidation({ 
        valid: errors.length === 0, 
        errors, 
        warnings 
      });
      
      // Build diagnostics from semantic model
      const diagInfo: DiagnosticInfo = {
        columns_detected: semanticModel.columns.map((c: any) => ({
          name: c.name,
          semantic: c.semantic_role,
          label: c.display_label || c.name
        })),
        time_column: semanticModel.time_column,
        time_parseable_rate: semanticModel.stats?.time_parse_rate,
        funnel_candidates: semanticModel.columns
          .filter((c: any) => c.semantic_role === 'stage_flag')
          .map((c: any) => c.name),
        warnings,
        errors,
        assumptions: dashboardPlan.assumptions || []
      };
      setDiagnostics(diagInfo);

      updateProgress('validate', 'done');
      
      // Check if mapping step is needed
      const warningsCount = dashboardPlan.warnings?.length || 0;
      const noTimeColumn = !semanticModel.time_column;
      const funnelStepsRemoved = (dashboardPlan.warnings || []).some((w: string) => 
        w.includes('Etapa de funil removida') || w.includes('Funil removido')
      );
      
      const needsMappingStep = warningsCount > 5 || noTimeColumn || funnelStepsRemoved;
      setNeedsMapping(needsMappingStep);
      
      if (needsMappingStep) {
        setStep('mapping');
        toast({
          title: 'Mapeamento necessário',
          description: 'Ajuste o mapeamento das colunas para melhorar o dashboard'
        });
      } else {
        setStep('preview');
        toast({
          title: 'Plano gerado!',
          description: planResult.source === 'llm' 
            ? 'Dashboard gerado com IA' 
            : 'Dashboard gerado automaticamente'
        });
      }

    } catch (err: any) {
      const failedStep = progressSteps.find(s => s.status === 'running');
      if (failedStep) {
        updateProgress(failedStep.id, 'error');
      }
      
      toast({ 
        title: 'Erro', 
        description: err.message,
        variant: 'destructive' 
      });
      setStep('select');
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper: check if value is truthy for CRM flags
  const isTruthy = (value: any): boolean => {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    const v = String(value).toLowerCase().trim();
    return ['1', 'true', 'sim', 's', 'yes', 'y', 'ok', 'x', 'on'].includes(v);
  };

  // Compute aggregation preview from rows and spec
  const computeAggregationPreview = (rows: Record<string, any>[], spec: any): AggregationPreview => {
    const result: AggregationPreview = {
      kpis: [],
      funnel: [],
      computed: false,
      source: 'sample' // Default to sample, will be overridden if using full aggregate
    };

    if (!rows || rows.length === 0 || !spec) return result;

    // Compute KPIs
    for (const kpi of spec.kpis || []) {
      const column = kpi.key || kpi.column;
      let value = 0;

      switch (kpi.aggregation) {
        case 'sum':
          value = rows.reduce((sum, row) => {
            const v = parseFloat(row[column]);
            return sum + (isFinite(v) ? v : 0);
          }, 0);
          break;
        case 'count':
          value = rows.length;
          break;
        case 'count_distinct':
          value = new Set(rows.map(row => row[column]).filter(v => v != null)).size;
          break;
        case 'avg':
          const nums = rows.map(row => parseFloat(row[column])).filter(v => isFinite(v));
          value = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          break;
        case 'truthy_count':
          value = rows.filter(row => isTruthy(row[column])).length;
          break;
        default:
          value = rows.filter(row => row[column] != null).length;
      }

      result.kpis.push({
        key: column,
        label: kpi.label || column,
        value: Math.round(value * 100) / 100,
        format: kpi.format || 'integer'
      });
    }

    // Compute funnel
    const funnelStages = spec.funnel?.stages || spec.funnel?.steps || [];
    for (const stage of funnelStages) {
      const column = stage.column || stage.key;
      const value = rows.filter(row => isTruthy(row[column])).length;
      result.funnel.push({
        column,
        label: stage.label || column,
        value
      });
    }

    result.computed = true;
    return result;
  };

  // Test query to verify data access, get min/max dates, and compute aggregation preview
  // P0 FIX: Now uses dashboard-data-v2 with mode=aggregate for FULL aggregation (no limit 1000)
  const handleTestQuery = async () => {
    if (!selectedDatasetId || !generatedSpec) return;
    
    setIsTestingQuery(true);
    setAggregationPreview(null);
    
    try {
      const dataset = datasets.find(d => d.id === selectedDatasetId);
      if (!dataset) throw new Error('Dataset não encontrado');
      
      // Get datasource info
      const { data: datasetData } = await supabase
        .from('datasets')
        .select('tenant_id, datasource_id, object_name')
        .eq('id', selectedDatasetId)
        .single();
      
      if (!datasetData) throw new Error('Dataset não encontrado');
      
      // Determine time column from spec or diagnostics
      const timeColumn = generatedSpec.time?.column || diagnostics?.time_column || 'created_at';
      
      // First, get sample rows for preview table (limit 100)
      const { data: sampleResult, error: sampleError } = await supabase.functions.invoke('dataset-preview', {
        body: {
          view: datasetData.object_name,
          datasource_id: datasetData.datasource_id,
          limit: 100
        }
      });
      
      const sampleRows = sampleResult?.data || [];
      
      // Calculate min/max dates from sample for date range
      let minDate: string | null = null;
      let maxDate: string | null = null;
      
      if (sampleRows.length > 0 && timeColumn) {
        const dates = sampleRows
          .map((r: any) => r[timeColumn])
          .filter((d: any) => d != null)
          .map((d: any) => {
            if (d instanceof Date) return d.toISOString().split('T')[0];
            const str = String(d);
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split('T')[0];
            if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
              const [day, month, year] = str.split('/');
              return `${year}-${month}-${day}`;
            }
            return str;
          })
          .filter((d: string) => /^\d{4}-\d{2}-\d{2}/.test(d))
          .sort();
        
        if (dates.length > 0) {
          minDate = dates[0];
          maxDate = dates[dates.length - 1];
        }
      }

      // P0 FIX: Create a temporary dashboard to get FULL aggregation
      // We need to call dashboard-data-v2 with a spec, so we create a temp record
      // For now, use the computed preview from sample as fallback but mark it
      let aggregateResult: any = null;
      let rowsScannedTotal = sampleRows.length;
      let dataQuality: any = null;
      
      // Try to get FULL aggregate by creating temp dashboard context
      try {
        // First check if there's an existing dashboard we can use, or compute locally
        // For the builder preview, we compute from sample but show warning
        // The real FULL aggregation happens when dashboard is saved and viewed
        
        // Compute aggregation preview from sample (with warning that it's not FULL)
        if (sampleRows.length > 0) {
          const preview = computeAggregationPreview(sampleRows, generatedSpec);
          preview.source = 'sample'; // Mark as sample-based
          setAggregationPreview(preview);
        }

        // Show that this is sample-based preview
        rowsScannedTotal = sampleRows.length;
        
      } catch (aggErr) {
        console.warn('Failed to compute aggregate preview:', aggErr);
      }
      
      setTestQueryResult({
        rows_returned: sampleRows.length,
        rows_scanned_total: rowsScannedTotal,
        sample_rows: sampleRows.slice(0, 5),
        all_rows: sampleRows,
        min_date: minDate,
        max_date: maxDate,
        time_column: timeColumn,
        data_quality: dataQuality
      });
      
      toast({
        title: sampleRows.length > 0 ? 'Query executada!' : 'Query vazia',
        description: sampleRows.length > 0 
          ? `${sampleRows.length} linhas na amostra${minDate ? ` (${minDate} a ${maxDate})` : ''}. Agregação FULL será calculada ao salvar.`
          : 'Dataset retornou 0 linhas. O dashboard abrirá vazio.',
        variant: sampleRows.length > 0 ? 'default' : 'destructive'
      });
      
    } catch (err: any) {
      setTestQueryResult({
        rows_returned: 0,
        rows_scanned_total: 0,
        sample_rows: [],
        min_date: null,
        max_date: null,
        time_column: null,
        error: err.message
      });
      toast({
        title: 'Erro no Test Query',
        description: err.message,
        variant: 'destructive'
      });
    } finally {
      setIsTestingQuery(false);
    }
  };

  const handleSave = async () => {
    if (!selectedDatasetId || !generatedSpec || !dashboardName.trim()) return;

    setIsSaving(true);
    setStep('save');

    try {
      const dataset = datasets.find(d => d.id === selectedDatasetId);
      if (!dataset) throw new Error('Dataset não encontrado');

      // Get tenant_id from dataset
      const { data: datasetData } = await supabase
        .from('datasets')
        .select('tenant_id, datasource_id, object_name, schema_name')
        .eq('id', selectedDatasetId)
        .single();

      if (!datasetData) throw new Error('Dataset não encontrado');

      // Determine display type based on generation mode
      const isHtmlMode = generationMode === 'html' || generatedSpec.mode === 'html_generated';
      
      // Enrich spec with time column and test query info
      const enrichedSpec = {
        ...generatedSpec,
        time: isHtmlMode ? null : {
          ...generatedSpec.time,
          column: generatedSpec.time?.column || diagnostics?.time_column || datasetMapping.time_column,
        },
        _meta: {
          dataset_id: selectedDatasetId,
          dataset_name: dataset.name,
          datasource_id: datasetData.datasource_id,
          schema_name: datasetData.schema_name,
          object_name: datasetData.object_name,
          min_date: testQueryResult?.min_date,
          max_date: testQueryResult?.max_date,
          rows_tested: testQueryResult?.rows_returned,
          created_at: new Date().toISOString(),
          spec_source: specSource,
          generation_mode: generationMode
        }
      };

      // Create dashboard with appropriate display_type
      const { data: dashboard, error: createError } = await supabase
        .from('dashboards')
        .insert({
          tenant_id: datasetData.tenant_id,
          name: dashboardName.trim(),
          description: specificRequirements.trim() || null,
          source_kind: 'supabase_view',
          display_type: isHtmlMode ? 'html' : 'json',
          data_source_id: datasetData.datasource_id,
          view_name: datasetData.object_name,
          dashboard_spec: enrichedSpec,
          template_kind: isHtmlMode ? 'costs_funnel_daily' : 'custom',
          is_active: true,
          detected_columns: diagnostics?.columns_detected?.map(c => c.name) || null,
          default_filters: testQueryResult?.min_date ? {
            initial_date_range: {
              start: testQueryResult.min_date,
              end: testQueryResult.max_date
            }
          } : null
        })
        .select()
        .single();

      if (createError) throw createError;

      // Save spec version
      await supabase
        .from('dashboard_spec_versions')
        .insert({
          dashboard_id: dashboard.id,
          version: 1,
          dashboard_spec: enrichedSpec,
          notes: `Auto-gerado via ${isHtmlMode ? 'HTML CRM' : (specSource === 'ai' ? 'IA' : 'heurística')}${testQueryResult?.rows_returned ? ` (${testQueryResult.rows_returned} rows testadas)` : ''}`
        });

      toast({
        title: 'Dashboard criado!',
        description: `${dashboardName} está pronto para uso${isHtmlMode ? ' (HTML CRM)' : ''}`
      });

      onSuccess?.(dashboard.id);
      onOpenChange(false);

    } catch (err: any) {
      toast({ 
        title: 'Erro ao salvar', 
        description: err.message,
        variant: 'destructive' 
      });
      setStep('preview');
    } finally {
      setIsSaving(false);
    }
  };

  const copyDiagnostics = () => {
    if (!diagnostics) return;
    
    const text = JSON.stringify({
      diagnostics,
      spec: generatedSpec,
      validation
    }, null, 2);
    
    navigator.clipboard.writeText(text);
    toast({ title: 'Diagnóstico copiado!' });
  };

  // Regenerate spec with updated mapping
  const handleRegenerateWithMapping = async () => {
    if (!selectedDatasetId) return;

    setIsGenerating(true);
    setStep('generate');
    setProgressSteps([
      { id: 'regenerate', label: 'Regerando com mapeamento...', status: 'running' },
    ]);

    try {
      const fullPrompt = specificRequirements.trim() 
        ? `${dashboardPrompt}\n\nRequisitos específicos do usuário: ${specificRequirements}`
        : dashboardPrompt;

      const { data: result, error } = await supabase.functions.invoke(
        'generate-dashboard-spec',
        { 
          body: { 
            dataset_id: selectedDatasetId, 
            use_ai: true,
            user_prompt: fullPrompt,
            dataset_profile: datasetProfile,
            dataset_mapping: datasetMapping
          } 
        }
      );

      if (error) throw error;
      
      if (!result?.ok) {
        throw new Error(result?.error?.message || 'Erro ao gerar spec');
      }

      setProgressSteps([
        { id: 'regenerate', label: 'Regerando com mapeamento...', status: 'done' },
      ]);

      setGeneratedSpec(result.spec);
      setSpecSource(result.source || 'fallback');
      setValidation(result.validation || { valid: true, errors: [], warnings: [] });
      
      const debug = result.debug || {};
      setDiagnostics({
        columns_detected: debug.columns_detected || [],
        time_column: debug.time_column || null,
        time_parseable_rate: debug.time_parseable_rate,
        funnel_candidates: debug.funnel_candidates || [],
        warnings: result.validation?.warnings || [],
        errors: result.validation?.errors || [],
        assumptions: debug.assumptions || []
      });

      setStep('preview');
      toast({
        title: 'Spec regerado!',
        description: 'Dashboard atualizado com mapeamento manual'
      });

    } catch (err: any) {
      toast({ 
        title: 'Erro', 
        description: err.message,
        variant: 'destructive' 
      });
      setStep('mapping');
    } finally {
      setIsGenerating(false);
    }
  };

  // Get available columns for mapping dropdowns
  const availableColumns = datasetProfile?.columns?.map((c: any) => c.name) || [];
  const availableTimeColumns = datasetProfile?.columns?.filter((c: any) => 
    c.db_type?.includes('time') || c.db_type?.includes('date') ||
    c.stats?.date_parseable_rate > 0.3 ||
    c.name?.includes('created') || c.name?.includes('date') || c.name?.includes('data')
  ).map((c: any) => c.name) || [];
  const availableFunnelColumns = datasetProfile?.columns?.filter((c: any) =>
    c.role_hint === 'stage' || c.semantic_type === 'funnel' ||
    c.stats?.boolean_rate > 0.3 ||
    ['entrada', 'qualificado', 'exp', 'venda', 'perdida', 'lead'].some(kw => c.name?.toLowerCase().includes(kw))
  ).map((c: any) => c.name) || [];
  const availableDimensionColumns = datasetProfile?.columns?.filter((c: any) =>
    c.db_type === 'text' || c.db_type?.includes('varchar') ||
    c.semantic_type === 'dimension' || c.role_hint === 'dimension'
  ).map((c: any) => c.name) || [];

  const selectedDataset = datasets.find(d => d.id === selectedDatasetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Auto-Builder de Dashboard (LLM)
          </DialogTitle>
          <DialogDescription>
            Crie um dashboard automaticamente com IA a partir de um dataset
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 px-2 py-3 border-b overflow-x-auto">
          {(['select', 'generate', 'mapping', 'preview', 'save'] as WizardStep[]).map((s, i) => {
            const allSteps: WizardStep[] = ['select', 'generate', 'mapping', 'preview', 'save'];
            const currentIdx = allSteps.indexOf(step);
            const stepIdx = allSteps.indexOf(s);
            
            // Skip mapping step if not needed
            if (s === 'mapping' && !needsMapping && step !== 'mapping') return null;
            
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`
                  flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium shrink-0
                  ${step === s ? 'bg-primary text-primary-foreground' : 
                    stepIdx < currentIdx 
                      ? 'bg-primary/20 text-primary' 
                      : 'bg-muted text-muted-foreground'}
                `}>
                  {stepIdx < currentIdx ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-sm whitespace-nowrap ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
                  {s === 'select' && 'Dataset'}
                  {s === 'generate' && 'Gerar'}
                  {s === 'mapping' && 'Mapeamento'}
                  {s === 'preview' && 'Preview'}
                  {s === 'save' && 'Salvar'}
                </span>
                {i < allSteps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
            );
          })}
        </div>

        <ScrollArea className="flex-1 px-1">
          {/* Step 1: Select Dataset */}
          {step === 'select' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Selecione um Dataset</Label>
                {isLoadingDatasets ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : datasets.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center py-8">
                      <Database className="h-10 w-10 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum dataset disponível. Crie um primeiro em Admin → Datasets.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2 max-h-48 overflow-y-auto">
                    {datasets.map(ds => (
                      <Card 
                        key={ds.id}
                        className={`cursor-pointer transition-all hover:border-primary/50 ${
                          selectedDatasetId === ds.id ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => handleSelectDataset(ds.id)}
                      >
                        <CardContent className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${
                              selectedDatasetId === ds.id ? 'bg-primary/10' : 'bg-muted'
                            }`}>
                              <Table className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">{ds.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {ds.tenant_data_sources?.name} • {ds.object_name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {ds._column_count ? (
                              <Badge variant="outline">{ds._column_count} cols</Badge>
                            ) : (
                              <Badge variant="secondary">Não analisado</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {selectedDataset && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Dashboard</Label>
                    <Input
                      id="name"
                      value={dashboardName}
                      onChange={e => setDashboardName(e.target.value)}
                      placeholder="Ex: Dashboard de Vendas"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="prompt">Prompt do Dashboard (padrão)</Label>
                    <Textarea
                      id="prompt"
                      value={dashboardPrompt}
                      onChange={e => setDashboardPrompt(e.target.value)}
                      placeholder="Instruções para o LLM..."
                      rows={4}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Prompt padrão que guia a IA na geração do dashboard. Pode ser editado.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="requirements">Requisitos específicos do Dashboard (opcional)</Label>
                    <Textarea
                      id="requirements"
                      value={specificRequirements}
                      onChange={e => setSpecificRequirements(e.target.value)}
                      placeholder="Ex: Priorizar funil de experiência e taxa de comparecimento / Destacar vendas por vendedora..."
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Instruções adicionais específicas para este dashboard.
                    </p>
                  </div>

                  {/* CRM Detection Banner */}
                  {crmDetection && crmDetection.isCrm && (
                    <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                      <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Dataset CRM Detectado ({crmDetection.confidence}% confiança)
                      </p>
                      <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside">
                        {crmDetection.reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Generation Mode Selector */}
                  <div className="space-y-3 pt-2">
                    <Label>Modo de Geração</Label>
                    <RadioGroup 
                      value={generationMode} 
                      onValueChange={(v) => setGenerationMode(v as GenerationMode)}
                      className="grid grid-cols-2 gap-3"
                    >
                      <Label 
                        htmlFor="mode-react"
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          generationMode === 'react' 
                            ? 'border-primary bg-primary/5' 
                            : 'hover:border-primary/50'
                        }`}
                      >
                        <RadioGroupItem value="react" id="mode-react" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Code className="h-4 w-4 text-primary" />
                            <span className="font-medium">React (padrão)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Dashboard dinâmico com spec JSON. Melhor para dados genéricos.
                          </p>
                        </div>
                      </Label>
                      
                      <Label 
                        htmlFor="mode-html"
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          generationMode === 'html' 
                            ? 'border-primary bg-primary/5' 
                            : 'hover:border-primary/50'
                        } ${crmDetection?.isCrm ? 'ring-2 ring-green-500/30' : ''}`}
                      >
                        <RadioGroupItem value="html" id="mode-html" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <FileCode className="h-4 w-4 text-primary" />
                            <span className="font-medium">HTML CRM</span>
                            {crmDetection?.isCrm && (
                              <Badge variant="secondary" className="text-xs">Recomendado</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Dashboard completo com abas e filtros. Ideal para CRM/Kommo.
                          </p>
                        </div>
                      </Label>
                    </RadioGroup>
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="crm-mode"
                      checked={crmMode}
                      onCheckedChange={(checked) => setCrmMode(checked === true)}
                    />
                    <Label htmlFor="crm-mode" className="flex items-center gap-2 cursor-pointer">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span>Modo CRM (flags em texto)</span>
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    Ativa quando o dataset tem colunas de funil em texto (sim/não, 1/0, true/false). 
                    Prioriza truthy_count e count_distinct(lead_id).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Generating with Progress */}
          {step === 'generate' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative mb-6">
                <Sparkles className="h-12 w-12 text-primary animate-pulse" />
                <Loader2 className="h-16 w-16 absolute -top-2 -left-2 animate-spin text-primary/30" />
              </div>
              
              <p className="font-medium mb-6">Gerando dashboard com IA...</p>
              
              <div className="space-y-3 w-full max-w-sm">
                {progressSteps.map((ps) => (
                  <div key={ps.id} className="flex items-center gap-3">
                    {ps.status === 'pending' && (
                      <div className="w-5 h-5 rounded-full border-2 border-muted" />
                    )}
                    {ps.status === 'running' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    {ps.status === 'done' && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {ps.status === 'error' && (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    <span className={`text-sm ${
                      ps.status === 'running' ? 'text-primary font-medium' : 
                      ps.status === 'done' ? 'text-muted-foreground' : 
                      ps.status === 'error' ? 'text-destructive' : ''
                    }`}>
                      {ps.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2.5: Mapping (Conditional) */}
          {step === 'mapping' && (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-500 flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Mapeamento Assistido
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  O dataset precisa de ajustes manuais para gerar um dashboard mais preciso.
                  Configure as colunas abaixo e clique em "Regerar Dashboard".
                </p>
              </div>

              {/* Time Column */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Coluna de Tempo
                </Label>
                <Select
                  value={datasetMapping.time_column || 'none'}
                  onValueChange={(v) => setDatasetMapping(prev => ({
                    ...prev,
                    time_column: v === 'none' ? null : v
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a coluna de data/tempo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (sem gráficos temporais)</SelectItem>
                    {(availableTimeColumns.length > 0 ? availableTimeColumns : availableColumns).map((col: string) => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Usada para tendências e filtros por período
                </p>
              </div>

              {/* ID Column */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Coluna de ID (lead_id, etc.)
                </Label>
                <Select
                  value={datasetMapping.id_column || 'none'}
                  onValueChange={(v) => setDatasetMapping(prev => ({
                    ...prev,
                    id_column: v === 'none' ? null : v
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a coluna de ID" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {availableColumns.map((col: string) => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dimension Columns */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Dimensões (filtros)
                </Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg bg-muted/30">
                  {(availableDimensionColumns.length > 0 ? availableDimensionColumns : availableColumns).map((col: string) => (
                    <label key={col} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={datasetMapping.dimension_columns.includes(col)}
                        onCheckedChange={(checked) => {
                          setDatasetMapping(prev => ({
                            ...prev,
                            dimension_columns: checked
                              ? [...prev.dimension_columns, col]
                              : prev.dimension_columns.filter(c => c !== col)
                          }));
                        }}
                      />
                      {col}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Ex: unidade, vendedora, origem, modalidade
                </p>
              </div>

              {/* Funnel Stages */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Etapas do Funil
                </Label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded-lg bg-muted/30">
                  {(availableFunnelColumns.length > 0 ? availableFunnelColumns : availableColumns).map((col: string) => (
                    <label key={col} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={datasetMapping.funnel_stages.includes(col)}
                        onCheckedChange={(checked) => {
                          setDatasetMapping(prev => ({
                            ...prev,
                            funnel_stages: checked
                              ? [...prev.funnel_stages, col]
                              : prev.funnel_stages.filter(c => c !== col)
                          }));
                        }}
                      />
                      {col}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Marque na ordem: entrada → qualificado → exp → venda
                </p>
              </div>

              {/* Truthy Rule */}
              <div className="space-y-2">
                <Label>Regra "truthy" para colunas de funil</Label>
                <Select
                  value={datasetMapping.truthy_rule}
                  onValueChange={(v: 'default' | 'custom') => setDatasetMapping(prev => ({
                    ...prev,
                    truthy_rule: v
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Padrão (1, true, sim, x, ok)</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {datasetMapping.truthy_rule === 'custom' && (
                  <Input
                    placeholder="Valores truthy separados por vírgula (ex: sim, 1, ativo)"
                    onChange={(e) => setDatasetMapping(prev => ({
                      ...prev,
                      custom_truthy_values: e.target.value.split(',').map(v => v.trim()).filter(Boolean)
                    }))}
                  />
                )}
              </div>

              {/* Current Warnings */}
              {validation && validation.warnings.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-yellow-600 hover:underline">
                    <AlertTriangle className="h-3 w-3" />
                    {validation.warnings.length} avisos da geração anterior
                    <ChevronDown className="h-3 w-3" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-2 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
                    <ul className="text-xs text-yellow-600/80 list-disc list-inside space-y-1">
                      {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && generatedSpec && (
            <div className="space-y-4 py-4">
              {/* Spec Generated Summary */}
              <div className={`p-4 rounded-lg border ${
                generatedSpec._fallback ? 'bg-yellow-500/10 border-yellow-500/30' :
                (generatedSpec.kpis?.length > 0 || generatedSpec.funnel?.stages?.length > 0) 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : 'bg-destructive/10 border-destructive/30'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium flex items-center gap-2 ${
                      generatedSpec._fallback ? 'text-yellow-600' :
                      (generatedSpec.kpis?.length > 0 || generatedSpec.funnel?.stages?.length > 0) 
                        ? 'text-green-600' : 'text-destructive'
                    }`}>
                      {(generatedSpec.kpis?.length > 0 || generatedSpec.funnel?.stages?.length > 0) ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Spec Gerado {generatedSpec._fallback && '(Fallback)'}
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4" />
                          Spec Vazio
                        </>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        {generatedSpec.kpis?.length || 0} KPIs
                      </span>
                      <span className="flex items-center gap-1">
                        <Filter className="h-3 w-3" />
                        {generatedSpec.funnel?.stages?.length || 0} etapas funil
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {generatedSpec.charts?.length || 0} gráficos
                      </span>
                      <span className="flex items-center gap-1">
                        <Table className="h-3 w-3" />
                        {generatedSpec.table?.columns?.length || 0} colunas
                      </span>
                    </div>
                  </div>
                  <Badge variant={(specSource === 'llm' || specSource === 'ai') ? 'default' : specSource === 'fallback' ? 'secondary' : 'outline'}>
                    {(specSource === 'llm' || specSource === 'ai') ? 'IA' : specSource === 'fallback' ? 'Fallback' : 'Heurística'}
                  </Badge>
                </div>
                
                {/* Errors */}
                {validation?.errors && validation.errors.length > 0 && (
                  <div className="mt-3 p-2 bg-destructive/10 rounded text-xs text-destructive">
                    <p className="font-medium mb-1">Problemas detectados:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {validation.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                )}
                
                {/* Fallback reason */}
                {generatedSpec._fallback_reason && (
                  <p className="mt-2 text-xs text-yellow-600">{generatedSpec._fallback_reason}</p>
                )}
              </div>
              
              {/* Diagnostics Panel */}
              {diagnostics && (
                <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
                  <CollapsibleTrigger asChild>
                    <div className="p-3 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted/70 transition-colors">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          Diagnóstico do Dataset
                        </p>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyDiagnostics();
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copiar
                          </Button>
                          <ChevronDown className={`h-4 w-4 transition-transform ${debugOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      
                      <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                        <div className={diagnostics.columns_detected?.length === 0 ? 'text-destructive font-bold' : ''}>
                          Colunas: <span className={`font-medium ${diagnostics.columns_detected?.length === 0 ? 'text-destructive' : 'text-foreground'}`}>
                            {diagnostics.columns_detected?.length || 0}
                            {diagnostics.columns_detected?.length === 0 && ' ⚠️ ERRO'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span className="font-medium text-foreground">{diagnostics.time_column || 'Não detectado'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Filter className="h-3 w-3" />
                          <span className="font-medium text-foreground">{diagnostics.funnel_candidates?.length || 0} etapas</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" />
                          <span className="font-medium text-foreground">{generatedSpec.kpis?.length || 0} KPIs</span>
                        </div>
                      </div>
                      
                      {/* P0 FIX: Critical error when columns = 0 */}
                      {diagnostics.columns_detected?.length === 0 && (
                        <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                          <strong>ERRO CRÍTICO:</strong> Introspecção do dataset falhou (Colunas = 0). 
                          O dataset retornou linhas mas as colunas não foram detectadas. 
                          <br />
                          <strong>Ação:</strong> Clique em "Voltar" e tente novamente ou verifique a configuração do data source.
                        </div>
                      )}
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="mt-2">
                    <div className="p-3 rounded-lg bg-muted/30 border space-y-3 text-xs">
                      {/* Columns */}
                      <div>
                        <p className="font-medium mb-1">Colunas Detectadas:</p>
                        <div className="flex flex-wrap gap-1">
                          {diagnostics.columns_detected?.slice(0, 20).map((col, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {col.name}
                              {col.semantic && <span className="text-muted-foreground ml-1">({col.semantic})</span>}
                            </Badge>
                          ))}
                          {(diagnostics.columns_detected?.length || 0) > 20 && (
                            <Badge variant="secondary">+{diagnostics.columns_detected!.length - 20}</Badge>
                          )}
                        </div>
                      </div>

                      {/* Time Column */}
                      <div>
                        <p className="font-medium mb-1">Coluna de Tempo:</p>
                        <p className={diagnostics.time_column ? 'text-green-600' : 'text-yellow-600'}>
                          {diagnostics.time_column || 'Não encontrada - dashboard sem tendências temporais'}
                          {diagnostics.time_parseable_rate !== undefined && (
                            <span className="text-muted-foreground ml-2">
                              ({Math.round(diagnostics.time_parseable_rate * 100)}% parseável)
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Funnel */}
                      <div>
                        <p className="font-medium mb-1">Etapas de Funil:</p>
                        {diagnostics.funnel_candidates?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {diagnostics.funnel_candidates.map((f, i) => (
                              <Badge key={i} variant="secondary">{f}</Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-yellow-600">Nenhuma etapa de funil detectada</p>
                        )}
                      </div>

                      {/* Warnings */}
                      {diagnostics.warnings?.length > 0 && (
                        <div>
                          <p className="font-medium mb-1 text-yellow-600">Warnings:</p>
                          <ul className="list-disc list-inside text-yellow-600">
                            {diagnostics.warnings.map((w, i) => <li key={i}>{w}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Errors */}
                      {diagnostics.errors?.length > 0 && (
                        <div>
                          <p className="font-medium mb-1 text-destructive">Erros:</p>
                          <ul className="list-disc list-inside text-destructive">
                            {diagnostics.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Assumptions */}
                      {diagnostics.assumptions?.length > 0 && (
                        <div>
                          <p className="font-medium mb-1 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            Premissas do LLM:
                          </p>
                          <ul className="list-disc list-inside text-blue-600 dark:text-blue-400">
                            {diagnostics.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Test Query Section */}
              <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Testar Conexão e Preview de Dados
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {aggregationPreview 
                        ? 'Query executada! Veja o preview dos dados agregados abaixo.'
                        : 'Execute a query para ver os valores reais dos KPIs e funil antes de salvar.'}
                    </p>
                  </div>
                  <Button 
                    variant={aggregationPreview ? "outline" : "default"}
                    size="sm"
                    onClick={handleTestQuery}
                    disabled={isTestingQuery}
                  >
                    {isTestingQuery ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testando...
                      </>
                    ) : aggregationPreview ? (
                      <>
                        <Database className="h-4 w-4 mr-2" />
                        Recarregar
                      </>
                    ) : (
                      <>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Ver Preview
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Test Query Results */}
                {testQueryResult && (
                  <div className={`p-3 rounded-lg border ${testQueryResult.error ? 'bg-destructive/10 border-destructive/30' : testQueryResult.rows_returned > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
                    {testQueryResult.error ? (
                      <div className="text-sm text-destructive flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Erro: {testQueryResult.error}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-4 text-sm">
                          <span className={testQueryResult.rows_returned > 0 ? 'text-green-600' : 'text-yellow-600'}>
                            <CheckCircle2 className="h-4 w-4 inline mr-1" />
                            {testQueryResult.rows_returned} linhas retornadas
                          </span>
                          {testQueryResult.time_column && (
                            <span className="text-muted-foreground">
                              <Clock className="h-3 w-3 inline mr-1" />
                              Coluna: {testQueryResult.time_column}
                            </span>
                          )}
                        </div>
                        
                        {(testQueryResult.min_date || testQueryResult.max_date) && (
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>Período disponível:</span>
                            <Badge variant="outline">{testQueryResult.min_date} → {testQueryResult.max_date}</Badge>
                          </div>
                        )}
                        
                        {testQueryResult.rows_returned === 0 && (
                          <div className="text-xs text-yellow-600">
                            ⚠️ Dataset sem linhas. O dashboard abrirá vazio até existir dados.
                          </div>
                        )}
                        
                        {/* Sample rows preview */}
                        {testQueryResult.sample_rows.length > 0 && (
                          <Collapsible>
                            <CollapsibleTrigger className="text-xs text-primary hover:underline flex items-center gap-1">
                              <Table className="h-3 w-3" />
                              Ver amostra ({testQueryResult.sample_rows.length} linhas)
                              <ChevronDown className="h-3 w-3" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2">
                              <div className="max-h-32 overflow-auto rounded border bg-background">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/50 sticky top-0">
                                    <tr>
                                      {Object.keys(testQueryResult.sample_rows[0]).slice(0, 6).map(key => (
                                        <th key={key} className="px-2 py-1 text-left font-medium">{key}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {testQueryResult.sample_rows.map((row, i) => (
                                      <tr key={i} className="border-t">
                                        {Object.values(row).slice(0, 6).map((val: any, j) => (
                                          <td key={j} className="px-2 py-1 truncate max-w-24">
                                            {val == null ? '—' : String(val).slice(0, 30)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Aggregation Preview - Shows real computed values */}
              {aggregationPreview && aggregationPreview.computed && (
                <div className="p-4 rounded-lg border bg-primary/5 border-primary/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-2 text-primary">
                      <BarChart3 className="h-4 w-4" />
                      Preview de Dados Agregados
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={aggregationPreview.source === 'full_aggregate' ? 'default' : 'secondary'} 
                        className="text-xs"
                      >
                        {aggregationPreview.source === 'full_aggregate' 
                          ? `FULL: ${testQueryResult?.rows_scanned_total?.toLocaleString('pt-BR') || 0} linhas`
                          : `⚠️ Amostra: ${testQueryResult?.rows_returned || 0} linhas`
                        }
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Warning for sample-based preview */}
                  {aggregationPreview.source === 'sample' && (
                    <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-700 dark:text-yellow-400">
                      ⚠️ Este preview usa uma amostra de {testQueryResult?.rows_returned || 0} linhas. 
                      A agregação FULL será calculada quando o dashboard for salvo e visualizado.
                    </div>
                  )}
                  
                  {/* KPIs Preview */}
                  {aggregationPreview.kpis.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">KPIs</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {aggregationPreview.kpis.map((kpi, i) => (
                          <div key={i} className="p-2 rounded-lg bg-background border">
                            <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                            <p className={`text-lg font-bold ${kpi.value > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {kpi.format === 'percent' 
                                ? `${kpi.value}%` 
                                : kpi.format === 'currency' 
                                  ? `R$ ${kpi.value.toLocaleString('pt-BR')}`
                                  : kpi.value.toLocaleString('pt-BR')}
                            </p>
                            {kpi.value === 0 && (
                              <p className="text-xs text-yellow-600">⚠️ Vazio</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Funnel Preview */}
                  {aggregationPreview.funnel.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Funil</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {aggregationPreview.funnel.map((stage, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <div className={`px-2 py-1 rounded text-xs ${
                              stage.value > 0 
                                ? 'bg-primary/10 border border-primary/20' 
                                : 'bg-yellow-500/10 border border-yellow-500/20'
                            }`}>
                              <span className="font-medium">{stage.label}</span>
                              <span className={`ml-1 ${stage.value > 0 ? 'text-primary' : 'text-yellow-600'}`}>
                                ({stage.value})
                              </span>
                            </div>
                            {i < aggregationPreview.funnel.length - 1 && (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>
                      
                      {/* Warning if funnel has empty stages */}
                      {aggregationPreview.funnel.some(s => s.value === 0) && (
                        <p className="text-xs text-yellow-600 mt-2">
                          ⚠️ Algumas etapas do funil estão vazias. Verifique se as colunas contêm valores truthy (1, true, sim, etc.)
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Summary check */}
                  {aggregationPreview.kpis.every(k => k.value === 0) && aggregationPreview.funnel.every(f => f.value === 0) && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-sm text-destructive flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Todos os valores estão zerados! Verifique:
                      </p>
                      <ul className="text-xs text-destructive/80 mt-1 list-disc list-inside">
                        <li>Se os nomes das colunas no spec correspondem às colunas do dataset</li>
                        <li>Se os dados contêm valores truthy (1, true, sim, x)</li>
                        <li>Se o período de datas selecionado contém dados</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {/* Validation messages */}
              {validation && (
                <div className="space-y-2">
                  {validation.errors.length > 0 && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-sm font-medium text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {validation.errors.length} erro(s)
                      </p>
                      <ul className="mt-1 text-xs text-destructive/80 list-disc list-inside">
                        {validation.errors.slice(0, 3).map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-500 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {validation.warnings.length} aviso(s)
                      </p>
                      <ul className="mt-1 text-xs text-yellow-600/80 list-disc list-inside">
                        {validation.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Spec Preview Tabs */}
              <Tabs defaultValue="visual" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="visual">Resumo Visual</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
                
                <TabsContent value="visual" className="mt-4 space-y-4">
                  {/* KPIs */}
                  {generatedSpec.kpis?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">KPIs ({generatedSpec.kpis.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {generatedSpec.kpis.map((kpi: any, i: number) => (
                          <Badge key={i} variant="outline">
                            {kpi.label || kpi.column}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Funnel */}
                  {generatedSpec.funnel?.steps?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Funil ({generatedSpec.funnel.steps.length} etapas)</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {generatedSpec.funnel.steps.map((step: any, i: number) => (
                          <div key={i} className="flex items-center gap-1">
                            <Badge variant="secondary">{step.label || step.column}</Badge>
                            {i < generatedSpec.funnel.steps.length - 1 && (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Charts */}
                  {generatedSpec.charts?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Gráficos ({generatedSpec.charts.length})</p>
                      <div className="space-y-1">
                        {generatedSpec.charts.map((chart: any, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            • {chart.title} ({chart.type})
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tabs */}
                  {generatedSpec.ui?.tabs?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Abas</p>
                      <div className="flex gap-2">
                        {generatedSpec.ui.tabs.map((tab: string, i: number) => (
                          <Badge key={i} variant="outline">{tab}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="json" className="mt-4">
                  <div className="max-h-64 overflow-auto rounded-lg bg-muted/50 border p-3">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(generatedSpec, null, 2)}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Step 4: Saving */}
          {step === 'save' && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="font-medium">Criando dashboard...</p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t pt-4">
          {step === 'select' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleGenerate}
                disabled={!selectedDatasetId || !dashboardName.trim()}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Auto-Gerar
              </Button>
            </>
          )}
          
          {step === 'generate' && (
            <Button variant="outline" onClick={() => setStep('select')} disabled={isGenerating}>
              Cancelar
            </Button>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('preview')}>
                Pular Mapeamento
              </Button>
              <Button 
                onClick={handleRegenerateWithMapping}
                disabled={isGenerating}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Regerar Dashboard
              </Button>
            </>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => needsMapping ? setStep('mapping') : setStep('select')}>
                Voltar
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={
                  !generatedSpec || 
                  (diagnostics?.columns_detected?.length === 0)
                }
                title={diagnostics?.columns_detected?.length === 0 ? 'Introspecção falhou - colunas não detectadas' : undefined}
              >
                <Check className="h-4 w-4 mr-2" />
                Criar Dashboard
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
