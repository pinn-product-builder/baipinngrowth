import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Clock, 
  Filter, 
  BarChart3, 
  Hash,
  Type,
  Calendar,
  DollarSign,
  Percent,
  Eye,
  EyeOff,
  GripVertical,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Info
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

// Column role types
export type ColumnRole = 
  | 'time'
  | 'id_primary'
  | 'id_secondary'
  | 'dimension'
  | 'funnel_stage'
  | 'metric_numeric'
  | 'metric_currency'
  | 'metric_percent'
  | 'text_detail'
  | 'ignored';

export interface ColumnMapping {
  column_name: string;
  role: ColumnRole;
  display_label?: string;
  filter_type?: 'select' | 'multi-select' | 'search-select';
  funnel_order?: number;
  truthy_rule?: 'default' | 'custom';
  custom_truthy_values?: string[];
  granularity?: 'day' | 'week' | 'month';
  is_hidden?: boolean;
}

export interface ColumnProfile {
  name: string;
  db_type: string;
  display_label?: string;
  semantic_type?: string;
  role_hint?: string;
  stats?: {
    null_rate?: number;
    distinct_count?: number;
    date_parseable_rate?: number;
    numeric_rate?: number;
    boolean_like_rate?: number;
    sample_values?: any[];
  };
  ai_suggested_role?: ColumnRole;
  ai_confidence?: number;
  ai_reason?: string;
}

interface ColumnMappingStepProps {
  columns: ColumnProfile[];
  initialMappings?: ColumnMapping[];
  onMappingsChange: (mappings: ColumnMapping[]) => void;
  onConfirm: () => void;
  onResetToAI: () => void;
  isLoading?: boolean;
}

const ROLE_OPTIONS: { value: ColumnRole; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'time', label: 'Tempo (Data)', icon: <Calendar className="h-4 w-4" />, description: 'Coluna de tempo para tendências' },
  { value: 'id_primary', label: 'ID Primário', icon: <Hash className="h-4 w-4" />, description: 'Identificador principal (lead_id)' },
  { value: 'id_secondary', label: 'ID Secundário', icon: <Hash className="h-4 w-4 text-muted-foreground" />, description: 'Oculto na interface' },
  { value: 'dimension', label: 'Dimensão (Filtro)', icon: <Filter className="h-4 w-4" />, description: 'Para filtros e agrupamentos' },
  { value: 'funnel_stage', label: 'Etapa de Funil', icon: <BarChart3 className="h-4 w-4" />, description: 'Flag de etapa CRM (truthy)' },
  { value: 'metric_numeric', label: 'Métrica Numérica', icon: <Hash className="h-4 w-4" />, description: 'Valor numérico (sum/avg)' },
  { value: 'metric_currency', label: 'Moeda', icon: <DollarSign className="h-4 w-4" />, description: 'Valor monetário (R$)' },
  { value: 'metric_percent', label: 'Percentual', icon: <Percent className="h-4 w-4" />, description: 'Taxa ou percentual (%)' },
  { value: 'text_detail', label: 'Texto (Detalhes)', icon: <Type className="h-4 w-4" />, description: 'Informação textual' },
  { value: 'ignored', label: 'Ignorar', icon: <EyeOff className="h-4 w-4" />, description: 'Excluir do dashboard' },
];

