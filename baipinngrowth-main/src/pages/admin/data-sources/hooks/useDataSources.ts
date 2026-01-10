/**
 * Hook para gerenciar lista de data sources
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { DataSource, Tenant } from '../types';

export function useDataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      setTenants(tenantsData || []);

      const { data: dsData, error } = await supabase
        .from('tenant_data_sources')
        .select(`
          *,
          tenants (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDataSources((dsData as any) || []);
    } catch (error) {
      console.error('Erro ao carregar data sources:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar data sources.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    dataSources,
    tenants,
    isLoading,
    refetch: fetchData,
  };
}

