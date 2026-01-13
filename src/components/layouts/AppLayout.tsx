import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import {
  LayoutDashboard,
  Building2,
  Users,
  BarChart3,
  User,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Activity,
  Database,
  Calendar,
  Flag,
  FileText,
  Bot,
  Layers,
  GitBranch,
  HeartPulse,
  Target,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboards', href: '/dashboards', icon: LayoutDashboard },
  { label: 'Clientes', href: '/admin/tenants', icon: Building2, adminOnly: true },
  { label: 'Usuários', href: '/admin/users', icon: Users, adminOnly: true },
  { label: 'Gerenciar Dashboards', href: '/admin/dashboards', icon: BarChart3, adminOnly: true },
  { label: 'Data Sources', href: '/admin/data-sources', icon: Database, adminOnly: true },
  { label: 'Datasets', href: '/admin/datasets', icon: Layers, adminOnly: true },
  { label: 'Relacionamentos', href: '/admin/relationships', icon: GitBranch, adminOnly: true },
  { label: 'Relatórios', href: '/admin/scheduled-reports', icon: Calendar, adminOnly: true },
  { label: 'Metas', href: '/admin/goals', icon: Target, adminOnly: true },
  { label: 'Feature Flags', href: '/admin/feature-flags', icon: Flag, adminOnly: true },
  { label: 'IA / OpenAI', href: '/admin/ai-settings', icon: Bot, adminOnly: true },
  { label: 'AI Health', href: '/admin/ai-health', icon: Activity, adminOnly: true },
  { label: 'Health Center', href: '/admin/health-center', icon: HeartPulse, adminOnly: true },
  { label: 'Dashboard Health', href: '/admin/health', icon: Activity, adminOnly: true },
  { label: 'Audit Logs', href: '/admin/audit-logs', icon: FileText, adminOnly: true },
];

const managerAllowedRoutes = ['/admin/users', '/admin/dashboards', '/admin/activity-logs', '/admin/scheduled-reports'];

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  viewer: 'Visualizador'
};

export default function AppLayout() {
  const { user, userRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const filteredNavItems = navItems.filter(item => {
    if (!item.adminOnly) return true;
    if (isAdmin) return true;
    if (isManager && managerAllowedRoutes.includes(item.href)) return true;
    return false;
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Pinn Style */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
        "bg-sidebar border-r border-sidebar-border",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-full flex-col">
          {/* Logo Pinn */}
          <div className="flex h-20 items-center justify-between px-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-orange glow-orange">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-gradient-orange">PINN</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Analytics</span>
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navegação */}
          <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1 scrollbar-none">
            {filteredNavItems.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== '/dashboards' && location.pathname.startsWith(item.href));
              
              return (
                <button
                  key={item.href}
                  onClick={() => {
                    navigate(item.href);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-primary/10 text-primary glow-orange-subtle border border-primary/20" 
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <item.icon className={cn(
                    "h-5 w-5 transition-colors",
                    isActive ? "text-primary" : ""
                  )} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="border-t border-sidebar-border p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm hover:bg-sidebar-accent transition-colors">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-orange">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium truncate text-foreground">{user?.email}</p>
                    <p className="text-xs text-muted-foreground">{userRole ? roleLabels[userRole] || userRole : 'Usuário'}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass-strong border-border/50">
                <DropdownMenuItem onClick={() => navigate('/account')} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Minha Conta
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/50" />
                <DropdownMenuItem 
                  onClick={handleSignOut} 
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header - Pinn Style */}
        <header className="flex h-16 items-center gap-4 border-b border-border/50 bg-card/50 backdrop-blur-xl px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          {/* Badge Pinn */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-primary">Pinn Active</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
