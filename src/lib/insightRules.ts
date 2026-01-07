/**
 * Insight Rules Engine
 * Explicit, configurable rules for generating insights
 * Avoids inference without evidence, uses thresholds
 */

import { CalculationTrace } from '@/contexts/DashboardDataContext';

// ================== TYPES ==================

export interface InsightRule {
  id: string;
  name: string;
  description: string;
  category: 'problem' | 'opportunity' | 'anomaly' | 'bottleneck';
  enabled: boolean;
  
  // Thresholds
  threshold: number;
  thresholdUnit: 'percent' | 'absolute' | 'stddev';
  minSampleSize: number; // Minimum days/rows for the rule to apply
  
  // Rule check function
  check: (params: RuleCheckParams) => RuleResult | null;
}

export interface RuleCheckParams {
  current: Record<string, number>;
  previous?: Record<string, number>;
  dailyData: Record<string, any>[];
  previousDailyData?: Record<string, any>[];
  dateRange: { start: Date; end: Date };
}

export interface RuleResult {
  ruleId: string;
  type: 'problem' | 'opportunity' | 'action' | 'anomaly' | 'bottleneck';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  
  // For "Ver cálculo" feature
  calculation: {
    formula: string;
    inputs: Record<string, number>;
    output: number;
    unit: 'currency' | 'percent' | 'count' | 'rate';
  };
  
  metricKey?: string;
  currentValue?: number;
  previousValue?: number;
  changePercent?: number;
  suggestedAction?: string;
  confidence: 'low' | 'medium' | 'high';
}

// ================== CONFIGURATION ==================

export interface InsightRulesConfig {
  // Minimum variation to trigger an insight (%)
  minVariationPercent: number;
  
  // Minimum sample size (days)
  minSampleDays: number;
  
  // Cost metrics thresholds
  cplWarningThreshold: number;  // CPL increase %
  cacWarningThreshold: number;  // CAC increase %
  
  // Conversion rate thresholds
  conversionDropThreshold: number; // Drop in conversion rate %
  bottleneckThreshold: number;     // Funnel stage loss %
  
  // Anomaly detection
  anomalyStdDevMultiplier: number;
}

export const DEFAULT_CONFIG: InsightRulesConfig = {
  minVariationPercent: 15,
  minSampleDays: 3,
  cplWarningThreshold: 20,
  cacWarningThreshold: 25,
  conversionDropThreshold: 15,
  bottleneckThreshold: 50,
  anomalyStdDevMultiplier: 2,
};

// ================== HELPER FUNCTIONS ==================