// Helper to infer initial role from column profile
function inferRoleFromProfile(col: ColumnProfile): ColumnRole {
  const name = col.name.toLowerCase();
  const type = (col.db_type || '').toLowerCase();
  const stats = col.stats || {};
  
  // Time column detection
  if (
    type.includes('date') || 
    type.includes('time') || 
    stats.date_parseable_rate && stats.date_parseable_rate > 0.5 ||
    ['dia', 'data', 'created_at', 'inserted_at', 'updated_at', 'date'].some(t => name.includes(t))
  ) {
    return 'time';
  }
  
  // ID detection
  if (
    ['lead_id', 'leadid', 'id', 'idd', 'kommo_lead_id', 'user_id', 'client_id'].includes(name) ||
    (name.endsWith('_id') && (stats.distinct_count || 0) > 100)
  ) {
    if (['lead_id', 'leadid', 'id', 'idd'].includes(name)) {
      return 'id_primary';
    }
    return 'id_secondary';
  }
  
  // Funnel stage detection
  if (
    col.semantic_type === 'funnel' || 
    col.role_hint === 'stage' ||
    stats.boolean_like_rate && stats.boolean_like_rate > 0.5 ||
    name.startsWith('st_') ||
    ['entrada', 'qualificado', 'agendada', 'realizada', 'venda', 'perdida', 'ativo', 'faltou'].some(s => name.includes(s))
  ) {
    return 'funnel_stage';
  }
  
  // Dimension detection
  if (
    col.semantic_type === 'dimension' ||
    col.role_hint === 'dimension' ||
    ['unidade', 'vendedora', 'origem', 'modalidade', 'professor', 'source', 'channel', 'campaign'].some(d => name.includes(d))
  ) {
    return 'dimension';
  }
  
  // Currency detection
  if (
    name.includes('valor') || name.includes('custo') || name.includes('preco') || 
    name.includes('price') || name.includes('amount') || name.includes('revenue')
  ) {
    return 'metric_currency';
  }
  
  // Percent detection
  if (name.includes('taxa') || name.includes('rate') || name.includes('percent')) {
    return 'metric_percent';
  }
  
  // Numeric metric
  if (type.includes('int') || type.includes('numeric') || type.includes('float') || type.includes('double')) {
    return 'metric_numeric';
  }
  
  // Default to text
  return 'text_detail';
}

