import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/layouts/AppLayout";
import Auth from "@/pages/Auth";
import Setup from "@/pages/Setup";
import AcceptInvite from "@/pages/AcceptInvite";
import ChangePassword from "@/pages/ChangePassword";
import Dashboards from "@/pages/Dashboards";
import DashboardView from "@/pages/DashboardView";
import Account from "@/pages/Account";
import Tenants from "@/pages/admin/Tenants";
import Users from "@/pages/admin/Users";
import AdminDashboards from "@/pages/admin/AdminDashboards";
import DataSources from "@/pages/admin/DataSources";
import ActivityLogs from "@/pages/admin/ActivityLogs";
import ScheduledReports from "@/pages/admin/ScheduledReports";
import DashboardHealth from "@/pages/admin/DashboardHealth";
import FeatureFlags from "@/pages/admin/FeatureFlags";
import AuditLogs from "@/pages/admin/AuditLogs";
import TenantAISettings from "@/pages/admin/TenantAISettings";
import AIHealth from "@/pages/admin/AIHealth";
import Datasets from "@/pages/admin/Datasets";
import DatasetRelationships from "@/pages/admin/DatasetRelationships";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/change-password" element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            } />
            <Route path="/" element={<Navigate to="/dashboards" replace />} />
            
            {/* Protected routes with layout */}
            <Route element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route path="/dashboards" element={<Dashboards />} />
              <Route path="/dashboards/:id" element={<DashboardView />} />
              <Route path="/account" element={<Account />} />
              
              {/* Admin routes */}
              <Route path="/admin/tenants" element={
                <ProtectedRoute requireAdmin>
                  <Tenants />
                </ProtectedRoute>
              } />
              <Route path="/admin/users" element={
                <ProtectedRoute requireAdmin>
                  <Users />
                </ProtectedRoute>
              } />
              <Route path="/admin/dashboards" element={
                <ProtectedRoute requireAdmin>
                  <AdminDashboards />
                </ProtectedRoute>
              } />
              <Route path="/admin/data-sources" element={
                <ProtectedRoute requireAdmin>
                  <DataSources />
                </ProtectedRoute>
              } />
              <Route path="/admin/activity-logs" element={
                <ProtectedRoute requireAdmin>
                  <ActivityLogs />
                </ProtectedRoute>
              } />
              <Route path="/admin/scheduled-reports" element={
                <ProtectedRoute requireAdmin>
                  <ScheduledReports />
                </ProtectedRoute>
              } />
              <Route path="/admin/health" element={
                <ProtectedRoute requireAdmin>
                  <DashboardHealth />
                </ProtectedRoute>
              } />
              <Route path="/admin/feature-flags" element={
                <ProtectedRoute requireAdmin>
                  <FeatureFlags />
                </ProtectedRoute>
              } />
              <Route path="/admin/audit-logs" element={
                <ProtectedRoute requireAdmin>
                  <AuditLogs />
                </ProtectedRoute>
              } />
              <Route path="/admin/ai-settings" element={
                <ProtectedRoute requireAdmin>
                  <TenantAISettings />
                </ProtectedRoute>
              } />
              <Route path="/admin/ai-health" element={
                <ProtectedRoute requireAdmin>
                  <AIHealth />
                </ProtectedRoute>
              } />
              <Route path="/admin/datasets" element={
                <ProtectedRoute requireAdmin>
                  <Datasets />
                </ProtectedRoute>
              } />
              <Route path="/admin/relationships" element={
                <ProtectedRoute requireAdmin>
                  <DatasetRelationships />
                </ProtectedRoute>
              } />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
