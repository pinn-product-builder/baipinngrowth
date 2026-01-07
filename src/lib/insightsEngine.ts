/**
 * Insights Engine - Generates problems, opportunities, and actions from dashboard data
 * Uses statistical analysis (no AI required) for anomaly detection and bottleneck identification
 */

export interface DataRow {
  [key: string]: any;
}

export interface Insight {
  id: string;
  type: 'problem' | 'opportunity' | 'action' | 'anomaly' | 'bottleneck';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  metricKey?: string;
  currentValue?: number;
  comparisonValue?: number;
  changePercent?: number;
  impactEstimate?: string;
  suggestedAction?: string;
  details?: Record<string, any>;
}

export interface DataQualityIssue {
  type: 'missing_dates' | 'zero_cost_with_leads' | 'nan_values' | 'outlier' | 'stale_data' | 'negative_values';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  affectedDates?: string[];
  affectedColumns?: string[];
  details?: Record<string, any>;
}

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  conversionRate?: number;
  dropoff?: number;
}

export interface EngineResult {
  insights: Insight[];
  dataQuality: DataQualityIssue[];
  healthScore: number;
  funnelAnalysis?: FunnelStage[];
}

// Statistical helpers
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

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function isOutlier(value: number, values: number[], threshold = 2): boolean {
  const avg = mean(values);
  const sd = stdDev(values);
  if (sd === 0) return false;
  return Math.abs(value - avg) > threshold * sd;
}

// Date helpers
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getMissingDates(dates: string[]): string[] {
  if (dates.length < 2) return [];
  
  const sortedDates = [...dates].sort();
  const missing: string[] = [];
  
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = parseDate(sortedDates[i - 1]);
    const curr = parseDate(sortedDates[i]);
    if (!prev || !curr) continue;
    
    const daysDiff = Math.floor((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 1) {
      for (let d = 1; d < daysDiff; d++) {
        const missingDate = new Date(prev.getTime() + d * 24 * 60 * 60 * 1000);
        missing.push(formatDate(missingDate));
      }
    }
  }
  
  return missing;
}

// Identify funnel columns (assumes columns are ordered by funnel stage)
function identifyFunnelColumns(data: DataRow[]): string[] {
  if (!data.length) return [];
  
  const row = data[0];
  const numericColumns: { key: string; sum: number }[] = [];
  
  for (const key of Object.keys(row)) {
    if (['dia', 'date', 'data', 'id'].includes(key.toLowerCase())) continue;
    
    const values = data.map(r => Number(r[key]) || 0);
    const sum = values.reduce((a, b) => a + b, 0);
    
    if (sum > 0) {
      numericColumns.push({ key, sum });
    }
  }
  
  // Sort by sum descending (top of funnel has more volume)
  return numericColumns
    .sort((a, b) => b.sum - a.sum)
    .map(c => c.key);
}

