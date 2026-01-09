import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Sparkles, 
  FileCode, 
  Code, 
  ChevronDown,
  AlertTriangle,
  Lightbulb,
  Edit3,
  Check,
  RefreshCw,
  Info
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import type { DashboardPrompt, GenerationMode } from '../types';

interface PromptStepProps {
  dashboardPrompt: DashboardPrompt | null;
  userRequirements: string;
  generationMode: GenerationMode;
  onUserRequirementsChange: (value: string) => void;
  onGenerationModeChange: (mode: GenerationMode) => void;
  onPromptEdit: (newPrompt: string) => void;
  onRegeneratePrompt: () => void;
  onConfirm: () => void;
  onBack: () => void;
  isLoading: boolean;
  isRegenerating: boolean;
}

export default function PromptStep({
  dashboardPrompt,
  userRequirements,
  generationMode,
  onUserRequirementsChange,
  onGenerationModeChange,
  onPromptEdit,
  onRegeneratePrompt,
  onConfirm,
  onBack,
  isLoading,
  isRegenerating
}: PromptStepProps) {
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(dashboardPrompt?.prompt_final || '');
  const [showPlan, setShowPlan] = useState(false);

  const handleSavePromptEdit = () => {
    onPromptEdit(editedPrompt);
    setIsEditingPrompt(false);
  };

  const handleCancelEdit = () => {
    setEditedPrompt(dashboardPrompt?.prompt_final || '');
    setIsEditingPrompt(false);
  };

  if (!dashboardPrompt) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <p className="text-sm text-muted-foreground text-center">
          Nenhum prompt gerado. Volte ao passo anterior.
        </p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          Voltar ao Mapeamento
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 py-4">
        {/* Header */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Prompt do Dashboard (LLM1)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            A IA gerou um prompt para o dashboard. Você pode revisar, editar e adicionar requisitos específicos.
          </p>
        </div>

        {/* Generated Prompt */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Prompt do Dashboard (gerado pela IA)</Label>
            <div className="flex gap-2">
              {isEditingPrompt ? (
                <>
                  <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSavePromptEdit}>
                    <Check className="h-3 w-3 mr-1" />
                    Salvar
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={onRegeneratePrompt} disabled={isRegenerating}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${isRegenerating ? 'animate-spin' : ''}`} />
                    Regenerar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEditingPrompt(true)}>
                    <Edit3 className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                </>
              )}
            </div>
          </div>
          
          {isEditingPrompt ? (
            <Textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              placeholder="Prompt do dashboard..."
            />
          ) : (
            <div className="p-4 rounded-lg bg-muted/50 border max-h-[200px] overflow-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {dashboardPrompt.prompt_final}
              </pre>
            </div>
          )}
        </div>

        {/* User Requirements */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="requirements" className="text-sm font-medium">
              Requisitos Específicos do Dashboard
            </Label>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-[250px]">
                  Adicione instruções extras que serão anexadas ao prompt. Ex: "Focar em vendas por unidade", 
                  "Destacar taxa de conversão", "Incluir gráfico de origem de leads"
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Textarea
            id="requirements"
            value={userRequirements}
            onChange={(e) => onUserRequirementsChange(e.target.value)}
            placeholder="Ex: Quero destacar a taxa de conversão entre qualificado e venda. Focar nas métricas de custo por lead..."
            className="min-h-[100px]"
          />
        </div>

        {/* Generation Mode */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Modo de Geração</Label>
            {dashboardPrompt.recommended_mode && (
              <Badge variant="secondary" className="text-xs">
                Recomendado: {dashboardPrompt.recommended_mode === 'react_lovable' ? 'React' : 'HTML'}
              </Badge>
            )}
          </div>
          
          {dashboardPrompt.why_recommended && (
            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500" />
              {dashboardPrompt.why_recommended}
            </p>
          )}
          
          <RadioGroup 
            value={generationMode} 
            onValueChange={(v) => onGenerationModeChange(v as GenerationMode)}
            className="grid grid-cols-2 gap-3"
          >
            <Label 
              htmlFor="mode-react"
              className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                generationMode === 'react_lovable' 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                  : 'hover:border-primary/50'
              } ${dashboardPrompt.recommended_mode === 'react_lovable' ? 'ring-1 ring-green-500/30' : ''}`}
            >
              <RadioGroupItem value="react_lovable" id="mode-react" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  <span className="font-medium">React/Lovable</span>
                  {dashboardPrompt.recommended_mode === 'react_lovable' && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-500">
                      Recomendado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Dashboard dinâmico com componentes React. Melhor para dados genéricos e personalização.
                </p>
              </div>
            </Label>
            
            <Label 
              htmlFor="mode-html"
              className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                generationMode === 'html_js' 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                  : 'hover:border-primary/50'
              } ${dashboardPrompt.recommended_mode === 'html_js' ? 'ring-1 ring-green-500/30' : ''}`}
            >
              <RadioGroupItem value="html_js" id="mode-html" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-primary" />
                  <span className="font-medium">HTML/JS</span>
                  {dashboardPrompt.recommended_mode === 'html_js' && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-500">
                      Recomendado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Dashboard self-contained em HTML. Ideal para CRM/Kommo com abas e filtros integrados.
                </p>
              </div>
            </Label>
          </RadioGroup>
        </div>

        {/* Dashboard Plan Preview */}
        <Collapsible open={showPlan} onOpenChange={setShowPlan}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 border hover:bg-muted/70 transition-colors">
            <span className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Plano do Dashboard (resumo)
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showPlan ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="p-4 rounded-lg bg-muted/30 border space-y-3 text-sm">
              {/* KPIs */}
              {dashboardPrompt.dashboard_plan.kpis.length > 0 && (
                <div>
                  <p className="font-medium text-xs text-muted-foreground mb-1">
                    KPIs ({dashboardPrompt.dashboard_plan.kpis.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {dashboardPrompt.dashboard_plan.kpis.map((kpi, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {kpi.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Funnel */}
              {dashboardPrompt.dashboard_plan.funnel && (
                <div>
                  <p className="font-medium text-xs text-muted-foreground mb-1">
                    Funil ({dashboardPrompt.dashboard_plan.funnel.stages.length} etapas)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {dashboardPrompt.dashboard_plan.funnel.stages.map((stage, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {stage.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Filters */}
              {dashboardPrompt.dashboard_plan.filters.length > 0 && (
                <div>
                  <p className="font-medium text-xs text-muted-foreground mb-1">
                    Filtros ({dashboardPrompt.dashboard_plan.filters.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {dashboardPrompt.dashboard_plan.filters.map((filter, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {filter.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Tabs */}
              {dashboardPrompt.dashboard_plan.tabs.length > 0 && (
                <div>
                  <p className="font-medium text-xs text-muted-foreground mb-1">Abas</p>
                  <div className="flex flex-wrap gap-1">
                    {dashboardPrompt.dashboard_plan.tabs.map((tab, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {tab.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Confidence */}
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Confiança: <span className="font-medium">{Math.round(dashboardPrompt.dashboard_plan.confidence * 100)}%</span>
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Assumptions & Warnings */}
        {(dashboardPrompt.assumptions.length > 0 || dashboardPrompt.warnings.length > 0) && (
          <div className="space-y-2">
            {dashboardPrompt.warnings.length > 0 && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-sm font-medium text-yellow-600 flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  Avisos
                </p>
                <ul className="text-xs text-yellow-600/80 list-disc list-inside">
                  {dashboardPrompt.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            
            {dashboardPrompt.assumptions.length > 0 && (
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm font-medium text-blue-600 flex items-center gap-2 mb-1">
                  <Lightbulb className="h-4 w-4" />
                  Suposições
                </p>
                <ul className="text-xs text-blue-600/80 list-disc list-inside">
                  {dashboardPrompt.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Voltar ao Mapeamento
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            <Sparkles className="h-4 w-4 mr-2" />
            Aprovar Prompt e Gerar
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
