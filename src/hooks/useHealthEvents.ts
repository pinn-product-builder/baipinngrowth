import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

interface HealthEventInput {
  eventType: 'error' | 'warning' | 'info' | 'alert';
  source: 'datasource' | 'dashboard' | 'edge_function' | 'ai' | 'billing' | 'auth';
  sourceId?: string;
  sourceName?: string;
  traceId?: string;
  errorCode?: string;
  message: string;
  details?: Json;
}

export function useHealthEvents() {
  const { tenantId } = useAuth();

  const logEvent = async (event: HealthEventInput): Promise<boolean> => {
    if (!tenantId) {
      console.warn('Cannot log health event: no tenant');
      return false;
    }

    try {
      const { error } = await supabase
        .from('system_health_events')
        .insert([{
          tenant_id: tenantId,
          event_type: event.eventType,
          source: event.source,
          source_id: event.sourceId,
          source_name: event.sourceName,
          trace_id: event.traceId || crypto.randomUUID().slice(0, 8),
          error_code: event.errorCode,
          message: event.message,
          details: event.details || {},
        }]);

      if (error) {
        console.error('Failed to log health event:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Health event error:', err);
      return false;
    }
  };

  const logError = (
    source: HealthEventInput['source'],
    message: string,
    options?: Partial<Omit<HealthEventInput, 'eventType' | 'source' | 'message'>>
  ) => logEvent({ eventType: 'error', source, message, ...options });

  const logWarning = (
    source: HealthEventInput['source'],
    message: string,
    options?: Partial<Omit<HealthEventInput, 'eventType' | 'source' | 'message'>>
  ) => logEvent({ eventType: 'warning', source, message, ...options });

  const logInfo = (
    source: HealthEventInput['source'],
    message: string,
    options?: Partial<Omit<HealthEventInput, 'eventType' | 'source' | 'message'>>
  ) => logEvent({ eventType: 'info', source, message, ...options });

  const resolveEvent = async (eventId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('system_health_events')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', eventId);

      return !error;
    } catch {
      return false;
    }
  };

  return {
    logEvent,
    logError,
    logWarning,
    logInfo,
    resolveEvent,
  };
}

export default useHealthEvents;
