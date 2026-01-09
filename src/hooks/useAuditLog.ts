import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AuditLogEntry {
  action: string;
  entity_type: string;
  entity_id?: string;
  entity_name?: string;
  before_data?: Record<string, any>;
  after_data?: Record<string, any>;
}

export function useAuditLog() {
  const { user, tenantId } = useAuth();
  const [isLogging, setIsLogging] = useState(false);

  const logAction = async (entry: AuditLogEntry): Promise<boolean> => {
    if (!user || !tenantId) {
      console.warn('Cannot log audit: no user or tenant');
      return false;
    }

    setIsLogging(true);
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          tenant_id: tenantId,
          actor_user_id: user.id,
          action: entry.action,
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
          entity_name: entry.entity_name,
          before_data: entry.before_data,
          after_data: entry.after_data,
          // IP and user agent would typically be captured by edge function
        });

      if (error) {
        console.error('Failed to log audit:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Audit log error:', error);
      return false;
    } finally {
      setIsLogging(false);
    }
  };

  // Common audit actions
  const logCreate = (entityType: string, entityId: string, entityName?: string, data?: Record<string, any>) =>
    logAction({ action: 'create', entity_type: entityType, entity_id: entityId, entity_name: entityName, after_data: data });

  const logUpdate = (entityType: string, entityId: string, entityName?: string, before?: Record<string, any>, after?: Record<string, any>) =>
    logAction({ action: 'update', entity_type: entityType, entity_id: entityId, entity_name: entityName, before_data: before, after_data: after });

  const logDelete = (entityType: string, entityId: string, entityName?: string, data?: Record<string, any>) =>
    logAction({ action: 'delete', entity_type: entityType, entity_id: entityId, entity_name: entityName, before_data: data });

  const logPublish = (entityType: string, entityId: string, entityName?: string) =>
    logAction({ action: 'publish', entity_type: entityType, entity_id: entityId, entity_name: entityName });

  const logUnpublish = (entityType: string, entityId: string, entityName?: string) =>
    logAction({ action: 'unpublish', entity_type: entityType, entity_id: entityId, entity_name: entityName });

  return {
    logAction,
    logCreate,
    logUpdate,
    logDelete,
    logPublish,
    logUnpublish,
    isLogging,
  };
}

export default useAuditLog;