// Analyze funnel for bottlenecks
function analyzeFunnel(data: DataRow[], funnelColumns: string[]): FunnelStage[] {
  if (funnelColumns.length < 2) return [];
  
  const stages: FunnelStage[] = [];
  
  for (let i = 0; i < funnelColumns.length; i++) {
    const key = funnelColumns[i];
    const values = data.map(r => Number(r[key]) || 0);
    const total = values.reduce((a, b) => a + b, 0);
    
    const stage: FunnelStage = {
      key,
      label: formatLabel(key),
      value: total,
    };
    
    if (i > 0 && stages[i - 1].value > 0) {
      stage.conversionRate = (total / stages[i - 1].value) * 100;
      stage.dropoff = 100 - stage.conversionRate;
    }
    
    stages.push(stage);
  }
  
  return stages;
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Main insights engine
export function generateInsights(
  currentData: DataRow[],
  previousData?: DataRow[],
  dateColumn = 'dia'
): EngineResult {
  const insights: Insight[] = [];
  const dataQuality: DataQualityIssue[] = [];
  let healthScore = 100;

  if (!currentData.length) {
    return { insights: [], dataQuality: [], healthScore: 0 };
  }

  // 1. Data Quality Checks
  const dates = currentData.map(r => r[dateColumn]).filter(Boolean);
  const missingDates = getMissingDates(dates);
  
  if (missingDates.length > 0) {
    dataQuality.push({
      type: 'missing_dates',
      severity: missingDates.length > 3 ? 'critical' : 'warning',
      title: 'Datas faltantes detectadas',
      description: `${missingDates.length} dia(s) sem dados no período analisado.`,
      affectedDates: missingDates.slice(0, 10),
    });
    healthScore -= Math.min(30, missingDates.length * 5);
  }

  // Check for stale data
  const latestDate = dates.length > 0 ? parseDate(dates.sort().reverse()[0]) : null;
  if (latestDate) {
    const daysSinceLastData = Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLastData > 3) {
      dataQuality.push({
        type: 'stale_data',
        severity: daysSinceLastData > 7 ? 'critical' : 'warning',
        title: 'Dados desatualizados',
        description: `Último registro há ${daysSinceLastData} dias.`,
      });
      healthScore -= Math.min(20, daysSinceLastData * 3);
    }
  }

  // Check for zero cost with leads (anomaly)
  const costColumns = Object.keys(currentData[0]).filter(k => 
    k.toLowerCase().includes('custo') || k.toLowerCase().includes('cost') || k.toLowerCase().includes('investimento')
  );
  const leadColumns = Object.keys(currentData[0]).filter(k => 
    k.toLowerCase().includes('lead') || k.toLowerCase().includes('cadastro')
  );

  if (costColumns.length > 0 && leadColumns.length > 0) {
    const zeroCostDays = currentData.filter(row => {
      const cost = Number(row[costColumns[0]]) || 0;
      const leads = Number(row[leadColumns[0]]) || 0;
      return cost === 0 && leads > 0;
    });
    
    if (zeroCostDays.length > 0) {
      dataQuality.push({
        type: 'zero_cost_with_leads',
        severity: 'warning',
        title: 'Leads sem custo registrado',
        description: `${zeroCostDays.length} dia(s) com leads mas sem custo.`,
        affectedDates: zeroCostDays.slice(0, 5).map(r => r[dateColumn]),
      });
      healthScore -= 10;
    }
  }

  // 2. Funnel Analysis
  const funnelColumns = identifyFunnelColumns(currentData);
  const funnelAnalysis = analyzeFunnel(currentData, funnelColumns);
  
  // Find bottlenecks (stages with lowest conversion)
  const stagesWithDropoff = funnelAnalysis.filter(s => s.dropoff !== undefined);
  if (stagesWithDropoff.length > 0) {
    const worstStage = stagesWithDropoff.reduce((worst, current) => 
      (current.dropoff || 0) > (worst.dropoff || 0) ? current : worst
    );
    
    if (worstStage.dropoff && worstStage.dropoff > 50) {
      insights.push({
        id: `bottleneck-${worstStage.key}`,
        type: 'bottleneck',
        priority: worstStage.dropoff > 70 ? 'critical' : 'high',
        title: `Gargalo crítico: ${worstStage.label}`,
        description: `Taxa de conversão de apenas ${(100 - worstStage.dropoff).toFixed(1)}%. ${worstStage.dropoff.toFixed(1)}% dos leads são perdidos nesta etapa.`,
        metricKey: worstStage.key,
        currentValue: worstStage.conversionRate,
        suggestedAction: `Investigue por que ${worstStage.dropoff.toFixed(0)}% não avançam de "${formatLabel(funnelColumns[funnelColumns.indexOf(worstStage.key) - 1])}" para "${worstStage.label}".`,
      });
    }
  }

  // 3. Period-over-Period Comparison
  if (previousData && previousData.length > 0) {
    const numericKeys = Object.keys(currentData[0]).filter(k => {
      const sample = currentData[0][k];
      return typeof sample === 'number' || !isNaN(Number(sample));
    });

    for (const key of numericKeys) {
      if (['id', dateColumn].includes(key)) continue;
      
      const currentSum = currentData.reduce((s, r) => s + (Number(r[key]) || 0), 0);
      const previousSum = previousData.reduce((s, r) => s + (Number(r[key]) || 0), 0);
      const change = percentChange(currentSum, previousSum);
      
      // Significant changes (>20%)
      if (Math.abs(change) > 20) {
        const isCostMetric = key.toLowerCase().includes('custo') || key.toLowerCase().includes('cpl') || key.toLowerCase().includes('cac');
        const isPositiveChange = isCostMetric ? change < 0 : change > 0;
        
        if (isPositiveChange) {
          insights.push({
            id: `opportunity-${key}`,
            type: 'opportunity',
            priority: Math.abs(change) > 50 ? 'high' : 'medium',
            title: `${formatLabel(key)} ${isCostMetric ? 'reduziu' : 'cresceu'} ${Math.abs(change).toFixed(1)}%`,
            description: `Comparado ao período anterior: ${previousSum.toLocaleString('pt-BR')} → ${currentSum.toLocaleString('pt-BR')}.`,
            metricKey: key,
            currentValue: currentSum,
            comparisonValue: previousSum,
            changePercent: change,
            suggestedAction: 'Identifique o que está funcionando e escale essa estratégia.',
          });
        } else if (Math.abs(change) > 30) {
          insights.push({
            id: `problem-${key}`,
            type: 'problem',
            priority: Math.abs(change) > 50 ? 'critical' : 'high',
            title: `Alerta: ${formatLabel(key)} ${isCostMetric ? 'subiu' : 'caiu'} ${Math.abs(change).toFixed(1)}%`,
            description: `Queda significativa vs período anterior: ${previousSum.toLocaleString('pt-BR')} → ${currentSum.toLocaleString('pt-BR')}.`,
            metricKey: key,
            currentValue: currentSum,
            comparisonValue: previousSum,
            changePercent: change,
            suggestedAction: 'Investigue a causa imediatamente e tome ação corretiva.',
          });
        }
      }
    }

    // Detect anomalies (outliers in daily values)
    for (const key of numericKeys.slice(0, 5)) { // Limit to top 5 metrics
      if (['id', dateColumn].includes(key)) continue;
      
      const values = currentData.map(r => Number(r[key]) || 0);
      const outlierDays = currentData.filter((row, i) => isOutlier(values[i], values));
      
      if (outlierDays.length > 0 && outlierDays.length <= 3) {
        insights.push({
          id: `anomaly-${key}`,
          type: 'anomaly',
          priority: 'medium',
          title: `Anomalia detectada em ${formatLabel(key)}`,
          description: `${outlierDays.length} dia(s) com valores fora do padrão.`,
          metricKey: key,
          suggestedAction: 'Verifique se há erro de dados ou evento excepcional.',
          details: { dates: outlierDays.map(r => r[dateColumn]) },
        });
      }
    }
  }

  // 4. Generate Action Suggestions based on problems
  const problems = insights.filter(i => i.type === 'problem' || i.type === 'bottleneck');
  if (problems.length > 0) {
    const topProblem = problems.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })[0];
    
    insights.push({
      id: 'action-main',
      type: 'action',
      priority: 'high',
      title: 'Ação recomendada prioritária',
      description: topProblem.suggestedAction || `Analise a causa do problema "${topProblem.title}" e implemente correções.`,
      details: { relatedInsight: topProblem.id },
    });
  }

  // Ensure health score is within bounds
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Sort insights by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    insights,
    dataQuality,
    healthScore,
    funnelAnalysis,
  };
}
