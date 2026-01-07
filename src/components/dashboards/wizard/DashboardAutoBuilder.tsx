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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Wand2, 
  Loader2, 
  Check, 
  AlertTriangle, 
  Database,
  BarChart3,
  Table,
  Sparkles,
  ChevronRight,
  Eye
} from 'lucide-react';

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

type WizardStep = 'select' | 'generate' | 'preview' | 'save';

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
  const [dashboardDescription, setDashboardDescription] = useState('');
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
    setDashboardDescription('');
    setGeneratedSpec(null);
    setValidation(null);
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

  const handleGenerate = async () => {
    if (!selectedDatasetId) return;

    const dataset = datasets.find(d => d.id === selectedDatasetId);
    
    // Check if dataset has columns
    if (dataset && (!dataset._column_count || dataset._column_count === 0)) {
      // Introspect first
      toast({ 
        title: 'Analisando dataset...', 
        description: 'Detectando colunas automaticamente'
      });
      
      try {
        const { data: introspectResult, error: introspectError } = await supabase.functions.invoke(
          'introspect-dataset',
          { body: { dataset_id: selectedDatasetId, save_columns: true } }
        );

        if (introspectError || !introspectResult?.ok) {
          throw new Error(introspectResult?.error?.message || 'Erro na introspecção');
        }
      } catch (err: any) {
        toast({ 
          title: 'Erro', 
          description: `Falha ao analisar dataset: ${err.message}`,
          variant: 'destructive'
        });
        return;
      }
    }

    setStep('generate');
    setIsGenerating(true);

    try {
      const { data: result, error } = await supabase.functions.invoke(
        'generate-dashboard-spec',
        { body: { dataset_id: selectedDatasetId, use_ai: true } }
      );

      if (error) throw error;
      
      if (!result?.ok) {
        throw new Error(result?.error?.message || 'Erro ao gerar spec');
      }

      setGeneratedSpec(result.spec);
      setSpecSource(result.source || 'fallback');
      setValidation(result.validation || { valid: true, errors: [], warnings: [] });
      setStep('preview');

      toast({
        title: 'Spec gerado!',
        description: result.source === 'ai' 
          ? 'Dashboard gerado com IA' 
          : 'Dashboard gerado automaticamente'
      });

    } catch (err: any) {
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
        .select('tenant_id, datasource_id, object_name')
        .eq('id', selectedDatasetId)
        .single();

      if (!datasetData) throw new Error('Dataset não encontrado');

      // Create dashboard
      const { data: dashboard, error: createError } = await supabase
        .from('dashboards')
        .insert({
          tenant_id: datasetData.tenant_id,
          name: dashboardName.trim(),
          description: dashboardDescription.trim() || null,
          source_kind: 'supabase_view',
          display_type: 'json',
          data_source_id: datasetData.datasource_id,
          view_name: datasetData.object_name,
          dashboard_spec: generatedSpec,
          template_kind: 'custom',
          is_active: true
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
          dashboard_spec: generatedSpec,
          notes: `Auto-gerado via ${specSource === 'ai' ? 'IA' : 'heurística'}`
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

  const selectedDataset = datasets.find(d => d.id === selectedDatasetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Auto-Builder de Dashboard
          </DialogTitle>
          <DialogDescription>
            Crie um dashboard automaticamente a partir de um dataset
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 px-2 py-3 border-b">
          {(['select', 'generate', 'preview', 'save'] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`
                flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium
                ${step === s ? 'bg-primary text-primary-foreground' : 
                  i < ['select', 'generate', 'preview', 'save'].indexOf(step) 
                    ? 'bg-primary/20 text-primary' 
                    : 'bg-muted text-muted-foreground'}
              `}>
                {i < ['select', 'generate', 'preview', 'save'].indexOf(step) ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-sm ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
                {s === 'select' && 'Dataset'}
                {s === 'generate' && 'Gerar'}
                {s === 'preview' && 'Preview'}
                {s === 'save' && 'Salvar'}
              </span>
              {i < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
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
                  <div className="grid gap-2">
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
                            {ds.primary_time_column && (
                              <Badge variant="outline" className="text-xs">
                                {ds.grain_hint || 'daily'}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {selectedDataset && (
                <div className="space-y-3 pt-4 border-t">
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
                    <Label htmlFor="desc">Descrição (opcional)</Label>
                    <Textarea
                      id="desc"
                      value={dashboardDescription}
                      onChange={e => setDashboardDescription(e.target.value)}
                      placeholder="Descreva o objetivo do dashboard..."
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Generating */}
          {step === 'generate' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <Sparkles className="h-12 w-12 text-primary animate-pulse" />
                <Loader2 className="h-16 w-16 absolute -top-2 -left-2 animate-spin text-primary/30" />
              </div>
              <p className="mt-4 font-medium">Gerando dashboard com IA...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Analisando colunas e criando layout otimizado
              </p>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && generatedSpec && (
            <div className="space-y-4 py-4">
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
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                      <p className="text-sm font-medium text-warning flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {validation.warnings.length} aviso(s)
                      </p>
                      <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                        {validation.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Spec preview */}
              <Tabs defaultValue="visual" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="visual" className="flex-1">
                    <Eye className="h-4 w-4 mr-1" />
                    Visual
                  </TabsTrigger>
                  <TabsTrigger value="json" className="flex-1">
                    JSON
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="visual" className="space-y-4">
                  {/* KPIs Preview */}
                  {generatedSpec.kpis?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">KPIs ({generatedSpec.kpis.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {generatedSpec.kpis.map((kpi: any, i: number) => (
                            <Badge key={i} variant="outline">
                              {kpi.label}
                              <span className="ml-1 text-muted-foreground">
                                ({kpi.agg})
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Funnel Preview */}
                  {generatedSpec.funnel?.steps?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Funil ({generatedSpec.funnel.steps.length} etapas)</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {generatedSpec.funnel.steps.map((step: any, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              <Badge>{step.label}</Badge>
                              {i < generatedSpec.funnel.steps.length - 1 && (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Charts Preview */}
                  {generatedSpec.charts?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Gráficos ({generatedSpec.charts.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <div className="space-y-2">
                          {generatedSpec.charts.map((chart: any, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              <BarChart3 className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{chart.title}</span>
                              <Badge variant="outline" className="text-xs">
                                {chart.type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {chart.series?.length || 0} séries
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Tabs Preview */}
                  {generatedSpec.ui?.tabs && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Abas do Dashboard</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <div className="flex gap-2 flex-wrap">
                          {generatedSpec.ui.tabs.map((tab: string, i: number) => (
                            <Badge 
                              key={i} 
                              variant={tab === generatedSpec.ui.defaultTab ? 'default' : 'outline'}
                            >
                              {tab}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4" />
                    Gerado via {specSource === 'ai' ? 'Inteligência Artificial' : 'Heurística'}
                  </div>
                </TabsContent>

                <TabsContent value="json">
                  <Card>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[300px]">
                        <pre className="p-4 text-xs overflow-x-auto">
                          {JSON.stringify(generatedSpec, null, 2)}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Step 4: Saving */}
          {step === 'save' && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 font-medium">Salvando dashboard...</p>
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
                <Wand2 className="h-4 w-4 mr-2" />
                Auto-Gerar
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>
                Voltar
              </Button>
              <Button 
                onClick={handleSave}
                disabled={!validation?.valid && validation?.errors?.length > 0}
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
