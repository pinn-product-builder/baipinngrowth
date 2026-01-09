import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { useActivityLogger } from '@/hooks/useActivityLogger';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, RefreshCw, Clock, AlertCircle, FileText, ExternalLink, AlertTriangle, Copy, CheckCheck, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import CostsFunnelDashboard from '@/components/dashboards/CostsFunnelDashboard';
import DashboardSpecEditor from '@/components/dashboards/DashboardSpecEditor';

// Configure DOMPurify to allow safe HTML tags for dashboard content
const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'b', 'i', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'br', 'hr', 'img', 'pre', 'code', 'blockquote'],
    ALLOWED_ATTR: ['href', 'class', 'style', 'src', 'alt', 'width', 'height', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  });
};

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  webhook_url: string | null;
  display_type: 'auto' | 'iframe' | 'html' | 'json';
  source_kind: 'webhook' | 'supabase_view';
  data_source_id: string | null;
  view_name: string | null;
  last_fetched_at: string | null;
  template_kind: string | null;
  dashboard_spec: Record<string, any> | null;
  detected_columns: any[] | null;
  use_proxy: boolean | null;
}

type ContentType = 'iframe' | 'html' | 'json' | 'supabase_view' | 'unknown';
type LoadState = 'loading' | 'success' | 'error' | 'empty';
type ErrorType = 'generic' | 'cors' | 'iframe_blocked' | 'network' | 'timeout';

const FETCH_TIMEOUT = 15000; // 15 segundos
const MAX_RETRIES = 2;

