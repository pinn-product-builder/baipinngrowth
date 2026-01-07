/**
 * Data Integrity Validator
 * Validates dashboard data for consistency, preventing incorrect insights
 */

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  checksPerformed: string[];
  summary: string;
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'critical' | 'error';
  affectedFields?: string[];
  details?: Record<string, any>;
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'warning' | 'info';
  affectedFields?: string[];
  details?: Record<string, any>;
}

export interface ValidatorConfig {
  minRowsForInsights: number;
  maxNanPercentage: number;
  requiredFields: string[];
  numericFields: string[];
  dateField: string;
}

const DEFAULT_CONFIG: ValidatorConfig = {
  minRowsForInsights: 3,
  maxNanPercentage: 20,
  requiredFields: [],
  numericFields: [],
  dateField: 'dia',
};

/**
 * Validates that totals match between two calculation sources
 */
export function validateTotalsMatch(
  source1: Record<string, number>,
  source2: Record<string, number>,
  tolerance = 0.01 // 1% tolerance for floating point
): { matches: boolean; discrepancies: Array<{ field: string; val1: number; val2: number; diff: number }> } {
  const discrepancies: Array<{ field: string; val1: number; val2: number; diff: number }> = [];
  
  const allKeys = new Set([...Object.keys(source1), ...Object.keys(source2)]);
  
  allKeys.forEach(key => {
    const val1 = source1[key] ?? 0;
    const val2 = source2[key] ?? 0;
    
    if (!isFinite(val1) || !isFinite(val2)) {
      discrepancies.push({ field: key, val1, val2, diff: NaN });
      return;
    }
    
    const diff = Math.abs(val1 - val2);
    const maxVal = Math.max(Math.abs(val1), Math.abs(val2), 1);
    const relativeDiff = diff / maxVal;
    
    if (relativeDiff > tolerance) {
      discrepancies.push({ field: key, val1, val2, diff });
    }
  });
  
  return {
    matches: discrepancies.length === 0,
    discrepancies,
  };
}

/**
 * Check for NaN/Infinity values in dataset
 */
export function checkNaNInfinity(
  data: Record<string, any>[],
  numericFields?: string[]
): { hasIssues: boolean; issues: Array<{ field: string; rowIndex: number; value: any }> } {
  const issues: Array<{ field: string; rowIndex: number; value: any }> = [];
  
  data.forEach((row, rowIndex) => {
    const fieldsToCheck = numericFields || Object.keys(row).filter(k => typeof row[k] === 'number');
    
    fieldsToCheck.forEach(field => {
      const value = row[field];
      if (typeof value === 'number' && !isFinite(value)) {
        issues.push({ field, rowIndex, value });
      }
    });
  });
  
  return {
    hasIssues: issues.length > 0,
    issues,
  };
}

/**
 * Check for null/empty dataset
 */
export function checkDataSufficiency(
  data: Record<string, any>[],
  minRows: number = 3
): { sufficient: boolean; rowCount: number; message: string } {
  if (!data || !Array.isArray(data)) {
    return { sufficient: false, rowCount: 0, message: 'Dataset inválido ou não fornecido' };
  }
  
  if (data.length === 0) {
    return { sufficient: false, rowCount: 0, message: 'Dataset vazio' };
  }
  
  if (data.length < minRows) {
    return { 
      sufficient: false, 
      rowCount: data.length, 
      message: `Dataset insuficiente: ${data.length} linha(s), mínimo ${minRows}` 
    };
  }
  
  return { sufficient: true, rowCount: data.length, message: 'Dataset suficiente' };
}

/**
 * Check unit consistency (currency vs percent vs count)
 */
export function checkUnitConsistency(
  aggregated: Record<string, number>
): { issues: Array<{ field: string; expectedUnit: string; suspectedIssue: string }> } {
  const issues: Array<{ field: string; expectedUnit: string; suspectedIssue: string }> = [];
  
  // Rate fields should be between 0 and 1 (or 0 and 100 if already percentage)
  const rateFields = ['taxa_entrada', 'taxa_comparecimento', 'taxa_venda_total', 'rate_meetings', 'rate_sales'];
  
  rateFields.forEach(field => {
    const value = aggregated[field];
    if (value !== undefined && isFinite(value)) {
      // If rate > 1, it might already be a percentage or there's an issue
      if (value > 1 && value <= 100) {
        // Likely already in percentage form, which is okay but note it
      } else if (value > 100) {
        issues.push({
          field,
          expectedUnit: 'rate (0-1) or percent (0-100)',
          suspectedIssue: `Valor ${value} está fora do intervalo esperado para uma taxa`,
        });
      }
    }
  });
  
  // Currency fields (CPL, CAC) should generally be positive and reasonable
  const currencyFields = ['cpl', 'cac', 'spend', 'custo_total', 'custo_por_entrada'];
  
  currencyFields.forEach(field => {
    const value = aggregated[field];
    if (value !== undefined && isFinite(value)) {
      if (value < 0) {
        issues.push({
          field,
          expectedUnit: 'currency',
          suspectedIssue: `Valor negativo ${value} para campo monetário`,
        });
      }
    }
  });
  
  return { issues };
}

