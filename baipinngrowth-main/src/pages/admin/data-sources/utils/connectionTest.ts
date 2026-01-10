/**
 * Utilitários para teste de conexão de Data Sources
 */

import { supabase } from '@/integrations/supabase/client';
import type { DataSource, TestStatus } from '../types';

export interface TestResult {
  status: TestStatus;
  message: string;
}

/**
 * Testa conexão de proxy/webhook
 */
export async function testProxyConnection(ds: DataSource): Promise<TestResult> {
  try {
    const healthUrl = `${ds.base_url}/health`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (ds.auth_mode === 'bearer_token' && ds.bearer_token) {
      headers['Authorization'] = `Bearer ${ds.bearer_token}`;
    }

    const response = await fetch(healthUrl, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.ok) {
      return {
        status: 'success',
        message: result.message || 'Proxy online'
      };
    } else {
      throw new Error(result.message || 'Proxy retornou erro');
    }
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Testa conexão de Supabase
 */
export async function testSupabaseConnection(ds: DataSource): Promise<TestResult> {
  try {
    const response = await supabase.functions.invoke('test-data-source', {
      body: { data_source_id: ds.id }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Erro ao chamar função');
    }

    const result = response.data;
    
    if (result.ok) {
      return {
        status: 'success',
        message: result.message
      };
    } else {
      const errorMsg = result.error?.message || 'Erro desconhecido';
      return {
        status: 'error',
        message: errorMsg
      };
    }
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Testa conexão de Google Sheets
 */
export async function testGoogleSheetsConnection(ds: DataSource): Promise<TestResult> {
  try {
    const response = await supabase.functions.invoke('google-sheets-connect', {
      body: { action: 'test_connection', data_source_id: ds.id }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Erro ao chamar função');
    }

    const result = response.data;
    
    if (result.ok) {
      return {
        status: 'success',
        message: result.message
      };
    } else {
      const errorMsg = result.error?.message || 'Erro desconhecido';
      return {
        status: 'error',
        message: errorMsg
      };
    }
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Testa conexão baseado no tipo do data source
 */
export async function testConnection(ds: DataSource): Promise<TestResult> {
  if (ds.type === 'proxy_webhook') {
    return testProxyConnection(ds);
  } else if (ds.type === 'google_sheets') {
    return testGoogleSheetsConnection(ds);
  } else {
    return testSupabaseConnection(ds);
  }
}

