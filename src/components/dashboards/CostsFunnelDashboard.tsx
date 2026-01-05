import { ModernDashboardViewer, DashboardErrorBoundary } from './viewer';

interface CostsFunnelDashboardProps {
  dashboardId: string;
  templateKind?: string;
  dashboardSpec?: Record<string, any>;
  dashboardName?: string;
  detectedColumns?: string[];
}

export default function CostsFunnelDashboard({ 
  dashboardId, 
  templateKind = 'costs_funnel_daily',
  dashboardSpec = {},
  dashboardName = 'Dashboard',
  detectedColumns = [],
}: CostsFunnelDashboardProps) {
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
