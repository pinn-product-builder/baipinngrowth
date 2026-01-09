import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Plus, Target, Edit2, Trash2, Bell, BellOff } from 'lucide-react';

interface Goal {
  id: string;
  tenant_id: string;
  dashboard_id: string | null;
  metric_key: string;
  metric_label: string;
  goal_type: string;
  goal_value: number;
  goal_value_max: number | null;
  unit: string;
  alert_threshold_warning: number | null;
  alert_threshold_critical: number | null;
  alert_enabled: boolean;
  is_active: boolean;
  created_at: string;
}

interface Dashboard {
  id: string;
  name: string;
}

const METRIC_OPTIONS = [
  { key: 'cpl', label: 'CPL (Custo por Lead)', unit: 'currency', defaultGoalType: 'max' },
  { key: 'cac', label: 'CAC (Custo de Aquisição)', unit: 'currency', defaultGoalType: 'max' },
  { key: 'taxa_visita_lead', label: 'Taxa Visita → Lead', unit: 'percent', defaultGoalType: 'min' },
  { key: 'taxa_lead_oportunidade', label: 'Taxa Lead → Oportunidade', unit: 'percent', defaultGoalType: 'min' },
  { key: 'taxa_oportunidade_venda', label: 'Taxa Oportunidade → Venda', unit: 'percent', defaultGoalType: 'min' },
  { key: 'custo_total', label: 'Custo Total', unit: 'currency', defaultGoalType: 'max' },
  { key: 'leads', label: 'Leads', unit: 'number', defaultGoalType: 'min' },
  { key: 'vendas', label: 'Vendas', unit: 'number', defaultGoalType: 'min' },
  { key: 'custom', label: 'Métrica personalizada', unit: 'number', defaultGoalType: 'target' },
];

const GOAL_TYPES = [
  { value: 'max', label: 'Máximo (não ultrapassar)' },
  { value: 'min', label: 'Mínimo (atingir pelo menos)' },
  { value: 'target', label: 'Alvo (aproximar-se de)' },
  { value: 'range', label: 'Faixa (entre valores)' },
];

const UNIT_LABELS: Record<string, string> = {
  currency: 'R$',
  percent: '%',
  number: '',
};

