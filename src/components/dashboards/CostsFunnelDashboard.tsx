import { ModernDashboardViewer } from './viewer';

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
    <ModernDashboardViewer
      dashboardId={dashboardId}
      templateKind={templateKind}
      dashboardSpec={dashboardSpec}
      dashboardName={dashboardName}
      detectedColumns={detectedColumns}
    />
  );
}
