/**
 * Hook para gerenciar geração de dashboard
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GenerationMode } from '../constants';

export interface GenerationState {
  isLoading: boolean;
  error: string | null;
  plan: any | null;
  spec: any | null;
  mode: GenerationMode;
}

export function useDashboardGeneration() {
  const [state, setState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    plan: null,
    spec: null,
    mode: 'react_lovable'
  });

  const generatePlan = useCallback(async (
    datasetId: string,
    semanticModel: any,
    prompt: string
  ) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase.functions.invoke('generate-dashboard-plan', {
        body: {
          dataset_id: datasetId,
          semantic_model: semanticModel,
          user_prompt: prompt
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setState(prev => ({
        ...prev,
        isLoading: false,
        plan: data.plan,
        error: null
      }));

      return data.plan;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Erro ao gerar plano'
      }));
      throw error;
    }
  }, []);

  const generateSpec = useCallback(async (
    datasetId: string,
    plan: any,
    semanticModel: any
  ) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase.functions.invoke('generate-dashboard-spec', {
        body: {
          dataset_id: datasetId,
          plan,
          semantic_model: semanticModel
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setState(prev => ({
        ...prev,
        isLoading: false,
        spec: data.spec,
        error: null
      }));

      return data.spec;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Erro ao gerar spec'
      }));
      throw error;
    }
  }, []);

  const setMode = useCallback((mode: GenerationMode) => {
    setState(prev => ({ ...prev, mode }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      plan: null,
      spec: null,
      mode: 'react_lovable'
    });
  }, []);

  return {
    state,
    generatePlan,
    generateSpec,
    setMode,
    reset
  };
}


