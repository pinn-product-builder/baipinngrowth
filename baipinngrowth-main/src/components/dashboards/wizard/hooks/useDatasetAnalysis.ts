/**
 * Hook para gerenciar análise de dataset
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { detectCrmFunnelDataset } from '../utils/crmDetection';

export interface DatasetAnalysis {
  isLoading: boolean;
  error: string | null;
  semanticModel: any | null;
  diagnosticInfo: any | null;
  testQueryResult: any | null;
}

export function useDatasetAnalysis() {
  const [analysis, setAnalysis] = useState<DatasetAnalysis>({
    isLoading: false,
    error: null,
    semanticModel: null,
    diagnosticInfo: null,
    testQueryResult: null
  });

  const analyzeDataset = useCallback(async (datasetId: string) => {
    setAnalysis(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Build semantic model
      const { data: semanticData, error: semanticError } = await supabase.functions.invoke(
        'build-semantic-model',
        { body: { dataset_id: datasetId } }
      );

      if (semanticError) throw semanticError;
      if (semanticData?.error) throw new Error(semanticData.error);

      const semanticModel = semanticData;

      // Detect CRM funnel
      const columns = semanticModel?.columns?.map((c: any) => c.name) || [];
      const { data: datasetData } = await supabase
        .from('datasets')
        .select('name')
        .eq('id', datasetId)
        .single();

      const crmDetection = detectCrmFunnelDataset(columns, datasetData?.name || '');

      // Test query
      const { data: testData, error: testError } = await supabase.functions.invoke(
        'dataset-preview',
        { body: { dataset_id: datasetId, limit: 100 } }
      );

      if (testError) throw testError;

      setAnalysis({
        isLoading: false,
        error: null,
        semanticModel,
        diagnosticInfo: {
          columns_detected: columns.map((name: string) => ({
            name,
            semantic: semanticModel?.columns?.find((c: any) => c.name === name)?.semantic_type || null,
            label: semanticModel?.columns?.find((c: any) => c.name === name)?.display_label || name
          })),
          time_column: semanticModel?.time_column || null,
          funnel_candidates: crmDetection.isCrm ? columns.filter((c: string) => 
            c.startsWith('st_') || c.includes('entrada') || c.includes('venda')
          ) : [],
          warnings: [],
          errors: [],
          assumptions: crmDetection.reasons
        },
        testQueryResult: testData
      });
    } catch (error) {
      setAnalysis(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }));
    }
  }, []);

  const resetAnalysis = useCallback(() => {
    setAnalysis({
      isLoading: false,
      error: null,
      semanticModel: null,
      diagnosticInfo: null,
      testQueryResult: null
    });
  }, []);

  return {
    analysis,
    analyzeDataset,
    resetAnalysis
  };
}


