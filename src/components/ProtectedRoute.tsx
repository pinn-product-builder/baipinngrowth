import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, userRole, tenantActive, passwordChanged, isLoading, signOut } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingPage message="Checking authentication..." />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Force password change for first login (only if passwordChanged is explicitly false)
  if (passwordChanged === false && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  // Block if tenant is inactive (only for non-admin users with a tenant)
  if (userRole !== 'admin' && tenantActive === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Account Suspended</CardTitle>
            <CardDescription>
              Your organization's account has been suspended. Please contact your administrator for assistance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={async () => {
                await signOut();
                window.location.href = '/auth';
              }}
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check role-based access
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboards" replace />;
  }

  return <>{children}</>;
}
