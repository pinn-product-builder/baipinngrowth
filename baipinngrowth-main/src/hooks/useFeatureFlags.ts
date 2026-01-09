import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface FeatureFlag {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

interface UseFeatureFlagsReturn {
  flags: Record<string, FeatureFlag>;
  isEnabled: (flagName: string) => boolean;
  getConfig: (flagName: string) => Record<string, any>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useFeatureFlags(): UseFeatureFlagsReturn {
  const { tenantId } = useAuth();
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch global flags and tenant-specific flags
      const { data, error } = await supabase
        .from('feature_flags')
        .select('name, enabled, config, is_global, tenant_id')
        .or(`is_global.eq.true,tenant_id.eq.${tenantId}`);

      if (error) throw error;

      // Merge flags: tenant-specific overrides global
      const flagMap: Record<string, FeatureFlag> = {};
      
      // First, add all global flags
      (data || [])
        .filter(f => f.is_global)
        .forEach(f => {
          flagMap[f.name] = {
            name: f.name,
            enabled: f.enabled,
            config: f.config as Record<string, any> || {},
          };
        });
      
      // Then, override with tenant-specific flags
      (data || [])
        .filter(f => !f.is_global && f.tenant_id === tenantId)
        .forEach(f => {
          flagMap[f.name] = {
            name: f.name,
            enabled: f.enabled,
            config: f.config as Record<string, any> || {},
          };
        });

      setFlags(flagMap);
    } catch (error) {
      console.error('Error fetching feature flags:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchFlags();
    }
  }, [tenantId, fetchFlags]);

  const isEnabled = useCallback((flagName: string): boolean => {
    return flags[flagName]?.enabled ?? false;
  }, [flags]);

  const getConfig = useCallback((flagName: string): Record<string, any> => {
    return flags[flagName]?.config ?? {};
  }, [flags]);

  return {
    flags,
    isEnabled,
    getConfig,
    isLoading,
    refetch: fetchFlags,
  };
}

export default useFeatureFlags;
