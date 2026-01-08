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
  MapPin
} from 'lucide-react';
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
  sample_rows: Record<string, any>[];
  min_date: string | null;
  max_date: string | null;
  time_column: string | null;
  error?: string;
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

const DEFAULT_PROMPT = `Você é um especialista em BI para CRM e tráfego pago.
Sua tarefa é gerar um DashboardSpec (JSON) para um SaaS de dashboards, usando APENAS as colunas fornecidas no dataset profile.
O dashboard deve seguir um layout padrão em abas: Decisões, Executivo, Funil, Tendências, Detalhes.

Regras:
- Nunca referencie colunas que não existam (use match case-insensitive e normalize underscores).
- Se não houver coluna de data válida, ainda assim gere um dashboard útil com KPIs + Funil total + Detalhes (sem séries temporais).
- Para campos de funil em texto (ex.: entrada, qualificado, venda), trate como boolean "truthy" (1/true/sim/x/ok) e gere contagens.
- KPIs devem ser poucos (máximo 8) e focados em tomada de decisão.
- Tendências: se existir data, use séries por dia com métricas principais.
- Detalhes: sempre incluir tabela completa com export CSV.

Saída obrigatória: um JSON válido no schema DashboardSpec v1 contendo time, kpis, charts, tabs, table.`;

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
  const [specSource, setSpecSource] = useState<'ai' | 'fallback'>('fallback');
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

  const handleSelectDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    const dataset = datasets.find(d => d.id === datasetId);
    if (dataset) {
      setDashboardName(`Dashboard - ${dataset.name}`);
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
    
    // Initialize progress steps
    setProgressSteps([
      { id: 'columns', label: 'Lendo colunas...', status: 'pending' },
      { id: 'sample', label: 'Amostrando dados...', status: 'pending' },
      { id: 'generate', label: 'Gerando spec...', status: 'pending' },
      { id: 'validate', label: 'Validando...', status: 'pending' },
    ]);

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

      // Step 2: Get dataset profile
      updateProgress('sample', 'running');
      
      const { data: profileResult, error: profileError } = await supabase.functions.invoke(
        'dataset-profile',
        { body: { dataset_id: selectedDatasetId, sample_limit: 200 } }
      );

      if (profileError) {
        console.error('Profile error:', profileError);
        // Continue without profile - fallback will handle it
      }
      
      // Store profile for mapping step
      setDatasetProfile(profileResult);
      
      // Pre-populate mapping from profile
      if (profileResult?.detected_candidates) {
        const candidates = profileResult.detected_candidates;
        setDatasetMapping(prev => ({
          ...prev,
          time_column: candidates.time_columns?.[0]?.name || null,
          funnel_stages: candidates.funnel_stages?.map((f: any) => f.name) || [],
          dimension_columns: candidates.dimension_columns || [],
          id_column: profileResult.columns?.find((c: any) => 
            c.name?.toLowerCase().includes('lead_id') || 
            c.name?.toLowerCase().includes('id')
          )?.name || null
        }));
      }
      
      updateProgress('sample', 'done');

      // Step 3: Generate spec with LLM
      updateProgress('generate', 'running');
      
      // Combine prompts
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
            dataset_profile: profileResult || null,
            dataset_mapping: datasetMapping
          } 
        }
      );

      if (error) throw error;
      
      if (!result?.ok) {
        throw new Error(result?.error?.message || 'Erro ao gerar spec');
      }
      updateProgress('generate', 'done');

      // Step 4: Validation
      updateProgress('validate', 'running');
      
      setGeneratedSpec(result.spec);
      setSpecSource(result.source || 'fallback');
      setValidation(result.validation || { valid: true, errors: [], warnings: [] });
      
      // Build diagnostics from debug info
      const debug = result.debug || {};
      const diagInfo: DiagnosticInfo = {
        columns_detected: debug.columns_detected || [],
        time_column: debug.time_column || null,
        time_parseable_rate: debug.time_parseable_rate,
        funnel_candidates: debug.funnel_candidates || [],
        warnings: result.validation?.warnings || [],
        errors: result.validation?.errors || [],
        assumptions: debug.assumptions || []
      };
      setDiagnostics(diagInfo);

      updateProgress('validate', 'done');
      
      // Check if mapping step is needed
      const warningsCount = result.validation?.warnings?.length || 0;
      const noTimeColumn = !debug.time_column;
      const funnelStepsRemoved = (result.validation?.warnings || []).some((w: string) => 
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
          title: 'Spec gerado!',
          description: result.source === 'ai' 
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

  // Test query to verify data access and get min/max dates
  const handleTestQuery = async () => {
    if (!selectedDatasetId || !generatedSpec) return;
    
    setIsTestingQuery(true);
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
      
      // Call dashboard-data edge function with a wide date range to test connectivity
      const { data: result, error } = await supabase.functions.invoke('dashboard-data', {
        body: {
          // Direct mode: pass view + datasource_id explicitly
          view: datasetData.object_name,
          datasource_id: datasetData.datasource_id,
          start: '2020-01-01',
          end: '2030-12-31',
          limit: '100'
        }
      });
      
      if (error) {
        setTestQueryResult({
          rows_returned: 0,
          sample_rows: [],
          min_date: null,
          max_date: null,
          time_column: timeColumn,
          error: error.message || 'Erro ao executar query'
        });
        return;
      }
      
      const rows = result?.data || [];
      
      // Calculate min/max dates
      let minDate: string | null = null;
      let maxDate: string | null = null;
      
      if (rows.length > 0 && timeColumn) {
        const dates = rows
          .map((r: any) => r[timeColumn])
          .filter((d: any) => d != null)
          .map((d: any) => {
            if (d instanceof Date) return d.toISOString().split('T')[0];
            const str = String(d);
            // Try to parse various formats
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
      
      setTestQueryResult({
        rows_returned: rows.length,
        sample_rows: rows.slice(0, 5),
        min_date: minDate,
        max_date: maxDate,
        time_column: timeColumn
      });
      
      toast({
        title: rows.length > 0 ? 'Query executada!' : 'Query vazia',
        description: rows.length > 0 
          ? `${rows.length} linhas encontradas${minDate ? ` (${minDate} a ${maxDate})` : ''}`
          : 'Dataset retornou 0 linhas. O dashboard abrirá vazio.',
        variant: rows.length > 0 ? 'default' : 'destructive'
      });
      
    } catch (err: any) {
      setTestQueryResult({
        rows_returned: 0,
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

      // Enrich spec with time column and test query info
      const enrichedSpec = {
        ...generatedSpec,
        time: {
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
          spec_source: specSource
        }
      };

      // Create dashboard
      const { data: dashboard, error: createError } = await supabase
        .from('dashboards')
        .insert({
          tenant_id: datasetData.tenant_id,
          name: dashboardName.trim(),
          description: specificRequirements.trim() || null,
          source_kind: 'supabase_view',
          display_type: 'json',
          data_source_id: datasetData.datasource_id,
          view_name: datasetData.object_name,
          dashboard_spec: enrichedSpec,
          template_kind: 'custom',
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
          notes: `Auto-gerado via ${specSource === 'ai' ? 'IA' : 'heurística'}${testQueryResult?.rows_returned ? ` (${testQueryResult.rows_returned} rows testadas)` : ''}`
        });

      toast({
        title: 'Dashboard criado!',
        description: `${dashboardName} está pronto para uso`
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
              {/* Spec Empty Warning */}
              {(!generatedSpec.kpis?.length && !generatedSpec.charts?.length && !generatedSpec.funnel?.steps?.length) && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                  <p className="text-sm font-medium text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Spec Vazio Detectado
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O auto-builder não conseguiu gerar KPIs, gráficos ou funil. 
                    Verifique se o dataset foi introspectado corretamente.
                  </p>
                </div>
              )}
              
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
                        <div>Colunas: <span className="font-medium text-foreground">{diagnostics.columns_detected?.length || 0}</span></div>
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
                      Testar Conexão com Dataset
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Executa uma query real para verificar conectividade e período de dados
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleTestQuery}
                    disabled={isTestingQuery}
                  >
                    {isTestingQuery ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testando...
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4 mr-2" />
                        Test Query
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
              <Button onClick={handleSave} disabled={!generatedSpec}>
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
