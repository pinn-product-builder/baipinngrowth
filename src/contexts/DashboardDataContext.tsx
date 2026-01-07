/**
 * DashboardDataContext - Single Source of Truth for dashboard data
 * Centralizes data, filters, and aggregation functions used by both 
 * Dashboard Viewer and Decision Center
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { DateRange } from '@/components/dashboards/viewer/DashboardFilterBar';

// ================== TYPES ==================

export interface DataRow {
  [key: string]: any;
}

export interface AggregationFunctions {
  sum: (key: string) => number;
  avg: (key: string) => number;
  count: (key: string) => number;
  min: (key: string) => number;
  max: (key: string) => number;
  rate: (numerator: string, denominator: string) => number;
  pctChange: (currentKey: string, previousKey?: string) => number;
  safeDiv: (a: number, b: number) => number;
}

export interface DataMetadata {
  dashboardId: string;
  tenantId?: string;
  dateRange: DateRange;
  dateColumn: string;
  timezone: string;
  filters: Record<string, any>;
  fetchedAt: Date;
  rowCount: number;
  columns: string[];
}

export interface CalculationTrace {
  id: string;
  label: string;
  formula: string;
  inputs: Record<string, number>;
  output: number;
  unit: 'currency' | 'percent' | 'count' | 'rate';
  source: string;
  dateRange: string;
  calculatedAt: Date;
}

export interface DashboardDataContextValue {
  // Data
  data: DataRow[];
  previousData: DataRow[];
  metadata: DataMetadata;
  
  // Aggregated values (cached)
  aggregated: Record<string, number>;
  previousAggregated: Record<string, number>;
  
  // Aggregation functions (use these instead of calculating in components)
  agg: AggregationFunctions;
  prevAgg: AggregationFunctions;
  
  // Calculation tracing for "Ver cálculo" feature
  traces: CalculationTrace[];
  addTrace: (trace: Omit<CalculationTrace, 'id' | 'calculatedAt'>) => string;
  getTrace: (id: string) => CalculationTrace | undefined;
  
  // Validation state
  isValid: boolean;
  validationErrors: string[];
  
  // Comparison helpers
  getPercentChange: (currentVal: number, previousVal: number) => number;
  formatValue: (value: number, unit: 'currency' | 'percent' | 'count' | 'rate') => string;
}

// ================== CONTEXT ==================

const DashboardDataContext = createContext<DashboardDataContextValue | undefined>(undefined);

// ================== HELPERS ==================

function createAggregationFunctions(data: DataRow[]): AggregationFunctions {
  const numericValues = (key: string): number[] => {
    return data
      .map(row => {
        const val = row[key];
        if (typeof val === 'number' && isFinite(val)) return val;
        const parsed = parseFloat(val);
        return isFinite(parsed) ? parsed : NaN;
      })
      .filter(v => !isNaN(v));
  };

  const safeDiv = (a: number, b: number): number => {
    if (!isFinite(a) || !isFinite(b) || b === 0) return 0;
    return a / b;
  };

  return {
    sum: (key: string) => {
      const values = numericValues(key);
      return values.reduce((acc, v) => acc + v, 0);
    },
    
    avg: (key: string) => {
      const values = numericValues(key);
      if (values.length === 0) return 0;
      return values.reduce((acc, v) => acc + v, 0) / values.length;
    },
    
    count: (key: string) => {
      return data.filter(row => row[key] != null && row[key] !== '').length;
    },
    
    min: (key: string) => {
      const values = numericValues(key);
      return values.length > 0 ? Math.min(...values) : 0;
    },
    
    max: (key: string) => {
      const values = numericValues(key);
      return values.length > 0 ? Math.max(...values) : 0;
    },
    
    rate: (numerator: string, denominator: string) => {
      const num = numericValues(numerator).reduce((a, b) => a + b, 0);
      const den = numericValues(denominator).reduce((a, b) => a + b, 0);
      return safeDiv(num, den);
    },
    
    pctChange: (currentKey: string) => {
      // This is for within-period change (first to last)
      const values = numericValues(currentKey);
      if (values.length < 2) return 0;
      const first = values[0];
      const last = values[values.length - 1];
      return safeDiv(last - first, Math.abs(first)) * 100;
    },
    
    safeDiv,
  };
}

function calculateAggregated(data: DataRow[], agg: AggregationFunctions): Record<string, number> {
  if (data.length === 0) return {};
  
  const result: Record<string, number> = {};
  const sampleRow = data[0];
  
  // Sum all numeric columns
  Object.keys(sampleRow).forEach(key => {
    if (['id', 'dia', 'day', 'date', 'data'].includes(key.toLowerCase())) return;
    const sum = agg.sum(key);
    if (sum !== 0 || data.some(r => typeof r[key] === 'number')) {
      result[key] = sum;
    }
  });
  
  // Calculate derived metrics with safe division
  // v3 fields
  if (result.spend !== undefined && result.spend > 0) {
    if (result.leads_new && result.leads_new > 0) {
      result.cpl = agg.safeDiv(result.spend, result.leads_new);
    }
    if (result.sales && result.sales > 0) {
      result.cac = agg.safeDiv(result.spend, result.sales);
    }
  }
  
  // Legacy fields
  if (result.custo_total !== undefined && result.custo_total > 0) {
    if (result.leads_total && result.leads_total > 0) {
      result.cpl = result.cpl || agg.safeDiv(result.custo_total, result.leads_total);
    }
    if (result.venda_total && result.venda_total > 0) {
      result.cac = result.cac || agg.safeDiv(result.custo_total, result.venda_total);
    }
    if (result.entrada_total && result.entrada_total > 0) {
      result.custo_por_entrada = agg.safeDiv(result.custo_total, result.entrada_total);
    }
  }
  
  // Rates (v3)
  if (result.leads_new && result.leads_new > 0) {
    if (result.meetings_scheduled) {
      result.rate_meetings = agg.safeDiv(result.meetings_scheduled, result.leads_new);
    }
    if (result.sales) {
      result.rate_sales = agg.safeDiv(result.sales, result.leads_new);
    }
  }
  
  // Rates (legacy)
  if (result.leads_total && result.leads_total > 0) {
    if (result.entrada_total) {
      result.taxa_entrada = agg.safeDiv(result.entrada_total, result.leads_total);
    }
    if (result.venda_total) {
      result.taxa_venda_total = agg.safeDiv(result.venda_total, result.leads_total);
    }
  }
  
  if (result.reuniao_agendada_total && result.reuniao_agendada_total > 0 && result.reuniao_realizada_total) {
    result.taxa_comparecimento = agg.safeDiv(result.reuniao_realizada_total, result.reuniao_agendada_total);
  }
  
  return result;
}

function getPercentChange(current: number, previous: number): number {
  if (!isFinite(current) || !isFinite(previous)) return 0;
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatValue(value: number, unit: 'currency' | 'percent' | 'count' | 'rate'): string {
  if (!isFinite(value)) return '—';
  
  switch (unit) {
    case 'currency':
      return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'rate':
      return `${(value * 100).toFixed(1)}%`;
    case 'count':
      return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    default:
      return value.toLocaleString('pt-BR');
  }
}

// ================== PROVIDER ==================

interface DashboardDataProviderProps {
  children: ReactNode;
  data: DataRow[];
  previousData?: DataRow[];
  dashboardId: string;
  tenantId?: string;
  dateRange: DateRange;
  dateColumn?: string;
  filters?: Record<string, any>;
}

export function DashboardDataProvider({
  children,
  data,
  previousData = [],
  dashboardId,
  tenantId,
  dateRange,
  dateColumn = 'dia',
  filters = {},
}: DashboardDataProviderProps) {
  
  // Create aggregation functions
  const agg = useMemo(() => createAggregationFunctions(data), [data]);
  const prevAgg = useMemo(() => createAggregationFunctions(previousData), [previousData]);
  
  // Calculate aggregated values
  const aggregated = useMemo(() => calculateAggregated(data, agg), [data, agg]);
  const previousAggregated = useMemo(() => calculateAggregated(previousData, prevAgg), [previousData, prevAgg]);
  
  // Metadata
  const metadata = useMemo<DataMetadata>(() => ({
    dashboardId,
    tenantId,
    dateRange,
    dateColumn,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    filters,
    fetchedAt: new Date(),
    rowCount: data.length,
    columns: data.length > 0 ? Object.keys(data[0]) : [],
  }), [dashboardId, tenantId, dateRange, dateColumn, filters, data]);
  
  // Calculation traces for "Ver cálculo" feature
  const [traces, setTraces] = React.useState<CalculationTrace[]>([]);
  
  const addTrace = React.useCallback((trace: Omit<CalculationTrace, 'id' | 'calculatedAt'>): string => {
    const id = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const fullTrace: CalculationTrace = {
      ...trace,
      id,
      calculatedAt: new Date(),
    };
    setTraces(prev => [...prev, fullTrace]);
    return id;
  }, []);
  
  const getTrace = React.useCallback((id: string): CalculationTrace | undefined => {
    return traces.find(t => t.id === id);
  }, [traces]);
  
  // Validation
  const validationResult = useMemo(() => {
    const errors: string[] = [];
    
    // Check for empty data
    if (data.length === 0) {
      errors.push('Dataset vazio no período selecionado');
    }
    
    // Check for NaN/Infinity in aggregated values
    Object.entries(aggregated).forEach(([key, value]) => {
      if (!isFinite(value)) {
        errors.push(`Valor inválido para ${key}: ${value}`);
      }
    });
    
    // Check date range consistency
    if (dateRange.start > dateRange.end) {
      errors.push('Data inicial maior que data final');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [data, aggregated, dateRange]);
  
  const value = useMemo<DashboardDataContextValue>(() => ({
    data,
    previousData,
    metadata,
    aggregated,
    previousAggregated,
    agg,
    prevAgg,
    traces,
    addTrace,
    getTrace,
    isValid: validationResult.isValid,
    validationErrors: validationResult.errors,
    getPercentChange,
    formatValue,
  }), [
    data,
    previousData,
    metadata,
    aggregated,
    previousAggregated,
    agg,
    prevAgg,
    traces,
    addTrace,
    getTrace,
    validationResult,
  ]);
  
  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

// ================== HOOK ==================

export function useDashboardData(): DashboardDataContextValue {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new Error('useDashboardData must be used within a DashboardDataProvider');
  }
  return context;
}

// Optional hook that returns undefined if not in provider (for components that may be used outside)
export function useDashboardDataOptional(): DashboardDataContextValue | undefined {
  return useContext(DashboardDataContext);
}