/**
 * Main validation function that runs all checks
 */
export function validateDataIntegrity(
  data: Record<string, any>[],
  aggregated: Record<string, number>,
  config: Partial<ValidatorConfig> = {}
): ValidationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const checksPerformed: string[] = [];
  
  // 1. Data sufficiency check
  checksPerformed.push('data_sufficiency');
  const sufficiency = checkDataSufficiency(data, cfg.minRowsForInsights);
  if (!sufficiency.sufficient) {
    errors.push({
      code: 'INSUFFICIENT_DATA',
      message: sufficiency.message,
      severity: 'critical',
    });
  }
  
  // 2. NaN/Infinity check
  checksPerformed.push('nan_infinity');
  const nanCheck = checkNaNInfinity(data, cfg.numericFields.length > 0 ? cfg.numericFields : undefined);
  if (nanCheck.hasIssues) {
    const uniqueFields = [...new Set(nanCheck.issues.map(i => i.field))];
    errors.push({
      code: 'NAN_INFINITY_VALUES',
      message: `${nanCheck.issues.length} valor(es) inválido(s) em ${uniqueFields.length} campo(s)`,
      severity: 'error',
      affectedFields: uniqueFields,
      details: { sampleIssues: nanCheck.issues.slice(0, 5) },
    });
  }
  
  // 3. Aggregated values NaN check
  checksPerformed.push('aggregated_nan');
  const invalidAggregated = Object.entries(aggregated)
    .filter(([_, value]) => !isFinite(value))
    .map(([key]) => key);
  
  if (invalidAggregated.length > 0) {
    errors.push({
      code: 'INVALID_AGGREGATED_VALUES',
      message: `Valores agregados inválidos: ${invalidAggregated.join(', ')}`,
      severity: 'critical',
      affectedFields: invalidAggregated,
    });
  }
  
  // 4. Unit consistency check
  checksPerformed.push('unit_consistency');
  const unitCheck = checkUnitConsistency(aggregated);
  if (unitCheck.issues.length > 0) {
    unitCheck.issues.forEach(issue => {
      warnings.push({
        code: 'UNIT_INCONSISTENCY',
        message: issue.suspectedIssue,
        severity: 'warning',
        affectedFields: [issue.field],
        details: { expectedUnit: issue.expectedUnit },
      });
    });
  }
  
  // 5. Required fields check
  if (cfg.requiredFields.length > 0 && data.length > 0) {
    checksPerformed.push('required_fields');
    const sampleRow = data[0];
    const missingFields = cfg.requiredFields.filter(f => !(f in sampleRow));
    
    if (missingFields.length > 0) {
      warnings.push({
        code: 'MISSING_REQUIRED_FIELDS',
        message: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`,
        severity: 'warning',
        affectedFields: missingFields,
      });
    }
  }
  
  // 6. Date field check
  if (data.length > 0) {
    checksPerformed.push('date_field');
    const dateFieldExists = data.some(row => row[cfg.dateField] || row['day'] || row['date']);
    if (!dateFieldExists) {
      warnings.push({
        code: 'MISSING_DATE_FIELD',
        message: `Campo de data "${cfg.dateField}" não encontrado`,
        severity: 'warning',
      });
    }
  }
  
  // Generate summary
  const criticalCount = errors.filter(e => e.severity === 'critical').length;
  const errorCount = errors.length;
  const warningCount = warnings.length;
  
  let summary: string;
  if (criticalCount > 0) {
    summary = `Dados inconsistentes — ${criticalCount} erro(s) crítico(s). Insights desativados.`;
  } else if (errorCount > 0) {
    summary = `${errorCount} erro(s) de integridade detectado(s). Alguns insights podem ser imprecisos.`;
  } else if (warningCount > 0) {
    summary = `${warningCount} aviso(s) de qualidade. Dados validados com ressalvas.`;
  } else {
    summary = 'Dados validados com sucesso. Nenhum problema detectado.';
  }
  
  return {
    isValid: criticalCount === 0 && errorCount === 0,
    errors,
    warnings,
    checksPerformed,
    summary,
  };
}

/**
 * Format validation result for logging to activity_logs
 */
export function formatValidationForLog(result: ValidationResult): Record<string, any> {
  return {
    isValid: result.isValid,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    checksPerformed: result.checksPerformed,
    summary: result.summary,
    errors: result.errors.map(e => ({
      code: e.code,
      message: e.message,
      severity: e.severity,
    })),
  };
}
