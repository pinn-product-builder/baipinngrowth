import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';

type EntityType = 'tenant' | 'user' | 'dashboard' | 'scheduled_report';
type Action = 
  | 'login' 
  | 'logout' 
  | 'view_dashboard' 
  | 'create_tenant' 
  | 'update_tenant' 
  | 'deactivate_tenant'
  | 'create_user'
  | 'update_user'
  | 'deactivate_user'
  | 'create_dashboard'
  | 'update_dashboard'
  | 'deactivate_dashboard'
  | 'dashboard_load_error'
  | 'password_changed'
  | 'send_invite'
  | 'resend_invite'
  | 'create_scheduled_report'
  | 'update_scheduled_report'
  | 'delete_scheduled_report';

export function useActivityLogger() {
  const { user } = useAuth();

  const logActivity = useCallback(async (
    action: Action,
    entityType?: EntityType,
    entityId?: string,
    details?: Record<string, any>
  ) => {
    try {
      await supabase
        .from('activity_logs')
        .insert({
          user_id: user?.id || null,
          action,
          entity_type: entityType || null,
          entity_id: entityId || null,
          details: details || null
        });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }, [user?.id]);

  return { logActivity };
}
