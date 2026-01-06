import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

import type { Json } from '@/integrations/supabase/types';

interface SpecVersion {
  id: string;
  version: number;
  dashboard_spec: Json | null;
  dashboard_layout: Json | null;
  created_by: string | null;
  created_at: string;
  notes: string | null;
}

interface UseSpecVersionsReturn {
  versions: SpecVersion[];
  currentVersion: number;
  isLoading: boolean;
  saveVersion: (spec?: Record<string, any>, layout?: Record<string, any>, notes?: string) => Promise<boolean>;
  rollbackToVersion: (version: number) => Promise<{ spec: Json | null; layout: Json | null } | null>;
  refetch: () => Promise<void>;
}

export function useSpecVersions(dashboardId: string): UseSpecVersionsReturn {
  const [versions, setVersions] = useState<SpecVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVersions = useCallback(async () => {
    if (!dashboardId) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('dashboard_spec_versions')
        .select('*')
        .eq('dashboard_id', dashboardId)
        .order('version', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error) {
      console.error('Error fetching spec versions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const currentVersion = versions.length > 0 ? versions[0].version : 0;

  const saveVersion = async (
    spec?: Record<string, any>,
    layout?: Record<string, any>,
    notes?: string
  ): Promise<boolean> => {
    if (!dashboardId) return false;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const newVersion = currentVersion + 1;

      const { error } = await supabase
        .from('dashboard_spec_versions')
        .insert({
          dashboard_id: dashboardId,
          version: newVersion,
          dashboard_spec: spec,
          dashboard_layout: layout,
          created_by: user.id,
          notes,
        });

      if (error) throw error;

      await fetchVersions();
      return true;
    } catch (error) {
      console.error('Error saving spec version:', error);
      return false;
    }
  };

  const rollbackToVersion = async (version: number): Promise<{ spec: Json | null; layout: Json | null } | null> => {
    try {
      const targetVersion = versions.find(v => v.version === version);
      if (!targetVersion) {
        throw new Error(`Version ${version} not found`);
      }

      // Update the dashboard with the rollback data
      const updateData: Record<string, any> = {};
      if (targetVersion.dashboard_spec) {
        updateData.dashboard_spec = targetVersion.dashboard_spec;
      }
      if (targetVersion.dashboard_layout) {
        updateData.dashboard_layout = targetVersion.dashboard_layout;
      }

      const { error } = await supabase
        .from('dashboards')
        .update(updateData)
        .eq('id', dashboardId);

      if (error) throw error;

      // Save the rollback as a new version
      await saveVersion(
        (targetVersion.dashboard_spec as Record<string, any>) ?? undefined,
        (targetVersion.dashboard_layout as Record<string, any>) ?? undefined,
        `Rollback para versão ${version}`
      );

      return {
        spec: targetVersion.dashboard_spec,
        layout: targetVersion.dashboard_layout,
      };
    } catch (error) {
      console.error('Error rolling back:', error);
      return null;
    }
  };

  return {
    versions,
    currentVersion,
    isLoading,
    saveVersion,
    rollbackToVersion,
    refetch: fetchVersions,
  };
}

export default useSpecVersions;
