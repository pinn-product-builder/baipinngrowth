import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, GitBranch, TrendingUp, BarChart3, Table } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabType = 'executivo' | 'funil' | 'eficiencia' | 'tendencias' | 'detalhes';

interface Tab {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

const ALL_TABS: Tab[] = [
  { id: 'executivo', label: 'Executivo', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'funil', label: 'Funil', icon: <GitBranch className="h-4 w-4" /> },
  { id: 'eficiencia', label: 'Eficiência', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'tendencias', label: 'Tendências', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'detalhes', label: 'Detalhes', icon: <Table className="h-4 w-4" /> },
];

interface DashboardTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  enabledTabs?: TabType[];
  children: React.ReactNode;
  className?: string;
}

export default function DashboardTabs({
  activeTab,
  onTabChange,
  enabledTabs = ['executivo', 'funil', 'eficiencia', 'tendencias', 'detalhes'],
  children,
  className,
}: DashboardTabsProps) {
  const visibleTabs = ALL_TABS.filter(tab => enabledTabs.includes(tab.id));

  // If only one tab, don't show tabs at all
  if (visibleTabs.length <= 1) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Tabs 
      value={activeTab} 
      onValueChange={(v) => onTabChange(v as TabType)}
      className={cn("w-full", className)}
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
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      
      {children}
    </Tabs>
  );
}

export { TabsContent };
