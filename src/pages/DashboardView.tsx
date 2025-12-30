import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, Clock, AlertCircle, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  webhook_url: string;
  display_type: 'auto' | 'iframe' | 'html' | 'json';
  last_fetched_at: string | null;
}

type ContentType = 'iframe' | 'html' | 'json' | 'unknown';
type LoadState = 'loading' | 'success' | 'error' | 'empty';

export default function DashboardView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [contentType, setContentType] = useState<ContentType>('unknown');
  const [content, setContent] = useState<string | object | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboard();
  }, [id]);

  const fetchDashboard = async () => {
    try {
      const { data, error } = await supabase
        .from('dashboards')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setDashboard(data);
      loadDashboardContent(data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      setLoadState('error');
      setIsLoading(false);
    }
  };

  const loadDashboardContent = useCallback(async (dash: Dashboard) => {
    setLoadState('loading');
    setIframeError(false);
    
    const displayType = dash.display_type;

    // If type is iframe or auto, try iframe first
    if (displayType === 'iframe' || displayType === 'auto') {
      setContentType('iframe');
      setLoadState('success');
      setLastUpdated(new Date());
      setIsLoading(false);
      return;
    }

    // Otherwise fetch content
    await fetchContent(dash);
  }, []);

  const fetchContent = async (dash: Dashboard) => {
    try {
      setIsRefreshing(true);
      const response = await fetch(dash.webhook_url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentTypeHeader = response.headers.get('content-type') || '';
      
      if (contentTypeHeader.includes('application/json')) {
        const jsonData = await response.json();
        if (!jsonData || (Array.isArray(jsonData) && jsonData.length === 0) || Object.keys(jsonData).length === 0) {
          setLoadState('empty');
        } else {
          setContent(jsonData);
          setContentType('json');
          setLoadState('success');
        }
      } else {
        const htmlContent = await response.text();
        if (!htmlContent.trim()) {
          setLoadState('empty');
        } else {
          setContent(htmlContent);
          setContentType('html');
          setLoadState('success');
        }
      }
      
      setLastUpdated(new Date());

      // Update last_fetched_at in database
      await supabase
        .from('dashboards')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', dash.id);

    } catch (error) {
      console.error('Error loading content:', error);
      setLoadState('error');
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  const handleIframeError = () => {
    setIframeError(true);
    // Fallback to fetch if iframe fails
    if (dashboard) {
      fetchContent(dashboard);
    }
  };

  const handleRefresh = () => {
    if (dashboard) {
      if (contentType === 'iframe' && !iframeError) {
        // Force iframe reload by updating lastUpdated
        setLastUpdated(new Date());
      } else {
        fetchContent(dashboard);
      }
    }
  };

  if (isLoading) {
    return <LoadingPage message="Loading dashboard..." />;
  }

  if (!dashboard) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-6 w-6 text-muted-foreground" />}
        title="Dashboard not found"
        description="The requested dashboard could not be found."
        action={
          <Button variant="outline" onClick={() => navigate('/dashboards')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboards
          </Button>
        }
      />
    );
  }

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
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Last updated: {format(lastUpdated, 'HH:mm:ss')}</span>
            </div>
          )}
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {loadState === 'loading' && (
          <div className="flex h-full items-center justify-center rounded-lg border bg-card">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {loadState === 'error' && (
          <Card className="flex h-full items-center justify-center">
            <CardContent className="text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
              <h3 className="mt-4 text-lg font-medium">Failed to load dashboard</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Could not load the dashboard content. Please try again.
              </p>
              <Button variant="outline" className="mt-4" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {loadState === 'empty' && (
          <EmptyState
            icon={<FileText className="h-6 w-6 text-muted-foreground" />}
            title="No data available"
            description="This dashboard doesn't have any data to display yet."
            action={
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            }
            className="h-full"
          />
        )}

        {loadState === 'success' && contentType === 'iframe' && !iframeError && (
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
                dangerouslySetInnerHTML={{ __html: content as string }}
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
      </div>
    </div>
  );
}

// Simple JSON renderer component
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
