import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Key, 
  Save, 
  TestTube, 
  Trash2, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Activity,
  DollarSign,
  Zap,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuditLog } from '@/hooks/useAuditLog';

const AVAILABLE_MODELS = [
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (Recomendado)' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Legacy)' },
  { value: 'gpt-4o', label: 'GPT-4o (Legacy)' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano (Mais rápido)' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5', label: 'GPT-5 (Mais poderoso)' },
];

interface AISettings {
  id: string;
  tenant_id: string;
  provider: string;
  api_key_last4: string | null;
  default_model: string;
  enabled: boolean;
  max_requests_per_minute: number;
  max_tokens_per_day: number | null;
  max_spend_month_usd: number | null;
  created_at: string;
  updated_at: string;
}

interface UsageStats {
  tokens_today: number;
  tokens_month: number;
  cost_month_usd: number;
}

interface UsageLog {
  id: string;
  user_id: string;
  dashboard_id: string | null;
  request_type: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_estimated: number | null;
  latency_ms: number;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export default function TenantAISettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { logCreate, logUpdate, logDelete } = useAuditLog();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [usage, setUsage] = useState<UsageStats>({ tokens_today: 0, tokens_month: 0, cost_month_usd: 0 });
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [status, setStatus] = useState<'not_configured' | 'configured' | 'disabled' | 'invalid'>('not_configured');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency_ms?: number } | null>(null);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [defaultModel, setDefaultModel] = useState('gpt-4.1-mini');
  const [enabled, setEnabled] = useState(true);
  const [maxRpm, setMaxRpm] = useState(60);
  const [maxTokensDay, setMaxTokensDay] = useState<number | null>(null);
  const [maxSpendMonth, setMaxSpendMonth] = useState<number | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('ai-settings', {
        body: { action: 'get' }
      });

      if (response.error) {
        console.error('Error fetching settings:', response.error);
        toast({ title: 'Erro ao carregar configurações', variant: 'destructive' });
        return;
      }

      const data = response.data;
      setSettings(data.settings);
      setUsage(data.usage);
      setStatus(data.status);

      if (data.settings) {
        setDefaultModel(data.settings.default_model || 'gpt-4.1-mini');
        setEnabled(data.settings.enabled ?? true);
        setMaxRpm(data.settings.max_requests_per_minute || 60);
        setMaxTokensDay(data.settings.max_tokens_per_day);
        setMaxSpendMonth(data.settings.max_spend_month_usd);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await supabase.functions.invoke('ai-settings', {
        body: { action: 'logs', limit: 100 }
      });

      if (response.data?.logs) {
        setLogs(response.data.logs);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchLogs();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const isNew = !settings;
      const beforeData = settings ? { ...settings } : null;

      const response = await supabase.functions.invoke('ai-settings', {
        body: {
          action: 'save',
          api_key: apiKey || undefined,
          default_model: defaultModel,
          enabled,
          max_requests_per_minute: maxRpm,
          max_tokens_per_day: maxTokensDay,
          max_spend_month_usd: maxSpendMonth,
        }
      });

      if (response.error || !response.data?.success) {
        toast({ 
          title: response.data?.error || 'Erro ao salvar', 
          variant: 'destructive' 
        });
        return;
      }

      toast({ title: 'Configurações salvas com sucesso!' });
      setApiKey('');
      
      if (isNew) {
        logCreate('tenant_ai_settings', 'openai', 'OpenAI Config', { default_model: defaultModel, enabled });
      } else {
        logUpdate('tenant_ai_settings', settings?.id || 'openai', 'OpenAI Config', beforeData || undefined, { default_model: defaultModel, enabled });
      }
      
      await fetchSettings();
    } catch (error) {
      console.error('Save error:', error);
      toast({ title: 'Erro ao salvar configurações', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await supabase.functions.invoke('ai-test-connection', {
        body: { api_key: apiKey || undefined }
      });

      const result = response.data;
      setTestResult({
        success: result.success,
        message: result.message,
        latency_ms: result.latency_ms,
      });

      if (result.success) {
        toast({ title: 'Conexão OK!', description: `Latência: ${result.latency_ms}ms` });
      } else {
        toast({ title: 'Falha na conexão', description: result.message, variant: 'destructive' });
      }
      
      await fetchLogs();
    } catch (error) {
      console.error('Test error:', error);
      setTestResult({ success: false, message: 'Erro ao testar conexão' });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja remover a configuração de API? Isso desabilitará o agente de IA.')) {
      return;
    }

    try {
      const response = await supabase.functions.invoke('ai-settings', {
        body: { action: 'delete' }
      });

      if (response.data?.success) {
        toast({ title: 'Configurações removidas' });
        logDelete('tenant_ai_settings', settings?.id || 'openai', 'OpenAI Config', settings || undefined);
        setSettings(null);
        setStatus('not_configured');
        setApiKey('');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'configured':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Configurado</Badge>;
      case 'disabled':
        return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" /> Desabilitado</Badge>;
      case 'invalid':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Inválido</Badge>;
      default:
        return <Badge variant="outline"><Key className="w-3 h-3 mr-1" /> Não configurado</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações de IA</h1>
          <p className="text-muted-foreground">Configure a API Key da OpenAI para seu tenant</p>
        </div>
        {getStatusBadge()}
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="usage">Uso e Limites</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Key OpenAI
              </CardTitle>
              <CardDescription>
                A chave é criptografada e nunca exposta. Obtenha em{' '}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  platform.openai.com
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings?.api_key_last4 && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm">
                    Chave atual: <code className="bg-background px-2 py-1 rounded">****{settings.api_key_last4}</code>
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  {settings?.api_key_last4 ? 'Nova API Key (deixe vazio para manter)' : 'API Key'}
                </Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Modelo Padrão</Label>
                <Select value={defaultModel} onValueChange={setDefaultModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_MODELS.map(model => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitado</Label>
                  <p className="text-sm text-muted-foreground">
                    Permite uso do agente de IA neste tenant
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              {testResult && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${testResult.success ? 'bg-green-500/10 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                  {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <span className="text-sm">{testResult.message}</span>
                  {testResult.latency_ms && (
                    <Badge variant="outline" className="ml-auto">
                      <Clock className="h-3 w-3 mr-1" />
                      {testResult.latency_ms}ms
                    </Badge>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
                <Button variant="outline" onClick={handleTestConnection} disabled={testing || (!apiKey && !settings?.api_key_last4)}>
                  {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                  Testar Conexão
                </Button>
                {settings && (
                  <Button variant="destructive" onClick={handleDelete}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  Tokens Hoje
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usage.tokens_today.toLocaleString('pt-BR')}</div>
                {maxTokensDay && (
                  <p className="text-xs text-muted-foreground">
                    Limite: {maxTokensDay.toLocaleString('pt-BR')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  Tokens Mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usage.tokens_month.toLocaleString('pt-BR')}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  Custo Estimado (Mês)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${usage.cost_month_usd.toFixed(2)}
                </div>
                {maxSpendMonth && (
                  <p className="text-xs text-muted-foreground">
                    Limite: ${maxSpendMonth.toFixed(2)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Limites de Uso</CardTitle>
              <CardDescription>Configure limites para controlar custos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="maxRpm">Requisições/Minuto</Label>
                  <Input
                    id="maxRpm"
                    type="number"
                    value={maxRpm}
                    onChange={(e) => setMaxRpm(Number(e.target.value))}
                    min={1}
                    max={1000}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxTokensDay">Tokens/Dia (opcional)</Label>
                  <Input
                    id="maxTokensDay"
                    type="number"
                    value={maxTokensDay ?? ''}
                    onChange={(e) => setMaxTokensDay(e.target.value ? Number(e.target.value) : null)}
                    placeholder="Sem limite"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxSpend">Gasto Mensal USD (opcional)</Label>
                  <Input
                    id="maxSpend"
                    type="number"
                    step="0.01"
                    value={maxSpendMonth ?? ''}
                    onChange={(e) => setMaxSpendMonth(e.target.value ? Number(e.target.value) : null)}
                    placeholder="Sem limite"
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Limites
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Logs de Uso</CardTitle>
                <CardDescription>Últimas {logs.length} chamadas de IA</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchLogs}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Latência</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum log disponível
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.request_type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.model || '-'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.total_tokens.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.latency_ms ? `${log.latency_ms}ms` : '-'}
                        </TableCell>
                        <TableCell>
                          {log.status === 'success' ? (
                            <Badge className="bg-green-500">OK</Badge>
                          ) : (
                            <Badge variant="destructive" title={log.error_message || undefined}>
                              {log.error_code || 'Erro'}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
