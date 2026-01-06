import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Flag, Plus, Save, Globe, Building2 } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
}

interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  is_global: boolean;
  tenant_id: string | null;
  enabled: boolean;
  config: Record<string, any>;
  created_at: string;
  tenant_name?: string;
}

export default function FeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_global: true,
    tenant_id: '',
    enabled: false,
    config: '{}',
  });
  const { toast } = useToast();
  const { logCreate, logUpdate } = useAuditLog();

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      const [flagsRes, tenantsRes] = await Promise.all([
        supabase.from('feature_flags').select('*').order('name'),
        supabase.from('tenants').select('id, name').order('name'),
      ]);

      if (flagsRes.error) throw flagsRes.error;
      if (tenantsRes.error) throw tenantsRes.error;

      const tenantsMap = new Map((tenantsRes.data || []).map(t => [t.id, t.name]));
      
      setFlags((flagsRes.data || []).map(f => ({
        ...f,
        config: (f.config as Record<string, any>) || {},
        tenant_name: f.tenant_id ? tenantsMap.get(f.tenant_id) : undefined,
      })));
      setTenants(tenantsRes.data || []);
    } catch (error) {
      console.error('Error fetching flags:', error);
      toast({ title: 'Erro ao carregar flags', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async (flag: FeatureFlag) => {
    try {
      const newEnabled = !flag.enabled;
      const { error } = await supabase
        .from('feature_flags')
        .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
        .eq('id', flag.id);

      if (error) throw error;
      
      await logUpdate('feature_flag', flag.id, flag.name, { enabled: flag.enabled }, { enabled: newEnabled });
      setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: newEnabled } : f));
      toast({ title: `Flag "${flag.name}" ${newEnabled ? 'habilitada' : 'desabilitada'}` });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleEdit = (flag: FeatureFlag) => {
    setEditingFlag(flag);
    setFormData({
      name: flag.name,
      description: flag.description || '',
      is_global: flag.is_global,
      tenant_id: flag.tenant_id || '',
      enabled: flag.enabled,
      config: JSON.stringify(flag.config, null, 2),
    });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingFlag(null);
    setFormData({
      name: '',
      description: '',
      is_global: true,
      tenant_id: '',
      enabled: false,
      config: '{}',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      let config = {};
      try {
        config = JSON.parse(formData.config);
      } catch {
        toast({ title: 'JSON inválido na configuração', variant: 'destructive' });
        return;
      }

      const data = {
        name: formData.name,
        description: formData.description || null,
        is_global: formData.is_global,
        tenant_id: formData.is_global ? null : formData.tenant_id || null,
        enabled: formData.enabled,
        config,
        updated_at: new Date().toISOString(),
      };

      if (editingFlag) {
        const beforeData = { name: editingFlag.name, enabled: editingFlag.enabled, config: editingFlag.config };
        const { error } = await supabase
          .from('feature_flags')
          .update(data)
          .eq('id', editingFlag.id);
        if (error) throw error;
        await logUpdate('feature_flag', editingFlag.id, formData.name, beforeData, data);
        toast({ title: 'Flag atualizada' });
      } else {
        const { data: newFlag, error } = await supabase
          .from('feature_flags')
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        await logCreate('feature_flag', newFlag.id, formData.name, data);
        toast({ title: 'Flag criada' });
      }

      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  // Group flags by global vs tenant-specific
  const globalFlags = flags.filter(f => f.is_global);
  const tenantFlags = flags.filter(f => !f.is_global);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Feature Flags"
          description="Controle de funcionalidades por tenant"
        />
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Flag
        </Button>
      </div>

      {/* Global Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Flags Globais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {globalFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma flag global</p>
              ) : (
                globalFlags.map(flag => (
                  <div
                    key={flag.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleEdit(flag)}
                  >
                    <div className="flex items-center gap-3">
                      <Flag className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{flag.name}</p>
                        <p className="text-xs text-muted-foreground">{flag.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={() => handleToggle(flag)}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Tenant-specific Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Flags por Tenant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {tenantFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma flag por tenant</p>
              ) : (
                tenantFlags.map(flag => (
                  <div
                    key={flag.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleEdit(flag)}
                  >
                    <div className="flex items-center gap-3">
                      <Flag className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{flag.name}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{flag.tenant_name}</Badge>
                          <span className="text-xs text-muted-foreground">{flag.description}</span>
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={() => handleToggle(flag)}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFlag ? 'Editar Flag' : 'Nova Flag'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="feature_name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição da funcionalidade"
              />
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_global}
                  onCheckedChange={checked => setFormData(prev => ({ ...prev, is_global: checked }))}
                />
                <Label>Flag Global</Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={checked => setFormData(prev => ({ ...prev, enabled: checked }))}
                />
                <Label>Habilitada</Label>
              </div>
            </div>
            
            {!formData.is_global && (
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select
                  value={formData.tenant_id}
                  onValueChange={value => setFormData(prev => ({ ...prev, tenant_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Configuração (JSON)</Label>
              <Textarea
                value={formData.config}
                onChange={e => setFormData(prev => ({ ...prev, config: e.target.value }))}
                className="font-mono text-sm"
                rows={4}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
