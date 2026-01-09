import { useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Wand2, 
  Play, 
  Check, 
  X, 
  AlertTriangle, 
  Code, 
  Eye, 
  History, 
  RotateCcw,
  Loader2,
  FileCode,
  ListChecks,
  Info
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AIEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  dashboardName: string;
  currentSpec: Record<string, any>;
  currentVersion: number;
  onSpecUpdated?: () => void;
}

interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: any;
  from?: string;
}

interface SimulationResult {
  valid: boolean;
  new_spec: Record<string, any>;
  diff_summary: string[];
  validation_errors: string[];
  validation_warnings: string[];
  preview_metrics?: {
    kpis_count: number;
    charts_count: number;
    tabs: string[];
  };
}

interface PatchResult {
  ok: boolean;
  patch: PatchOperation[];
  summary: string[];
  warnings: string[];
  confidence: number;
  trace_id: string;
}

export default function AIEditDrawer({
  open,
  onOpenChange,
  dashboardId,
  dashboardName,
  currentSpec,
  currentVersion,
  onSpecUpdated,
}: AIEditDrawerProps) {
  const { toast } = useToast();
  
  // State
  const [userRequest, setUserRequest] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  
  // Results
  const [patchResult, setPatchResult] = useState<PatchResult | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  
  // Versions history
  const [versions, setVersions] = useState<Array<{ version: number; created_at: string; notes?: string }>>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Generate patch from AI
  const handleGenerate = useCallback(async () => {
    if (!userRequest.trim()) {
      toast({
        title: 'Digite o que deseja mudar',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setPatchResult(null);
    setSimulationResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-dashboard-edit', {
        body: {
          dashboard_id: dashboardId,
          user_request: userRequest,
          mode: 'patch',
          current_spec: currentSpec,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || 'Erro ao gerar patch');

      setPatchResult({
        ok: true,
        patch: data.patch || [],
        summary: data.summary || [],
        warnings: data.warnings || [],
        confidence: data.confidence || 0,
        trace_id: data.trace_id || '',
      });

      toast({
        title: 'Patch gerado',
        description: `${data.patch?.length || 0} operações propostas`,
      });

      // Auto-simulate if patch exists
      if (data.patch?.length > 0) {
        await handleSimulate(data.patch);
      }

    } catch (err: any) {
      console.error('AI edit error:', err);
      toast({
        title: 'Erro ao gerar patch',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [userRequest, dashboardId, currentSpec, toast]);

  // Simulate patch without applying
  const handleSimulate = useCallback(async (patch?: PatchOperation[]) => {
    const patchToSimulate = patch || patchResult?.patch;
    if (!patchToSimulate?.length) {
      toast({
        title: 'Nenhum patch para simular',
        variant: 'destructive',
      });
      return;
    }

    setIsSimulating(true);

    try {
      const { data, error } = await supabase.functions.invoke('simulate-dashboard-patch', {
        body: {
          dashboard_id: dashboardId,
          patch_format: 'rfc6902',
          patch: patchToSimulate,
          expected_version: currentVersion,
        },
      });

      if (error) throw error;

      setSimulationResult({
        valid: data?.valid ?? false,
        new_spec: data?.new_spec || {},
        diff_summary: data?.diff_summary || [],
        validation_errors: data?.validation_errors || [],
        validation_warnings: data?.validation_warnings || [],
        preview_metrics: data?.preview_metrics,
      });

      if (data?.valid) {
        toast({
          title: 'Simulação OK',
          description: 'O patch é válido e pode ser aplicado',
        });
        setActiveTab('preview');
      } else {
        toast({
          title: 'Simulação com erros',
          description: `${data?.validation_errors?.length || 0} erros encontrados`,
          variant: 'destructive',
        });
      }

    } catch (err: any) {
      console.error('Simulation error:', err);
      toast({
        title: 'Erro na simulação',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSimulating(false);
    }
  }, [patchResult, dashboardId, currentVersion, toast]);

  // Apply patch
  const handleApply = useCallback(async () => {
    if (!patchResult?.patch?.length) {
      toast({
        title: 'Nenhum patch para aplicar',
        variant: 'destructive',
      });
      return;
    }

    if (!simulationResult?.valid) {
      toast({
        title: 'Patch não validado',
        description: 'Execute a simulação antes de aplicar',
        variant: 'destructive',
      });
      return;
    }

    setIsApplying(true);

    try {
      const { data, error } = await supabase.functions.invoke('apply-dashboard-patch', {
        body: {
          dashboard_id: dashboardId,
          patch_format: 'rfc6902',
          patch: patchResult.patch,
          expected_version: currentVersion,
          change_reason: userRequest,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || 'Erro ao aplicar patch');

      toast({
        title: 'Patch aplicado!',
        description: `Versão ${data.new_version} criada`,
      });

      // Reset state
      setUserRequest('');
      setPatchResult(null);
      setSimulationResult(null);
      
      // Notify parent
      onSpecUpdated?.();
      onOpenChange(false);

    } catch (err: any) {
      console.error('Apply error:', err);
      toast({
        title: 'Erro ao aplicar patch',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  }, [patchResult, simulationResult, dashboardId, currentVersion, userRequest, toast, onSpecUpdated, onOpenChange]);

  // Load version history
  const loadVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const { data, error } = await supabase
        .from('dashboard_spec_versions')
        .select('version, created_at, notes')
        .eq('dashboard_id', dashboardId)
        .order('version', { ascending: false })
        .limit(10);

      if (error) throw error;
      setVersions(data || []);
    } catch (err) {
      console.error('Error loading versions:', err);
    } finally {
      setLoadingVersions(false);
    }
  }, [dashboardId]);

  // Rollback to a previous version
  const handleRollback = useCallback(async (version: number) => {
    if (!confirm(`Restaurar para a versão ${version}? Isso criará uma nova versão.`)) return;

    try {
      // Get the spec from that version
      const { data: versionData, error: versionError } = await supabase
        .from('dashboard_spec_versions')
        .select('dashboard_spec')
        .eq('dashboard_id', dashboardId)
        .eq('version', version)
        .single();

      if (versionError) throw versionError;

      // Update dashboard with that spec
      const { error: updateError } = await supabase
        .from('dashboards')
        .update({
          dashboard_spec: versionData.dashboard_spec,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dashboardId);

      if (updateError) throw updateError;

      // Create new version record
      const { error: insertError } = await supabase
        .from('dashboard_spec_versions')
        .insert({
          dashboard_id: dashboardId,
          version: currentVersion + 1,
          dashboard_spec: versionData.dashboard_spec,
          notes: `Rollback para versão ${version}`,
        });

      if (insertError) throw insertError;

      toast({
        title: 'Rollback concluído',
        description: `Restaurado para versão ${version}`,
      });

      onSpecUpdated?.();
      onOpenChange(false);

    } catch (err: any) {
      console.error('Rollback error:', err);
      toast({
        title: 'Erro no rollback',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, [dashboardId, currentVersion, toast, onSpecUpdated, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Editar com IA
          </SheetTitle>
          <SheetDescription>
            {dashboardName} • Versão {currentVersion}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Input Section */}
          <div className="space-y-3">
            <Label htmlFor="request">O que você quer mudar?</Label>
            <Textarea
              id="request"
              placeholder="Ex: Remover a aba Tendências, adicionar KPI de Vendas, criar filtro por Unidade..."
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value)}
              rows={3}
              className="resize-none"
            />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-apply"
                  checked={autoApply}
                  onCheckedChange={setAutoApply}
                />
                <Label htmlFor="auto-apply" className="text-sm text-muted-foreground">
                  Aplicar automaticamente
                </Label>
              </div>
              
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !userRequest.trim()}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                Gerar proposta
              </Button>
            </div>
          </div>

          {/* Results Section */}
          {patchResult && (
            <>
              <Separator />
              
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="summary" className="text-xs">
                    <ListChecks className="h-3 w-3 mr-1" />
                    Resumo
                  </TabsTrigger>
                  <TabsTrigger value="patch" className="text-xs">
                    <Code className="h-3 w-3 mr-1" />
                    Patch
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="text-xs">
                    <Eye className="h-3 w-3 mr-1" />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs" onClick={loadVersions}>
                    <History className="h-3 w-3 mr-1" />
                    Versões
                  </TabsTrigger>
                </TabsList>

                {/* Summary Tab */}
                <TabsContent value="summary" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        Mudanças propostas
                        <Badge variant="secondary">{patchResult.patch.length} ops</Badge>
                        <Badge 
                          variant={patchResult.confidence >= 0.8 ? 'default' : 'outline'}
                          className="ml-auto"
                        >
                          {Math.round(patchResult.confidence * 100)}% confiança
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {patchResult.summary.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  {patchResult.warnings.length > 0 && (
                    <Alert variant="default">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <ul className="space-y-1">
                          {patchResult.warnings.map((w, i) => (
                            <li key={i} className="text-sm">{w}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {simulationResult && (
                    <Card className={simulationResult.valid ? 'border-green-500/50' : 'border-destructive/50'}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          {simulationResult.valid ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-destructive" />
                          )}
                          Resultado da simulação
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {simulationResult.validation_errors.length > 0 && (
                          <div className="text-sm text-destructive">
                            <strong>Erros:</strong>
                            <ul className="ml-4 list-disc">
                              {simulationResult.validation_errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {simulationResult.preview_metrics && (
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>KPIs: {simulationResult.preview_metrics.kpis_count}</span>
                            <span>Charts: {simulationResult.preview_metrics.charts_count}</span>
                            <span>Abas: {simulationResult.preview_metrics.tabs.join(', ')}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Patch Tab */}
                <TabsContent value="patch" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileCode className="h-4 w-4" />
                        JSON Patch (RFC6902)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px]">
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                          {JSON.stringify(patchResult.patch, null, 2)}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Preview Tab */}
                <TabsContent value="preview" className="mt-4">
                  {simulationResult ? (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Diff resumido</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-1 text-sm">
                            {simulationResult.diff_summary.map((diff, i) => (
                              <li key={i} className="flex items-center gap-2">
                                {diff.startsWith('+') && <span className="text-green-500 font-mono">+</span>}
                                {diff.startsWith('-') && <span className="text-destructive font-mono">−</span>}
                                {diff.startsWith('~') && <span className="text-warning font-mono">~</span>}
                                <span className={
                                  diff.startsWith('+') ? 'text-green-600' :
                                  diff.startsWith('-') ? 'text-destructive' :
                                  diff.startsWith('~') ? 'text-warning' : ''
                                }>
                                  {diff.replace(/^[+\-~]\s*/, '')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>

                      {simulationResult.preview_metrics && (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription className="text-sm">
                            Resultado: {simulationResult.preview_metrics.kpis_count} KPIs, 
                            {' '}{simulationResult.preview_metrics.charts_count} gráficos,
                            {' '}abas: {simulationResult.preview_metrics.tabs.join(', ')}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Execute a simulação para ver o preview</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Histórico de versões</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingVersions ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : versions.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhuma versão encontrada
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {versions.map((v) => (
                            <div
                              key={v.version}
                              className="flex items-center justify-between p-2 rounded-md hover:bg-muted"
                            >
                              <div>
                                <span className="font-medium text-sm">v{v.version}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {new Date(v.created_at).toLocaleString('pt-BR')}
                                </span>
                                {v.notes && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {v.notes}
                                  </p>
                                )}
                              </div>
                              {v.version !== currentVersion && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRollback(v.version)}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Restaurar
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleSimulate()}
                  disabled={isSimulating || !patchResult.patch.length}
                >
                  {isSimulating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Simular
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={isApplying || !simulationResult?.valid}
                >
                  {isApplying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Aplicar
                </Button>
              </div>
            </>
          )}

          {/* Trace ID for debugging */}
          {patchResult?.trace_id && (
            <p className="text-xs text-muted-foreground text-center">
              trace_id: {patchResult.trace_id}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
