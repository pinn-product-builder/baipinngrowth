// ============================================================
// ADAPTIVE DASHBOARD TABS
// Dynamic tabs based on dataset capabilities
// ============================================================

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutDashboard, 
  Table, 
  Clock, 
  GitBranch, 
  Search, 
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DynamicTabId, DiscardInfo, TabDefinition } from '@/lib/dashboard/types';

// Local type for tab generation result with discarded field
interface TabGenerationResult {
  tabs: TabDefinition[];
  defaultTab: DynamicTabId;
  discarded?: DiscardInfo[];
  warnings: string[];
}

// Icon mapping
const TAB_ICONS: Record<DynamicTabId, React.ReactNode> = {
  overview: <LayoutDashboard className="h-4 w-4" />,
  table: <Table className="h-4 w-4" />,
  time: <Clock className="h-4 w-4" />,
  funnel: <GitBranch className="h-4 w-4" />,
  explore: <Search className="h-4 w-4" />,
  efficiency: <TrendingUp className="h-4 w-4" />,
};

// Label mapping for PT-BR
const TAB_LABELS: Record<DynamicTabId, string> = {
  overview: 'Visão Geral',
  table: 'Tabela',
  time: 'Tendências',
  funnel: 'Funil',
  explore: 'Explorar',
  efficiency: 'Eficiência',
};

interface AdaptiveDashboardTabsProps {
  /** Generated tabs from capabilities detection */
  tabs: TabGenerationResult;
  /** Currently active tab */
  activeTab: DynamicTabId;
  /** Tab change handler */
  onTabChange: (tab: DynamicTabId) => void;
  /** Tab content components */
  children: React.ReactNode;
  /** Show discarded tabs info (admin only) */
  showDiscardedInfo?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Adaptive Dashboard Tabs Component
 * Renders only tabs that are supported by the dataset capabilities
 */
export default function AdaptiveDashboardTabs({
  tabs,
  activeTab,
  onTabChange,
  children,
  showDiscardedInfo = false,
  className,
}: AdaptiveDashboardTabsProps) {
  const visibleTabs = tabs.tabs;
  const discardedTabs = tabs.discarded || [];

  // If only one or zero tabs, don't show tab bar
  if (visibleTabs.length <= 1) {
    return <div className={className}>{children}</div>;
  }

  // Ensure active tab is valid
  const validActiveTab = visibleTabs.some(t => t.id === activeTab) 
    ? activeTab 
    : tabs.defaultTab;

  return (
    <div className={className}>
      <Tabs 
        value={validActiveTab} 
        onValueChange={(v) => onTabChange(v as DynamicTabId)}
        className="w-full"
      >
        <TabsList className="w-full justify-start h-auto p-1 bg-muted/50 rounded-lg gap-1 flex-wrap">
          {visibleTabs.map(tab => (
            <TabsTrigger 
              key={tab.id} 
              value={tab.id}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
                "data-[state=active]:bg-background data-[state=active]:shadow-sm",
                "data-[state=active]:text-foreground",
                "transition-all duration-150"
              )}
            >
              {TAB_ICONS[tab.id]}
              <span className="hidden sm:inline">{TAB_LABELS[tab.id] || tab.label}</span>
            </TabsTrigger>
          ))}
          
          {/* Discarded tabs indicator (admin only) */}
          {showDiscardedInfo && discardedTabs.length > 0 && (
            <div className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              <span>{discardedTabs.length} aba(s) oculta(s)</span>
            </div>
          )}
        </TabsList>
        
        {children}
      </Tabs>
      
      {/* Discarded tabs details (admin only) */}
      {showDiscardedInfo && discardedTabs.length > 0 && (
        <DiscardedTabsInfo discarded={discardedTabs} />
      )}
    </div>
  );
}

/**
 * Component to show discarded tabs info
 */
function DiscardedTabsInfo({ discarded }: { discarded: DiscardInfo[] }) {
  return (
    <div className="mt-2 p-2 rounded-md bg-muted/30 text-xs text-muted-foreground">
      <details>
        <summary className="cursor-pointer font-medium">
          Abas não disponíveis ({discarded.length})
        </summary>
        <ul className="mt-2 space-y-1 ml-4">
          {discarded.map((d, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="font-medium">{d.item}:</span>
              <span>{d.reason}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// Re-export TabsContent for convenience
export { TabsContent };
