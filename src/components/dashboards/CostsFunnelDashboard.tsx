import { ModernDashboardViewer, DashboardErrorBoundary } from './viewer';
import AfonsinaDashboardV3 from './viewer/AfonsinaDashboardV3';

interface CostsFunnelDashboardProps {
  dashboardId: string;
  templateKind?: string;
  dashboardSpec?: Record<string, any>;
  dashboardName?: string;
  detectedColumns?: string[];
}

// Dashboard ID for Afonsina (uses v3 views)
const AFONSINA_DASHBOARD_ID = '16c74d98-22a5-4779-9bf0-f4711fe91528';

export default function CostsFunnelDashboard({ 
  dashboardId, 
  templateKind = 'costs_funnel_daily',
  dashboardSpec = {},
  dashboardName = 'Dashboard',
  detectedColumns = [],
}: CostsFunnelDashboardProps) {
  // Use the new v3 dashboard for Afonsina
  if (dashboardId === AFONSINA_DASHBOARD_ID) {
    return (
      <DashboardErrorBoundary>
        <AfonsinaDashboardV3
          dashboardId={dashboardId}
          dashboardName={dashboardName || 'Dashboard Afonsina'}
          className="p-6"
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