export default function Goals() {
  const { tenantId, userRole } = useAuth();
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = userRole === 'admin';

  // Form state
  const [formData, setFormData] = useState({
    metric_key: '',
    metric_label: '',
    goal_type: 'max',
    goal_value: '',
    goal_value_max: '',
    unit: 'currency',
    alert_threshold_warning: '80',
    alert_threshold_critical: '100',
    alert_enabled: true,
    dashboard_id: '',
  });

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch goals
      const goalsQuery = supabase
        .from('tenant_goals')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (!isAdmin && tenantId) {
        goalsQuery.eq('tenant_id', tenantId);
      }
      
      const { data: goalsData, error: goalsError } = await goalsQuery;
      if (goalsError) throw goalsError;
      setGoals(goalsData || []);

      // Fetch dashboards for dropdown
      const dashQuery = supabase
        .from('dashboards')
        .select('id, name')
        .eq('is_active', true);
      
      if (!isAdmin && tenantId) {
        dashQuery.eq('tenant_id', tenantId);
      }
      
      const { data: dashData } = await dashQuery;
      setDashboards(dashData || []);

    } catch (error) {
      console.error('Error fetching goals:', error);
      toast({ title: 'Erro ao carregar metas', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMetricSelect = (key: string) => {
    const metric = METRIC_OPTIONS.find(m => m.key === key);
    if (metric) {
      setFormData(prev => ({
        ...prev,
        metric_key: key,
        metric_label: key === 'custom' ? prev.metric_label : metric.label,
        unit: metric.unit,
        goal_type: metric.defaultGoalType,
      }));
    }
  };

  const resetForm = () => {
    setFormData({
      metric_key: '',
      metric_label: '',
      goal_type: 'max',
      goal_value: '',
      goal_value_max: '',
      unit: 'currency',
      alert_threshold_warning: '80',
      alert_threshold_critical: '100',
      alert_enabled: true,
      dashboard_id: '',
    });
    setEditingGoal(null);
  };

  const openEditDialog = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({
      metric_key: goal.metric_key,
      metric_label: goal.metric_label,
      goal_type: goal.goal_type,
      goal_value: goal.goal_value.toString(),
      goal_value_max: goal.goal_value_max?.toString() || '',
      unit: goal.unit,
      alert_threshold_warning: goal.alert_threshold_warning?.toString() || '80',
      alert_threshold_critical: goal.alert_threshold_critical?.toString() || '100',
      alert_enabled: goal.alert_enabled,
      dashboard_id: goal.dashboard_id || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.metric_key || !formData.goal_value) {
      toast({ title: 'Preencha os campos obrigatórios', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        tenant_id: tenantId,
        metric_key: formData.metric_key,
        metric_label: formData.metric_label,
        goal_type: formData.goal_type,
        goal_value: parseFloat(formData.goal_value),
        goal_value_max: formData.goal_value_max ? parseFloat(formData.goal_value_max) : null,
        unit: formData.unit,
        alert_threshold_warning: formData.alert_threshold_warning ? parseFloat(formData.alert_threshold_warning) : null,
        alert_threshold_critical: formData.alert_threshold_critical ? parseFloat(formData.alert_threshold_critical) : null,
        alert_enabled: formData.alert_enabled,
        dashboard_id: formData.dashboard_id || null,
      };

      if (editingGoal) {
        const { error } = await supabase
          .from('tenant_goals')
          .update(payload)
          .eq('id', editingGoal.id);
        
        if (error) throw error;
        toast({ title: 'Meta atualizada com sucesso' });
      } else {
        const { error } = await supabase
          .from('tenant_goals')
          .insert([payload]);
        
        if (error) throw error;
        toast({ title: 'Meta criada com sucesso' });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving goal:', error);
      toast({ title: 'Erro ao salvar meta', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAlert = async (goal: Goal) => {
    try {
      const { error } = await supabase
        .from('tenant_goals')
        .update({ alert_enabled: !goal.alert_enabled })
        .eq('id', goal.id);
      
      if (error) throw error;
      
      setGoals(prev => prev.map(g => 
        g.id === goal.id ? { ...g, alert_enabled: !g.alert_enabled } : g
      ));
    } catch (error) {
      toast({ title: 'Erro ao atualizar alerta', variant: 'destructive' });
    }
  };

  const deleteGoal = async (goal: Goal) => {
    if (!confirm(`Deseja realmente excluir a meta "${goal.metric_label}"?`)) return;

    try {
      const { error } = await supabase
        .from('tenant_goals')
        .update({ is_active: false })
        .eq('id', goal.id);
      
      if (error) throw error;
      
      setGoals(prev => prev.filter(g => g.id !== goal.id));
      toast({ title: 'Meta excluída' });
    } catch (error) {
      toast({ title: 'Erro ao excluir meta', variant: 'destructive' });
    }
  };

  const formatGoalValue = (goal: Goal) => {
    const prefix = UNIT_LABELS[goal.unit] === 'R$' ? 'R$ ' : '';
    const suffix = UNIT_LABELS[goal.unit] === '%' ? '%' : '';
    
    if (goal.goal_type === 'range' && goal.goal_value_max) {
      return `${prefix}${goal.goal_value.toLocaleString('pt-BR')}${suffix} - ${prefix}${goal.goal_value_max.toLocaleString('pt-BR')}${suffix}`;
    }
    return `${prefix}${goal.goal_value.toLocaleString('pt-BR')}${suffix}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas"
        description="Configure metas para métricas do seu negócio e receba alertas automáticos"
        actions={
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Meta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingGoal ? 'Editar Meta' : 'Nova Meta'}</DialogTitle>
                <DialogDescription>
                  Defina uma meta para monitorar e receber alertas
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Métrica</Label>
                  <Select value={formData.metric_key} onValueChange={handleMetricSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma métrica" />
                    </SelectTrigger>
                    <SelectContent>
                      {METRIC_OPTIONS.map(m => (
                        <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.metric_key === 'custom' && (
                  <div className="space-y-2">
                    <Label>Nome da métrica</Label>
                    <Input
                      value={formData.metric_label}
                      onChange={(e) => setFormData(prev => ({ ...prev, metric_label: e.target.value }))}
                      placeholder="Ex: Taxa de Resposta"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Tipo de meta</Label>
                  <Select value={formData.goal_type} onValueChange={(v) => setFormData(prev => ({ ...prev, goal_type: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOAL_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{formData.goal_type === 'range' ? 'Valor mínimo' : 'Valor'}</Label>
                    <Input
                      type="number"
                      value={formData.goal_value}
                      onChange={(e) => setFormData(prev => ({ ...prev, goal_value: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  
                  {formData.goal_type === 'range' && (
                    <div className="space-y-2">
                      <Label>Valor máximo</Label>
                      <Input
                        type="number"
                        value={formData.goal_value_max}
                        onChange={(e) => setFormData(prev => ({ ...prev, goal_value_max: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Dashboard (opcional)</Label>
                  <Select value={formData.dashboard_id} onValueChange={(v) => setFormData(prev => ({ ...prev, dashboard_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Aplicar a todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos os dashboards</SelectItem>
                      {dashboards.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="space-y-0.5">
                    <Label>Alertas</Label>
                    <p className="text-xs text-muted-foreground">Receber notificações quando atingir limites</p>
                  </div>
                  <Switch
                    checked={formData.alert_enabled}
                    onCheckedChange={(v) => setFormData(prev => ({ ...prev, alert_enabled: v }))}
                  />
                </div>

                {formData.alert_enabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-yellow-500">Aviso (%)</Label>
                      <Input
                        type="number"
                        value={formData.alert_threshold_warning}
                        onChange={(e) => setFormData(prev => ({ ...prev, alert_threshold_warning: e.target.value }))}
                        placeholder="80"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-red-500">Crítico (%)</Label>
                      <Input
                        type="number"
                        value={formData.alert_threshold_critical}
                        onChange={(e) => setFormData(prev => ({ ...prev, alert_threshold_critical: e.target.value }))}
                        placeholder="100"
                      />
                    </div>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Salvando...' : editingGoal ? 'Atualizar' : 'Criar Meta'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {goals.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <CardContent className="text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma meta configurada</h3>
            <p className="text-muted-foreground mb-4">Crie metas para monitorar CPL, CAC, taxas de conversão e outras métricas importantes.</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar primeira meta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Metas Ativas</CardTitle>
            <CardDescription>{goals.length} meta(s) configurada(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Métrica</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Alertas</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map(goal => (
                  <TableRow key={goal.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        <span className="font-medium">{goal.metric_label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {GOAL_TYPES.find(t => t.value === goal.goal_type)?.label || goal.goal_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatGoalValue(goal)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAlert(goal)}
                        className={goal.alert_enabled ? 'text-green-500' : 'text-muted-foreground'}
                      >
                        {goal.alert_enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(goal)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteGoal(goal)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
