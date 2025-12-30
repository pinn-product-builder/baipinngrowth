import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Clock, ArrowRight, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  last_fetched_at: string | null;
  last_health_status: string | null;
  last_health_check_at: string | null;
  updated_at: string;
}

export default function Dashboards() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { userRole, tenantId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboards();
  }, [userRole, tenantId]);

  const fetchDashboards = async () => {
    try {
      const { data, error } = await supabase
        .from('dashboards')
        .select('id, name, description, is_active, last_fetched_at, last_health_status, last_health_check_at, updated_at')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setDashboards(data || []);
    } catch (error) {
      console.error('Erro ao buscar dashboards:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getHealthIcon = (status: string | null, lastCheck: string | null) => {
    if (!lastCheck) {
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
    if (status === 'ok') {
      return <CheckCircle className="h-4 w-4 text-success" />;
    }
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const getHealthLabel = (status: string | null, lastCheck: string | null) => {
    if (!lastCheck) return 'Nunca verificado';
    if (status === 'ok') return 'OK';
    return 'Erro';
  };

  if (isLoading) {
    return <LoadingPage message="Carregando dashboards..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Dashboards" 
        description="Visualize e analise suas métricas de negócio"
      />

      {dashboards.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard className="h-6 w-6 text-muted-foreground" />}
          title="Nenhum dashboard disponível"
          description="Os dashboards aparecerão aqui assim que forem configurados pelo administrador."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <Card 
              key={dashboard.id}
              className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
              onClick={() => navigate(`/dashboards/${dashboard.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <LayoutDashboard className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {getHealthIcon(dashboard.last_health_status, dashboard.last_health_check_at)}
                      <span>{getHealthLabel(dashboard.last_health_status, dashboard.last_health_check_at)}</span>
                    </div>
                  </div>
                </div>
                <CardTitle className="mt-3 text-lg">{dashboard.name}</CardTitle>
                {dashboard.description && (
                  <CardDescription className="line-clamp-2">
                    {dashboard.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {dashboard.last_fetched_at 
                        ? formatDistanceToNow(new Date(dashboard.last_fetched_at), { addSuffix: true, locale: ptBR })
                        : 'Ainda não carregado'}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}