function safePercentChange(current: number, previous: number): number {
  if (!isFinite(current) || !isFinite(previous)) return 0;
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ================== RULES ==================

export const INSIGHT_RULES: InsightRule[] = [
  // Rule: CPL Increase
  {
    id: 'cpl_increase',
    name: 'Aumento de CPL',
    description: 'Detecta quando o Custo por Lead aumenta significativamente',
    category: 'problem',
    enabled: true,
    threshold: 20,
    thresholdUnit: 'percent',
    minSampleSize: 3,
    
    check: ({ current, previous, dailyData }) => {
      if (!previous || dailyData.length < 3) return null;
      
      const currentCPL = current.cpl || current.cpl_v3 || 0;
      const previousCPL = previous.cpl || previous.cpl_v3 || 0;
      
      if (!isFinite(currentCPL) || !isFinite(previousCPL) || previousCPL === 0) return null;
      
      const change = safePercentChange(currentCPL, previousCPL);
      
      if (change > 20) {
        const spend = current.spend || current.custo_total || 0;
        const leads = current.leads_new || current.leads_total || 0;
        
        return {
          ruleId: 'cpl_increase',
          type: 'problem',
          priority: change > 50 ? 'critical' : change > 35 ? 'high' : 'medium',
          title: `CPL subiu ${formatPercent(change)}`,
          description: `O Custo por Lead passou de ${formatCurrency(previousCPL)} para ${formatCurrency(currentCPL)}.`,
          calculation: {
            formula: 'CPL = Custo Total ÷ Leads',
            inputs: {
              custo_total: spend,
              leads: leads,
              cpl_anterior: previousCPL,
              cpl_atual: currentCPL,
            },
            output: currentCPL,
            unit: 'currency',
          },
          metricKey: 'cpl',
          currentValue: currentCPL,
          previousValue: previousCPL,
          changePercent: change,
          suggestedAction: 'Revise os anúncios com pior performance e realoque orçamento para os mais eficientes.',
          confidence: dailyData.length >= 7 ? 'high' : 'medium',
        };
      }
      
      return null;
    },
  },
  
  // Rule: CPL Decrease (opportunity)
  {
    id: 'cpl_decrease',
    name: 'Redução de CPL',
    description: 'Detecta quando o Custo por Lead diminui significativamente',
    category: 'opportunity',
    enabled: true,
    threshold: 15,
    thresholdUnit: 'percent',
    minSampleSize: 3,
    
    check: ({ current, previous, dailyData }) => {
      if (!previous || dailyData.length < 3) return null;
      
      const currentCPL = current.cpl || 0;
      const previousCPL = previous.cpl || 0;
      
      if (!isFinite(currentCPL) || !isFinite(previousCPL) || previousCPL === 0) return null;
      
      const change = safePercentChange(currentCPL, previousCPL);
      
      if (change < -15) {
        const spend = current.spend || current.custo_total || 0;
        const leads = current.leads_new || current.leads_total || 0;
        
        return {
          ruleId: 'cpl_decrease',
          type: 'opportunity',
          priority: change < -30 ? 'high' : 'medium',
          title: `CPL reduziu ${formatPercent(Math.abs(change))}`,
          description: `O Custo por Lead caiu de ${formatCurrency(previousCPL)} para ${formatCurrency(currentCPL)}. Ótima oportunidade!`,
          calculation: {
            formula: 'CPL = Custo Total ÷ Leads',
            inputs: {
              custo_total: spend,
              leads: leads,
              cpl_anterior: previousCPL,
              cpl_atual: currentCPL,
            },
            output: currentCPL,
            unit: 'currency',
          },
          metricKey: 'cpl',
          currentValue: currentCPL,
          previousValue: previousCPL,
          changePercent: change,
          suggestedAction: 'Identifique o que mudou e considere escalar essa estratégia.',
          confidence: dailyData.length >= 7 ? 'high' : 'medium',
        };
      }
      
      return null;
    },
  },
  
  // Rule: CAC Increase
  {
    id: 'cac_increase',
    name: 'Aumento de CAC',
    description: 'Detecta quando o Custo de Aquisição de Cliente aumenta significativamente',
    category: 'problem',
    enabled: true,
    threshold: 25,
    thresholdUnit: 'percent',
    minSampleSize: 3,
    
    check: ({ current, previous, dailyData }) => {
      if (!previous || dailyData.length < 3) return null;
      
      const currentCAC = current.cac || 0;
      const previousCAC = previous.cac || 0;
      
      if (!isFinite(currentCAC) || !isFinite(previousCAC) || previousCAC === 0) return null;
      
      const change = safePercentChange(currentCAC, previousCAC);
      
      if (change > 25) {
        const spend = current.spend || current.custo_total || 0;
        const sales = current.sales || current.venda_total || 0;
        
        return {
          ruleId: 'cac_increase',
          type: 'problem',
          priority: change > 50 ? 'critical' : 'high',
          title: `CAC subiu ${formatPercent(change)}`,
          description: `O Custo de Aquisição passou de ${formatCurrency(previousCAC)} para ${formatCurrency(currentCAC)}.`,
          calculation: {
            formula: 'CAC = Custo Total ÷ Vendas',
            inputs: {
              custo_total: spend,
              vendas: sales,
              cac_anterior: previousCAC,
              cac_atual: currentCAC,
            },
            output: currentCAC,
            unit: 'currency',
          },
          metricKey: 'cac',
          currentValue: currentCAC,
          previousValue: previousCAC,
          changePercent: change,
          suggestedAction: 'Analise a taxa de conversão de leads para vendas e identifique gargalos no funil.',
          confidence: dailyData.length >= 7 ? 'high' : 'medium',
        };
      }
      
      return null;
    },
  },
  
  // Rule: Lead Volume Drop
  {
    id: 'leads_drop',
    name: 'Queda de Leads',
    description: 'Detecta quando o volume de leads cai significativamente',
    category: 'problem',
    enabled: true,
    threshold: 20,
    thresholdUnit: 'percent',
    minSampleSize: 3,
    
    check: ({ current, previous, dailyData }) => {
      if (!previous || dailyData.length < 3) return null;
      
      const currentLeads = current.leads_new || current.leads_total || 0;
      const previousLeads = previous.leads_new || previous.leads_total || 0;
      
      if (!isFinite(currentLeads) || !isFinite(previousLeads) || previousLeads === 0) return null;
      
      const change = safePercentChange(currentLeads, previousLeads);
      
      if (change < -20) {
        return {
          ruleId: 'leads_drop',
          type: 'problem',
          priority: change < -40 ? 'critical' : 'high',
          title: `Volume de leads caiu ${formatPercent(Math.abs(change))}`,
          description: `De ${previousLeads.toLocaleString('pt-BR')} para ${currentLeads.toLocaleString('pt-BR')} leads no período.`,
          calculation: {
            formula: 'Variação = (Atual - Anterior) ÷ |Anterior| × 100',
            inputs: {
              leads_anterior: previousLeads,
              leads_atual: currentLeads,
            },
            output: change,
            unit: 'percent',
          },
          metricKey: 'leads',
          currentValue: currentLeads,
          previousValue: previousLeads,
          changePercent: change,
          suggestedAction: 'Verifique se houve mudança em campanhas, orçamento ou se há problema técnico nos formulários.',
          confidence: dailyData.length >= 7 ? 'high' : 'medium',
        };
      }
      
      return null;
    },
  },
  
  // Rule: Lead Volume Growth
  {
    id: 'leads_growth',
    name: 'Crescimento de Leads',
    description: 'Detecta quando o volume de leads cresce significativamente',
    category: 'opportunity',
    enabled: true,
    threshold: 20,
    thresholdUnit: 'percent',
    minSampleSize: 3,
    
    check: ({ current, previous, dailyData }) => {
      if (!previous || dailyData.length < 3) return null;
      
      const currentLeads = current.leads_new || current.leads_total || 0;
      const previousLeads = previous.leads_new || previous.leads_total || 0;
      
      if (!isFinite(currentLeads) || !isFinite(previousLeads) || previousLeads === 0) return null;
      
      const change = safePercentChange(currentLeads, previousLeads);
      
      if (change > 20) {
        return {
          ruleId: 'leads_growth',
          type: 'opportunity',
          priority: change > 50 ? 'high' : 'medium',
          title: `Volume de leads cresceu ${formatPercent(change)}`,
          description: `De ${previousLeads.toLocaleString('pt-BR')} para ${currentLeads.toLocaleString('pt-BR')} leads. Excelente!`,
          calculation: {
            formula: 'Variação = (Atual - Anterior) ÷ |Anterior| × 100',
            inputs: {
              leads_anterior: previousLeads,
              leads_atual: currentLeads,
            },
            output: change,
            unit: 'percent',
          },
          metricKey: 'leads',
          currentValue: currentLeads,
          previousValue: previousLeads,
          changePercent: change,
          suggestedAction: 'Identifique a fonte desse crescimento e considere aumentar investimento.',
          confidence: dailyData.length >= 7 ? 'high' : 'medium',
        };
      }
      
      return null;
    },
  },
  
  // Rule: Funnel Bottleneck
  {
    id: 'funnel_bottleneck',
    name: 'Gargalo no Funil',
    description: 'Detecta etapas com taxa de conversão muito baixa',
    category: 'bottleneck',
    enabled: true,
    threshold: 50,
    thresholdUnit: 'percent',
    minSampleSize: 5,
    
    check: ({ current, dailyData }) => {
      if (dailyData.length < 5) return null;
      
      // Check conversion rates
      const stages = [
        { from: 'leads', to: 'entrada', rate: current.taxa_entrada },
        { from: 'entrada', to: 'reuniao_agendada', rate: current.taxa_reuniao_agendada },
        { from: 'reuniao_agendada', to: 'reuniao_realizada', rate: current.taxa_comparecimento },
        { from: 'reuniao_realizada', to: 'venda', rate: current.taxa_venda_pos_reuniao },
      ];
      
      for (const stage of stages) {
        if (stage.rate !== undefined && isFinite(stage.rate)) {
          const ratePercent = stage.rate > 1 ? stage.rate : stage.rate * 100;
          
          if (ratePercent < 50 && ratePercent > 0) {
            const dropoff = 100 - ratePercent;
            
            return {
              ruleId: 'funnel_bottleneck',
              type: 'bottleneck',
              priority: dropoff > 70 ? 'critical' : 'high',
              title: `Gargalo: ${formatPercent(dropoff)} perdido em ${stage.to}`,
              description: `A conversão de ${stage.from} para ${stage.to} está em apenas ${formatPercent(ratePercent)}.`,
              calculation: {
                formula: `Taxa = ${stage.to} ÷ ${stage.from} × 100`,
                inputs: {
                  [stage.from]: current[stage.from] || 0,
                  [stage.to]: current[stage.to] || 0,
                },
                output: ratePercent,
                unit: 'percent',
              },
              metricKey: stage.to,
              currentValue: ratePercent,
              suggestedAction: `Investigue por que ${formatPercent(dropoff)} não avançam de ${stage.from} para ${stage.to}.`,
              confidence: dailyData.length >= 14 ? 'high' : 'medium',
            };
          }
        }
      }
      
      return null;
    },
  },
  
  // Rule: Anomaly Detection
  {
    id: 'daily_anomaly',
    name: 'Anomalia Diária',
    description: 'Detecta dias com valores fora do padrão estatístico',
    category: 'anomaly',
    enabled: true,
    threshold: 2,
    thresholdUnit: 'stddev',
    minSampleSize: 7,
    
    check: ({ dailyData }) => {
      if (dailyData.length < 7) return null;
      
      const metricsToCheck = ['spend', 'custo_total', 'leads_new', 'leads_total', 'sales', 'venda_total'];
      
      for (const metric of metricsToCheck) {
        const values = dailyData
          .map(row => {
            const val = row[metric];
            return typeof val === 'number' && isFinite(val) ? val : null;
          })
          .filter((v): v is number => v !== null);
        
        if (values.length < 7) continue;
        
        const avg = mean(values);
        const sd = stdDev(values);
        
        if (sd === 0) continue;
        
        const outliers = values.filter(v => Math.abs(v - avg) > 2 * sd);
        
        if (outliers.length > 0 && outliers.length <= 2) {
          const outlierValue = outliers[0];
          const deviation = (outlierValue - avg) / sd;
          
          return {
            ruleId: 'daily_anomaly',
            type: 'anomaly',
            priority: 'medium',
            title: `Anomalia detectada em ${metric}`,
            description: `Valor ${outlierValue.toLocaleString('pt-BR')} está ${Math.abs(deviation).toFixed(1)} desvios-padrão da média.`,
            calculation: {
              formula: 'Z-score = (Valor - Média) ÷ Desvio Padrão',
              inputs: {
                valor: outlierValue,
                media: avg,
                desvio_padrao: sd,
              },
              output: deviation,
              unit: 'count',
            },
            metricKey: metric,
            currentValue: outlierValue,
            suggestedAction: 'Verifique se há erro de dados ou evento excepcional neste dia.',
            confidence: dailyData.length >= 14 ? 'high' : 'medium',
          };
        }
      }
      
      return null;
    },
  },
];

// ================== MAIN ENGINE ==================

export function runInsightRules(
  params: RuleCheckParams,
  config: Partial<InsightRulesConfig> = {}
): RuleResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const results: RuleResult[] = [];
  
  for (const rule of INSIGHT_RULES) {
    if (!rule.enabled) continue;
    
    // Check minimum sample size
    if (params.dailyData.length < rule.minSampleSize) continue;
    
    try {
      const result = rule.check(params);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.warn(`Rule ${rule.id} failed:`, error);
    }
  }
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  results.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return results;
}

/**
 * Convert RuleResult to CalculationTrace for the "Ver cálculo" feature
 */
export function ruleResultToTrace(result: RuleResult, dateRange: string, source: string): Omit<CalculationTrace, 'id' | 'calculatedAt'> {
  return {
    label: result.title,
    formula: result.calculation.formula,
    inputs: result.calculation.inputs,
    output: result.calculation.output,
    unit: result.calculation.unit,
    source,
    dateRange,
  };
}
