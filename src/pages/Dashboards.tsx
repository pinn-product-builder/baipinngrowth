import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Clock, ArrowRight, CheckCircle, XCircle, HelpCircle, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AutoInsightsCard from '@/components/dashboards/AutoInsightsCard';

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
    if (status === 'ok') return 'Online';
    return 'Erro';
  };

  if (isLoading) {
    return <LoadingPage message="Carregando dashboards..." />;
  }

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header Pinn Style */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboards</h1>
            <p className="text-sm text-muted-foreground">Visualize e analise suas métricas de negócio</p>
          </div>
        </div>
      </div>
      
      {/* Auto-Insights Card */}
      <AutoInsightsCard />

      {dashboards.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard className="h-6 w-6 text-muted-foreground" />}
          title="Nenhum dashboard disponível"
          description="Os dashboards aparecerão aqui assim que forem configurados pelo administrador."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <Card 
              key={dashboard.id}
              className="group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-glow bg-card/60"
              onClick={() => navigate(`/dashboards/${dashboard.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-orange/10 border border-primary/20 group-hover:glow-orange-subtle transition-all">
                    <LayoutDashboard className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted/50 border border-border/50">
                      {getHealthIcon(dashboard.last_health_status, dashboard.last_health_check_at)}
                      <span className="text-muted-foreground">{getHealthLabel(dashboard.last_health_status, dashboard.last_health_check_at)}</span>
                    </div>
                  </div>
                </div>
                <CardTitle className="mt-4 text-lg font-semibold group-hover:text-primary transition-colors">
                  {dashboard.name}
                </CardTitle>
                {dashboard.description && (
                  <CardDescription className="line-clamp-2 mt-1">
                    {dashboard.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      {dashboard.last_fetched_at 
                        ? formatDistanceToNow(new Date(dashboard.last_fetched_at), { addSuffix: true, locale: ptBR })
                        : 'Ainda não carregado'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-medium">Abrir</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