export default function ColumnMappingStep({
  columns,
  initialMappings = [],
  onMappingsChange,
  onConfirm,
  onResetToAI,
  isLoading = false
}: ColumnMappingStepProps) {
  // Initialize mappings from columns if not provided
  const [mappings, setMappings] = useState<ColumnMapping[]>(() => {
    if (initialMappings.length > 0) return initialMappings;
    
    return columns.map(col => ({
      column_name: col.name,
      role: col.ai_suggested_role || inferRoleFromProfile(col),
      display_label: col.display_label || col.name,
      funnel_order: undefined
    }));
  });
  
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);
  const [funnelOrderMode, setFunnelOrderMode] = useState(false);

  // Get funnel stages for ordering
  const funnelStages = useMemo(() => 
    mappings.filter(m => m.role === 'funnel_stage').sort((a, b) => (a.funnel_order || 0) - (b.funnel_order || 0)),
    [mappings]
  );

  // Update a single mapping
  const updateMapping = (columnName: string, updates: Partial<ColumnMapping>) => {
    const newMappings = mappings.map(m => 
      m.column_name === columnName ? { ...m, ...updates } : m
    );
    setMappings(newMappings);
    onMappingsChange(newMappings);
  };

  // Bulk action: mark all IDs as ignored except primary
  const markAllIDsAsIgnored = () => {
    const newMappings = mappings.map(m => {
      if (m.role === 'id_secondary') {
        return { ...m, role: 'ignored' as ColumnRole };
      }
      return m;
    });
    setMappings(newMappings);
    onMappingsChange(newMappings);
  };

  // Move funnel stage up/down
  const moveFunnelStage = (columnName: string, direction: 'up' | 'down') => {
    const stagesCopy = [...funnelStages];
    const idx = stagesCopy.findIndex(s => s.column_name === columnName);
    if (idx === -1) return;
    
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= stagesCopy.length) return;
    
    // Swap
    [stagesCopy[idx], stagesCopy[newIdx]] = [stagesCopy[newIdx], stagesCopy[idx]];
    
    // Update funnel_order
    const newMappings = mappings.map(m => {
      const funnelIdx = stagesCopy.findIndex(s => s.column_name === m.column_name);
      if (funnelIdx !== -1) {
        return { ...m, funnel_order: funnelIdx };
      }
      return m;
    });
    setMappings(newMappings);
    onMappingsChange(newMappings);
  };

  // Get role icon
  const getRoleIcon = (role: ColumnRole) => {
    const option = ROLE_OPTIONS.find(o => o.value === role);
    return option?.icon || <Type className="h-4 w-4" />;
  };

  // Stats summary
  const stats = useMemo(() => ({
    time: mappings.filter(m => m.role === 'time').length,
    id_primary: mappings.filter(m => m.role === 'id_primary').length,
    dimensions: mappings.filter(m => m.role === 'dimension').length,
    funnel_stages: mappings.filter(m => m.role === 'funnel_stage').length,
    metrics: mappings.filter(m => ['metric_numeric', 'metric_currency', 'metric_percent'].includes(m.role)).length,
    ignored: mappings.filter(m => m.role === 'ignored').length,
  }), [mappings]);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header with summary */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Mapeamento de Colunas
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Revise e ajuste como cada coluna será usada no dashboard. A IA fez sugestões que você pode modificar.
          </p>
          
          {/* Quick stats */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge variant={stats.time === 1 ? "default" : "secondary"}>
              <Calendar className="h-3 w-3 mr-1" />
              {stats.time} Tempo
            </Badge>
            <Badge variant={stats.id_primary === 1 ? "default" : "secondary"}>
              <Hash className="h-3 w-3 mr-1" />
              {stats.id_primary} ID
            </Badge>
            <Badge variant={stats.dimensions > 0 ? "default" : "secondary"}>
              <Filter className="h-3 w-3 mr-1" />
              {stats.dimensions} Filtros
            </Badge>
            <Badge variant={stats.funnel_stages >= 3 ? "default" : "secondary"}>
              <BarChart3 className="h-3 w-3 mr-1" />
              {stats.funnel_stages} Funil
            </Badge>
            <Badge variant="outline">
              {stats.ignored} ignoradas
            </Badge>
          </div>
        </div>

        {/* Validation warnings */}
        {stats.time === 0 && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-600">
              Nenhuma coluna de tempo selecionada. Gráficos de tendência não serão gerados.
            </p>
          </div>
        )}
        {stats.funnel_stages < 3 && stats.funnel_stages > 0 && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-600">
              Funil com menos de 3 etapas. Recomendamos pelo menos 3 para melhor visualização.
            </p>
          </div>
        )}

        {/* Bulk actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={markAllIDsAsIgnored}>
            <EyeOff className="h-3 w-3 mr-1" />
            Ignorar IDs secundários
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFunnelOrderMode(!funnelOrderMode)}>
            <GripVertical className="h-3 w-3 mr-1" />
            {funnelOrderMode ? 'Fechar' : 'Ordenar'} Funil
          </Button>
          <Button variant="outline" size="sm" onClick={onResetToAI}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Reset para IA
          </Button>
        </div>

        {/* Funnel ordering mode */}
        {funnelOrderMode && funnelStages.length > 0 && (
          <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
            <p className="text-xs font-medium">Ordem do Funil (arraste ou use as setas)</p>
            {funnelStages.map((stage, idx) => (
              <div key={stage.column_name} className="flex items-center gap-2 p-2 rounded bg-background border">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm">{stage.display_label || stage.column_name}</span>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => moveFunnelStage(stage.column_name, 'up')}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => moveFunnelStage(stage.column_name, 'down')}
                    disabled={idx === funnelStages.length - 1}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <Badge variant="outline" className="text-xs">{idx + 1}</Badge>
              </div>
            ))}
          </div>
        )}

        {/* Column list */}
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-2">
            {columns.map(col => {
              const mapping = mappings.find(m => m.column_name === col.name);
              if (!mapping) return null;
              
              const isExpanded = expandedColumn === col.name;
              
              return (
                <Collapsible key={col.name} open={isExpanded} onOpenChange={(open) => setExpandedColumn(open ? col.name : null)}>
                  <div className={`border rounded-lg transition-colors ${
                    mapping.role === 'ignored' ? 'opacity-50' : ''
                  } ${isExpanded ? 'border-primary' : ''}`}>
                    {/* Main row */}
                    <div className="flex items-center gap-3 p-3">
                      {/* Role icon */}
                      <div className="shrink-0">
                        {getRoleIcon(mapping.role)}
                      </div>
                      
                      {/* Column name & stats */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm truncate">{col.name}</span>
                          {col.ai_suggested_role && col.ai_confidence && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="secondary" className="text-[10px]">
                                  IA {Math.round(col.ai_confidence * 100)}%
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{col.ai_reason || 'Sugestão da IA'}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span>{col.db_type}</span>
                          {col.stats?.null_rate !== undefined && (
                            <span>• {Math.round((1 - col.stats.null_rate) * 100)}% preenchido</span>
                          )}
                          {col.stats?.distinct_count !== undefined && (
                            <span>• {col.stats.distinct_count} únicos</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Role selector */}
                      <Select
                        value={mapping.role}
                        onValueChange={(v) => updateMapping(col.name, { role: v as ColumnRole })}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                {opt.icon}
                                <span>{opt.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Expand button */}
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    
                    {/* Expanded content */}
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-0 space-y-3 border-t">
                        {/* Sample values */}
                        {col.stats?.sample_values && col.stats.sample_values.length > 0 && (
                          <div className="pt-3">
                            <Label className="text-xs text-muted-foreground">Amostra de valores:</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {col.stats.sample_values.slice(0, 5).map((v, i) => (
                                <Badge key={i} variant="outline" className="text-xs font-mono">
                                  {String(v).slice(0, 30)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Display label */}
                        <div className="space-y-1">
                          <Label className="text-xs">Rótulo de exibição</Label>
                          <Input
                            value={mapping.display_label || ''}
                            onChange={(e) => updateMapping(col.name, { display_label: e.target.value })}
                            placeholder={col.name}
                            className="h-8 text-sm"
                          />
                        </div>
                        
                        {/* Role-specific options */}
                        {mapping.role === 'time' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Granularidade</Label>
                            <Select
                              value={mapping.granularity || 'day'}
                              onValueChange={(v) => updateMapping(col.name, { granularity: v as 'day' | 'week' | 'month' })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="day">Dia</SelectItem>
                                <SelectItem value="week">Semana</SelectItem>
                                <SelectItem value="month">Mês</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {mapping.role === 'dimension' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Tipo de filtro</Label>
                            <Select
                              value={mapping.filter_type || 'select'}
                              onValueChange={(v) => updateMapping(col.name, { filter_type: v as 'select' | 'multi-select' | 'search-select' })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="select">Select único</SelectItem>
                                <SelectItem value="multi-select">Multi-select</SelectItem>
                                <SelectItem value="search-select">Busca + select</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {mapping.role === 'funnel_stage' && (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Regra truthy</Label>
                              <Select
                                value={mapping.truthy_rule || 'default'}
                                onValueChange={(v) => updateMapping(col.name, { truthy_rule: v as 'default' | 'custom' })}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="default">Padrão (1, true, sim, x, ok)</SelectItem>
                                  <SelectItem value="custom">Personalizado</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {mapping.truthy_rule === 'custom' && (
                              <Input
                                placeholder="Valores truthy (ex: ativo, fechado)"
                                className="h-8 text-sm"
                                onChange={(e) => updateMapping(col.name, { 
                                  custom_truthy_values: e.target.value.split(',').map(v => v.trim()).filter(Boolean) 
                                })}
                              />
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Info className="h-3 w-3" />
                              <span>Use o botão "Ordenar Funil" acima para definir a ordem</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>

        {/* Confirm button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onConfirm} disabled={isLoading}>
            <Sparkles className="h-4 w-4 mr-2" />
            Confirmar e Gerar Dashboard
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
