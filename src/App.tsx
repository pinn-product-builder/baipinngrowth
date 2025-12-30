import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/layouts/AppLayout";

// Pages
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
import ActivityLogs from "@/pages/admin/ActivityLogs";
import ScheduledReports from "@/pages/admin/ScheduledReports";
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
            {/* Public routes */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/invite/:token" element={<AcceptInvite />} />
            
            {/* Protected routes */}
            <Route path="/change-password" element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            } />
            
            {/* App layout with nested routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboards" replace />} />
              <Route path="dashboards" element={<Dashboards />} />
              <Route path="dashboards/:id" element={<DashboardView />} />
              <Route path="account" element={<Account />} />
              
              {/* Admin only routes */}
              <Route path="admin/tenants" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Tenants />
                </ProtectedRoute>
              } />
              <Route path="admin/activity-logs" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ActivityLogs />
                </ProtectedRoute>
              } />
              
              {/* Admin + Manager routes */}
              <Route path="admin/users" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Users />
                </ProtectedRoute>
              } />
              <Route path="admin/dashboards" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <AdminDashboards />
                </ProtectedRoute>
              } />
              <Route path="admin/scheduled-reports" element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <ScheduledReports />
                </ProtectedRoute>
              } />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
