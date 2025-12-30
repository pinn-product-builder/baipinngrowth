import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingPage } from '@/components/ui/loading-spinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, userRole, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingPage message="Checking authentication..." />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requireAdmin && userRole !== 'admin') {
    return <Navigate to="/dashboards" replace />;
  }

  return <>{children}</>;
}
