import { ModernDashboardViewer, DashboardErrorBoundary } from './viewer';
import { PinnAfonsinaDashboard } from './pinn';

interface CostsFunnelDashboardProps {
  dashboardId: string;
  templateKind?: string;
  dashboardSpec?: Record<string, any>;
  dashboardName?: string;
  detectedColumns?: string[];
}

// Dashboard ID for Afonsina (uses Pinn theme)
const AFONSINA_DASHBOARD_ID = '16c74d98-22a5-4779-9bf0-f4711fe91528';

export default function CostsFunnelDashboard({ 
  dashboardId, 
  templateKind = 'costs_funnel_daily',
  dashboardSpec = {},
  dashboardName = 'Dashboard',
  detectedColumns = [],
}: CostsFunnelDashboardProps) {
  // Use the new Pinn dashboard for Afonsina
  if (dashboardId === AFONSINA_DASHBOARD_ID) {
    return (
      <DashboardErrorBoundary>
        <PinnAfonsinaDashboard
          dashboardId={dashboardId}
          dashboardName={dashboardName || 'Dashboard Afonsina'}
        />
      </DashboardErrorBoundary>
    );
  }
  
  // Default: use ModernDashboardViewer for other dashboards
  return (
    <DashboardErrorBoundary>
      <ModernDashboardViewer
        dashboardId={dashboardId}
        templateKind={templateKind}
        dashboardSpec={dashboardSpec}
        dashboardName={dashboardName}
        detectedColumns={detectedColumns}
      />
    </DashboardErrorBoundary>
  );
}
