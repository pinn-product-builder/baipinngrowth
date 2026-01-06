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
  Sun,
  Moon,
  Monitor,
  Layers,
  GitBranch
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
  { label: 'Feature Flags', href: '/admin/feature-flags', icon: Flag, adminOnly: true },
  { label: 'IA / OpenAI', href: '/admin/ai-settings', icon: Bot, adminOnly: true },
  { label: 'AI Health', href: '/admin/ai-health', icon: Activity, adminOnly: true },
  { label: 'Dashboard Health', href: '/admin/health', icon: Activity, adminOnly: true },
  { label: 'Audit Logs', href: '/admin/audit-logs', icon: FileText, adminOnly: true },
];

// Rotas permitidas para manager (subconjunto de admin)
const managerAllowedRoutes = ['/admin/users', '/admin/dashboards', '/admin/activity-logs', '/admin/scheduled-reports'];

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  viewer: 'Visualizador'
};

export default function AppLayout() {
  const { user, userRole, signOut } = useAuth();
  const { theme, setTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const getThemeIcon = () => {
    if (theme === 'system') return <Monitor className="h-4 w-4" />;
    return isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />;
  };

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

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
    <div className="flex h-screen overflow-hidden">
      {/* Overlay do sidebar mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
                <BarChart3 className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
              <span className="text-lg font-semibold">BAI Analytics</span>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navegação */}
          <nav className="flex-1 space-y-1 px-3 py-4">
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
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-primary" 
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Seção do usuário */}
          <div className="border-t border-sidebar-border p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium truncate">{user?.email}</p>
                    <p className="text-xs text-sidebar-foreground/60">{userRole ? roleLabels[userRole] || userRole : 'Usuário'}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-sidebar-foreground/60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/account')}>
                  <User className="mr-2 h-4 w-4" />
                  Conta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme('light')}>
                  <Sun className="mr-2 h-4 w-4" />
                  Tema claro
                  {theme === 'light' && <span className="ml-auto text-xs text-primary">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>
                  <Moon className="mr-2 h-4 w-4" />
                  Tema escuro
                  {theme === 'dark' && <span className="ml-auto text-xs text-primary">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>
                  <Monitor className="mr-2 h-4 w-4" />
                  Sistema
                  {theme === 'system' && <span className="ml-auto text-xs text-primary">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Barra superior */}
        <header className="flex h-16 items-center gap-4 border-b bg-card px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          {/* Theme toggle in header */}
          <button
            onClick={cycleTheme}
            className="flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors"
            title={`Tema: ${theme === 'light' ? 'Claro' : theme === 'dark' ? 'Escuro' : 'Sistema'}`}
          >
            {getThemeIcon()}
          </button>
        </header>

        {/* Conteúdo da página */}
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}