export default function DashboardView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();
  const { userRole } = useAuth();

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [contentType, setContentType] = useState<ContentType>('unknown');
  const [content, setContent] = useState<string | object | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorType, setErrorType] = useState<ErrorType>('generic');
  const [retryCount, setRetryCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [specEditorOpen, setSpecEditorOpen] = useState(false);

  const canEditSpec = userRole === 'admin' || userRole === 'manager';

  useEffect(() => {
    if (id) {
      fetchDashboard();
    }
  }, [id, fetchDashboard]);

  const fetchDashboard = useCallback(async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from('dashboards')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      if (!data) {
        setLoadState('error');
        setIsLoading(false);
        return;
      }
      
      setDashboard(data as Dashboard);
      
      // Registrar visualização
      logActivity('view_dashboard', 'dashboard', data.id, { name: data.name });
      
      // Se for supabase_view, não precisa carregar conteúdo da mesma forma
      if (data.source_kind === 'supabase_view') {
        setContentType('supabase_view');
        setLoadState('success');
        setIsLoading(false);
        return;
      }
      
      loadDashboardContent(data as Dashboard);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Erro ao buscar dashboard:', error);
      }
      setLoadState('error');
      setIsLoading(false);
      toast({
        title: 'Erro ao carregar dashboard',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  }, [id, logActivity, loadDashboardContent, toast]);

  const loadDashboardContent = useCallback(async (dash: Dashboard) => {
    setLoadState('loading');
    setIframeError(false);
    setErrorType('generic');
    setRetryCount(0);
    
    const displayType = dash.display_type;

    // Se o tipo for iframe ou auto, tentar iframe primeiro
    if (displayType === 'iframe' || displayType === 'auto') {
      setContentType('iframe');
      setLoadState('success');
      setLastUpdated(new Date());
      setIsLoading(false);
      
      // Registrar sucesso
      await updateDashboardHealth(dash.id, 'ok', null);
      return;
    }

    // Caso contrário, buscar conteúdo
    await fetchContentWithRetry(dash, 1);
  }, []);
  
  const updateDashboardHealth = useCallback(async (dashboardId: string, status: 'ok' | 'error', errorMessage: string | null) => {
    try {
      await supabase
        .from('dashboards')
        .update({ 
          last_fetched_at: new Date().toISOString(),
          last_health_status: status,
          last_health_check_at: new Date().toISOString(),
          last_error_message: errorMessage
        })
        .eq('id', dashboardId);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error updating dashboard health:', error);
      }
    }
  }, []);

  const fetchWithTimeout = useCallback(async (url: string, timeout: number): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }, []);

  const fetchContentWithRetry = useCallback(async (dash: Dashboard, attempt: number) => {
    setRetryCount(attempt);
    
    try {
      setIsRefreshing(true);
      
      let responseData: { content: unknown; content_type: string } | null = null;
      
      // Use server-side proxy if enabled
      if (dash.use_proxy) {
        const { data, error } = await supabase.functions.invoke('dashboard-proxy', {
          body: { dashboard_id: dash.id }
        });
        
        if (error) throw error;
        if (data?.error) throw new Error(data.error as string);
        
        responseData = { content: data?.content, content_type: data?.content_type as string };
      } else {
        // Direct fetch
        if (!dash.webhook_url) {
          throw new Error('Webhook URL não configurada');
        }
        const response = await fetchWithTimeout(dash.webhook_url, FETCH_TIMEOUT);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const contentTypeHeader = response.headers.get('content-type') || '';
        
        if (contentTypeHeader.includes('application/json')) {
          const jsonData = await response.json();
          responseData = { content: jsonData, content_type: 'json' };
        } else {
          const htmlContent = await response.text();
          responseData = { content: htmlContent, content_type: 'html' };
        }
      }
      
      // Process response
      if (!responseData.content || 
          (Array.isArray(responseData.content) && responseData.content.length === 0) || 
          (typeof responseData.content === 'object' && Object.keys(responseData.content).length === 0) ||
          (typeof responseData.content === 'string' && !responseData.content.trim())) {
        setLoadState('empty');
        await updateDashboardHealth(dash.id, 'ok', null);
      } else {
        setContent(responseData.content);
        setContentType(responseData.content_type as ContentType);
        setLoadState('success');
        await updateDashboardHealth(dash.id, 'ok', null);
      }
      
      setLastUpdated(new Date());

    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('Erro ao carregar conteúdo:', error);
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      let detectedErrorType: ErrorType = 'generic';
      
      if (error instanceof Error && error.name === 'AbortError') {
        detectedErrorType = 'timeout';
      } else if (errorMessage.includes('CORS') || errorMessage.includes('Failed to fetch')) {
        detectedErrorType = 'cors';
      } else if (errorMessage.includes('NetworkError')) {
        detectedErrorType = 'network';
      }
      
      // Tentar novamente se não atingiu o máximo de tentativas
      if (attempt < MAX_RETRIES) {
        await fetchContentWithRetry(dash, attempt + 1);
        return;
      }
      
      setErrorType(detectedErrorType);
      setLoadState('error');
      await updateDashboardHealth(dash.id, 'error', errorMessage.slice(0, 200));
      logActivity('dashboard_load_error', 'dashboard', dash.id, { 
        error: errorMessage,
        type: detectedErrorType,
        attempts: attempt
      });
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [fetchWithTimeout, updateDashboardHealth, logActivity]);

  const handleIframeError = useCallback(() => {
    setIframeError(true);
    setErrorType('iframe_blocked');
    toast({
      title: 'Embed bloqueado',
      description: 'Carregando via método alternativo. Ou use "Abrir em nova aba".',
      variant: 'default'
    });
    // Fallback para fetch se iframe falhar
    if (dashboard) {
      fetchContentWithRetry(dashboard, 1);
    }
  }, [dashboard, fetchContentWithRetry, toast]);

  const handleRefresh = useCallback(() => {
    if (dashboard) {
      if (contentType === 'iframe' && !iframeError) {
        // Forçar reload do iframe atualizando lastUpdated
        setLastUpdated(new Date());
      } else {
        fetchContentWithRetry(dashboard, 1);
      }
    }
  }, [dashboard, contentType, iframeError, fetchContentWithRetry]);

  const handleOpenInNewTab = () => {
    if (dashboard) {
      window.open(dashboard.webhook_url, '_blank');
    }
  };

  const handleCopyLink = async () => {
    if (dashboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        toast({ title: 'Link copiado', description: 'Link do dashboard copiado para a área de transferência.' });
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast({ title: 'Erro ao copiar', description: 'Não foi possível copiar o link.', variant: 'destructive' });
      }
    }
  };

  const getErrorMessage = () => {
    switch (errorType) {
      case 'cors':
        return {
          title: 'CORS bloqueado',
          description: 'CORS bloqueado no endpoint. Ajuste os headers no servidor do webhook, ou use "Abrir em nova aba".'
        };
      case 'iframe_blocked':
        return {
          title: 'Embed bloqueado',
          description: 'X-Frame-Options ou CSP está bloqueando o embed. Use "Abrir em nova aba" ou método alternativo.'
        };
      case 'network':
        return {
          title: 'Erro de rede',
          description: 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.'
        };
      case 'timeout':
        return {
          title: 'Tempo esgotado',
          description: `A requisição expirou após ${FETCH_TIMEOUT / 1000} segundos. O servidor pode estar lento ou indisponível.`
        };
      default:
        return {
          title: 'Falha ao carregar dashboard',
          description: 'Não foi possível carregar o conteúdo do dashboard. Por favor, tente novamente.'
        };
    }
  };

  if (isLoading) {
    return <LoadingPage message="Carregando dashboard..." />;
  }

  if (!dashboard) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-6 w-6 text-muted-foreground" />}
        title="Dashboard não encontrado"
        description="O dashboard solicitado não foi encontrado."
        action={
          <Button variant="outline" onClick={() => navigate('/dashboards')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar aos Dashboards
          </Button>
        }
      />
    );
  }

  const errorInfo = getErrorMessage();

  return (
    <div className="flex h-full flex-col space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboards')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{dashboard.name}</h1>
            {dashboard.description && (
              <p className="text-sm text-muted-foreground">{dashboard.description}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dashboard.source_kind !== 'supabase_view' && (
            <>
              {lastUpdated && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-2">
                  <Clock className="h-4 w-4" />
                  <span>Atualizado: {format(lastUpdated, 'HH:mm:ss', { locale: ptBR })}</span>
                </div>
              )}
              {retryCount > 1 && loadState === 'loading' && (
                <span className="text-xs text-muted-foreground mr-2">
                  Tentativa {retryCount}/{MAX_RETRIES}
                </span>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCopyLink}
              >
                {copied ? <CheckCheck className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar link'}
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={handleOpenInNewTab}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir em nova aba
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </>
          )}
          {dashboard.source_kind === 'supabase_view' && canEditSpec && (
            <Button 
              variant="outline"
              size="sm"
              onClick={() => setSpecEditorOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Editar Layout
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {loadState === 'loading' && (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border bg-card gap-2">
            <LoadingSpinner size="lg" />
            {retryCount > 1 && (
              <p className="text-sm text-muted-foreground">Tentativa {retryCount}/{MAX_RETRIES}...</p>
            )}
          </div>
        )}

        {loadState === 'error' && (
          <Card className="flex h-full items-center justify-center">
            <CardContent className="text-center py-12">
              <AlertTriangle className="mx-auto h-12 w-12 text-warning" />
              <h3 className="mt-4 text-lg font-medium">{errorInfo.title}</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {errorInfo.description}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Button variant="outline" onClick={handleOpenInNewTab}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir em nova aba
                </Button>
                <Button variant="outline" onClick={handleRefresh}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loadState === 'empty' && (
          <EmptyState
            icon={<FileText className="h-6 w-6 text-muted-foreground" />}
            title="Sem dados disponíveis"
            description="Este dashboard ainda não possui dados para exibir."
            action={
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            }
            className="h-full"
          />
        )}

        {loadState === 'success' && contentType === 'iframe' && !iframeError && dashboard.webhook_url && (
          <iframe
            key={lastUpdated?.getTime()}
            src={dashboard.webhook_url}
            className="h-full w-full rounded-lg border bg-card"
            onError={handleIframeError}
            title={dashboard.name}
            sandbox="allow-scripts allow-same-origin"
          />
        )}

        {loadState === 'success' && contentType === 'html' && content && (
          <Card className="h-full overflow-auto">
            <CardContent className="p-4">
              <div 
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(content as string) }}
              />
            </CardContent>
          </Card>
        )}

        {loadState === 'success' && contentType === 'json' && content && (
          <Card className="h-full overflow-auto">
            <CardContent className="p-4">
              <JsonRenderer data={content as object} />
            </CardContent>
          </Card>
        )}

        {loadState === 'success' && contentType === 'supabase_view' && dashboard && (
          <>
            <CostsFunnelDashboard 
              dashboardId={dashboard.id} 
              templateKind={dashboard.template_kind || 'costs_funnel_daily'}
              dashboardSpec={dashboard.dashboard_spec || {}}
              dashboardName={dashboard.name}
              detectedColumns={Array.isArray(dashboard.detected_columns) ? dashboard.detected_columns : []}
            />
            {canEditSpec && (
              <DashboardSpecEditor
                dashboardId={dashboard.id}
                currentSpec={dashboard.dashboard_spec || {}}
                detectedColumns={dashboard.detected_columns}
                open={specEditorOpen}
                onOpenChange={setSpecEditorOpen}
                onSave={(newSpec) => {
                  setDashboard(prev => prev ? { ...prev, dashboard_spec: newSpec } : null);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Componente simples de renderização JSON
function JsonRenderer({ data }: { data: object }) {
  if (Array.isArray(data)) {
    return (
      <div className="space-y-3">
        {data.map((item, index) => (
          <Card key={index} className="p-4">
            <JsonObject obj={item} />
          </Card>
        ))}
      </div>
    );
  }
  return <JsonObject obj={data} />;
}

function JsonObject({ obj }: { obj: object }) {
  const entries = Object.entries(obj);
  
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">{key.replace(/_/g, ' ')}</p>
          <p className="mt-0.5 text-sm font-medium">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </p>
        </div>
      ))}
    </div>
  );
}