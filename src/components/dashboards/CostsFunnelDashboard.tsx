import { ModernDashboardViewer, DashboardErrorBoundary } from './viewer';
import { PinnFullDashboard } from './pinn';

interface CostsFunnelDashboardProps {
  dashboardId: string;
  templateKind?: string;
  dashboardSpec?: Record<string, any>;
  dashboardName?: string;
  detectedColumns?: string[];
}

// Dashboard IDs for Afonsina (uses Pinn theme)
const AFONSINA_DASHBOARD_IDS = [
  '16c74d98-22a5-4779-9bf0-f4711fe91528',
  'ef25b642-c720-4784-ac88-cecee4dc7dee',
];

export default function CostsFunnelDashboard({ 
  dashboardId, 
  templateKind = 'costs_funnel_daily',
  dashboardSpec = {},
  dashboardName = 'Dashboard',
  detectedColumns = [],
}: CostsFunnelDashboardProps) {
  // Use the new full Pinn dashboard for Afonsina dashboards
  if (AFONSINA_DASHBOARD_IDS.includes(dashboardId)) {
    return (
      <DashboardErrorBoundary>
        <PinnFullDashboard
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
