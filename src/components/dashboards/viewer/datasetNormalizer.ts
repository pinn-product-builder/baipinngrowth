// ============================================================
// ROBUST DATASET NORMALIZER
// Handles various backend response formats, parses BR/EN numbers,
// percentages, dates, and provides warnings instead of crashing
// ============================================================

export interface NormalizedColumn {
  name: string;
  type: 'date' | 'number' | 'currency' | 'percent' | 'string' | 'boolean' | 'unknown';
  formatter?: string;
  scale?: '0to1' | '0to100';
}

export interface ColumnWarning {
  code: string;
  message: string;
  column?: string;
}

export interface ColumnStats {
  min?: number;
  max?: number;
  nulls?: number;
  avg?: number;
}

export interface NormalizedDataset {
  columns: NormalizedColumn[];
  rows: Record<string, any>[];
  warnings: ColumnWarning[];
  stats: Record<string, ColumnStats>;
  meta?: any;
}

// ============================================================
// NUMBER PARSING (BR/EN formats)
// ============================================================

/**
 * Parse a number value supporting both BR (1.234,56) and EN (1,234.56) formats
 * Returns null for invalid values (never NaN or Infinity)
 */
export function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      return null;
    }
    return value;
  }
  
  if (typeof value !== 'string') {
    return null;
  }
  
  // Clean up the string
  let cleaned = value.trim();
  
  // Remove currency symbols and common prefixes
  cleaned = cleaned.replace(/^R\$\s*/i, '');
  cleaned = cleaned.replace(/^\$\s*/i, '');
  cleaned = cleaned.replace(/^€\s*/i, '');
  
  // Detect format: BR (1.234,56) vs EN (1,234.56)
  const hasBrFormat = /^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned) || /,\d{1,2}$/.test(cleaned);
  const hasEnFormat = /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(cleaned);
  
  if (hasBrFormat && !hasEnFormat) {
    // Brazilian format: remove dots, replace comma with dot
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasEnFormat && !hasBrFormat) {
    // English format: just remove commas
    cleaned = cleaned.replace(/,/g, '');
  } else {
    // Ambiguous or simple number - try as is, removing spaces
    cleaned = cleaned.replace(/\s/g, '');
    // If last separator is comma and has 1-2 digits after, treat as decimal
    if (/\,\d{1,2}$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed) || !isFinite(parsed)) {
    return null;
  }
  
  return parsed;
}

/**
 * Parse a currency value
 */
export function parseCurrency(value: any): number | null {
  return parseNumber(value);
}

/**
 * Parse a percentage value and normalize to 0-1 range based on scale
 * @param value - The value to parse
 * @param scale - Whether the input is '0to1' (0.25 = 25%) or '0to100' (25 = 25%)
 * @returns Normalized value in 0-1 range, or null
 */
export function parsePercent(value: any, scale: '0to1' | '0to100' = '0to1'): number | null {
  const num = parseNumber(value);
  if (num === null) return null;
  
  if (scale === '0to100') {
    return num / 100;
  }
  
  return num;
}

/**
 * Detect if a set of percentage values is in 0-1 or 0-100 scale
 * Heuristic: if typical values are <= 1.2, assume 0-1; otherwise 0-100
 */
export function detectPercentScale(values: number[]): '0to1' | '0to100' {
  const validValues = values.filter(v => v !== null && !isNaN(v) && isFinite(v));
  if (validValues.length === 0) return '0to1';
  
  // Calculate median to avoid outliers
  const sorted = [...validValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  
  // If median > 1.2, assume 0-100 scale
  return median > 1.2 ? '0to100' : '0to1';
}

// ============================================================
// DATE PARSING
// ============================================================

/**
 * Parse a date value from various formats
 * Returns valid Date or null
 */
export function parseDate(value: any): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  if (typeof value === 'number') {
    // Unix timestamp (seconds or milliseconds)
    const date = new Date(value > 1e11 ? value : value * 1000);
    return isNaN(date.getTime()) ? null : date;
  }
  
  if (typeof value !== 'string') {
    return null;
  }
  
  const str = value.trim();
  
  // Try ISO format first
  let date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try DD/MM/YYYY format (common in BR)
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try DD-MM-YYYY format
  const dashMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}

// ============================================================
// COLUMN TYPE DETECTION
// ============================================================

const DATE_PATTERNS = ['dia', 'date', 'created_at', 'updated_at', 'data', 'dt_', 'timestamp'];
const CURRENCY_PATTERNS = ['custo', 'cpl', 'cac', 'valor', 'price', 'preco', 'investimento', 'revenue', 'receita'];
const PERCENT_PATTERNS = ['taxa_', 'rate_', 'percent', 'pct', '%', 'conversion', 'ratio'];
const COUNT_PATTERNS = ['_total', '_count', 'leads', 'vendas', 'entradas', 'qtd', 'quantidade'];

export function detectColumnType(columnName: string, sampleValues: any[] = []): NormalizedColumn['type'] {
  const key = columnName.toLowerCase().trim();
  
  if (!key) return 'unknown';
  
  // Check by name patterns
  if (DATE_PATTERNS.some(p => key.includes(p) || key === p)) {
    return 'date';
  }
  
  if (PERCENT_PATTERNS.some(p => key.startsWith(p) || key.includes(p))) {
    return 'percent';
  }
  
  if (CURRENCY_PATTERNS.some(p => key.includes(p))) {
    return 'currency';
  }
  
  if (COUNT_PATTERNS.some(p => key.includes(p))) {
    return 'number';
  }
  
  // If we have sample values, check them
  if (sampleValues.length > 0) {
    const nonNullSamples = sampleValues.filter(v => v !== null && v !== undefined);
    if (nonNullSamples.length === 0) return 'unknown';
    
    // Check if all are dates
    if (nonNullSamples.every(v => parseDate(v) !== null)) {
      return 'date';
    }
    
    // Check if all are numbers
    if (nonNullSamples.every(v => typeof v === 'number' || parseNumber(v) !== null)) {
      return 'number';
    }
    
    // Check if all are booleans
    if (nonNullSamples.every(v => typeof v === 'boolean' || v === 'true' || v === 'false')) {
      return 'boolean';
    }
  }
  
  return 'string';
}

// ============================================================
// MAIN NORMALIZER
// ============================================================

interface RawDatasetInput {
  columns?: any[];
  rows?: any[];
  data?: any[];
  meta?: any;
}

/**
 * Normalize a raw dataset from the backend into a consistent format
 * NEVER throws - always returns a valid NormalizedDataset with warnings
 */
export function normalizeDataset(
  input: any,
  specColumns?: Array<{ name: string; type: string; scale?: string }>
): NormalizedDataset {
  const warnings: ColumnWarning[] = [];
  const stats: Record<string, ColumnStats> = {};
  
  try {
    // Handle null/undefined input
    if (!input || typeof input !== 'object') {
      warnings.push({ code: 'INVALID_INPUT', message: 'Input is not an object' });
      return { columns: [], rows: [], warnings, stats };
    }
    
    // ============================================
    // EXTRACT ROWS
    // ============================================
    let rawRows: any[] = [];
    
    if (Array.isArray(input.rows)) {
      rawRows = input.rows;
    } else if (Array.isArray(input.data)) {
      rawRows = input.data;
    } else if (Array.isArray(input)) {
      rawRows = input;
    } else {
      warnings.push({ code: 'NO_ROWS', message: 'Could not find rows array' });
      return { columns: [], rows: [], warnings, stats };
    }
    
    // If rows are arrays (not objects), convert them
    if (rawRows.length > 0 && Array.isArray(rawRows[0])) {
      warnings.push({ code: 'ARRAY_ROWS', message: 'Rows are arrays, converting to objects' });
      const colNames = extractColumnNames(input.columns);
      rawRows = rawRows.map((row: any[]) => {
        const obj: Record<string, any> = {};
        row.forEach((val, i) => {
          obj[colNames[i] || `col_${i}`] = val;
        });
        return obj;
      });
    }
    
    // ============================================
    // EXTRACT & DETECT COLUMNS
    // ============================================
    let columnNames: string[] = extractColumnNames(input.columns);
    
    // If no columns provided, infer from first row
    if (columnNames.length === 0 && rawRows.length > 0) {
      warnings.push({ code: 'INFERRED_COLUMNS', message: 'Columns inferred from first row' });
      if (typeof rawRows[0] === 'object' && rawRows[0] !== null) {
        columnNames = Object.keys(rawRows[0]);
      }
    }
    
    // Build column definitions with types
    const columns: NormalizedColumn[] = columnNames.map(name => {
      const specCol = specColumns?.find(c => c.name === name);
      
      if (specCol) {
        return {
          name,
          type: specCol.type as NormalizedColumn['type'],
          scale: specCol.scale as NormalizedColumn['scale'],
        };
      }
      
      // Auto-detect type from sample values
      const sampleValues = rawRows.slice(0, 10).map(row => row[name]);
      const detectedType = detectColumnType(name, sampleValues);
      
      // For percentages, detect scale
      let scale: NormalizedColumn['scale'] | undefined;
      if (detectedType === 'percent') {
        const numValues = sampleValues.map(v => parseNumber(v)).filter(v => v !== null) as number[];
        scale = detectPercentScale(numValues);
      }
      
      return { name, type: detectedType, scale };
    });
    
    // ============================================
    // NORMALIZE ROWS
    // ============================================
    const normalizedRows: Record<string, any>[] = rawRows.map((row, rowIndex) => {
      if (!row || typeof row !== 'object') {
        warnings.push({ code: 'INVALID_ROW', message: `Row ${rowIndex} is not an object` });
        return {};
      }
      
      const normalizedRow: Record<string, any> = {};
      
      for (const col of columns) {
        const rawValue = row[col.name];
        
        switch (col.type) {
          case 'date': {
            const parsed = parseDate(rawValue);
            normalizedRow[col.name] = parsed;
            if (rawValue && parsed === null) {
              warnings.push({
                code: 'INVALID_DATE',
                message: `Invalid date value at row ${rowIndex}`,
                column: col.name,
              });
            }
            break;
          }
          
          case 'currency':
          case 'number': {
            const parsed = parseNumber(rawValue);
            normalizedRow[col.name] = parsed;
            if (rawValue !== null && rawValue !== undefined && rawValue !== '' && parsed === null) {
              warnings.push({
                code: 'INVALID_NUMBER',
                message: `Invalid number value at row ${rowIndex}`,
                column: col.name,
              });
            }
            break;
          }
          
          case 'percent': {
            const scale = col.scale || '0to1';
            const parsed = parsePercent(rawValue, scale);
            normalizedRow[col.name] = parsed;
            if (parsed !== null && (parsed < 0 || parsed > 1)) {
              warnings.push({
                code: 'OUT_OF_RANGE_PERCENT',
                message: `Percent value out of 0-1 range at row ${rowIndex}`,
                column: col.name,
              });
            }
            break;
          }
          
          case 'boolean': {
            if (typeof rawValue === 'boolean') {
              normalizedRow[col.name] = rawValue;
            } else if (rawValue === 'true' || rawValue === '1' || rawValue === 1) {
              normalizedRow[col.name] = true;
            } else if (rawValue === 'false' || rawValue === '0' || rawValue === 0) {
              normalizedRow[col.name] = false;
            } else {
              normalizedRow[col.name] = null;
            }
            break;
          }
          
          default:
            // Keep as-is for strings and unknown types
            normalizedRow[col.name] = rawValue;
        }
      }
      
      return normalizedRow;
    });
    
    // ============================================
    // CALCULATE STATS
    // ============================================
    for (const col of columns) {
      if (col.type === 'number' || col.type === 'currency' || col.type === 'percent') {
        const values = normalizedRows
          .map(row => row[col.name])
          .filter(v => v !== null && typeof v === 'number') as number[];
        
        if (values.length > 0) {
          stats[col.name] = {
            min: Math.min(...values),
            max: Math.max(...values),
            nulls: normalizedRows.filter(row => row[col.name] === null).length,
            avg: values.reduce((a, b) => a + b, 0) / values.length,
          };
        } else {
          stats[col.name] = { nulls: normalizedRows.length };
        }
      }
    }
    
    // ============================================
    // SORT BY DATE IF AVAILABLE
    // ============================================
    const dateCol = columns.find(c => c.type === 'date');
    if (dateCol) {
      normalizedRows.sort((a, b) => {
        const dateA = a[dateCol.name];
        const dateB = b[dateCol.name];
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.getTime() - dateB.getTime();
      });
    }
    
    return {
      columns,
      rows: normalizedRows,
      warnings,
      stats,
      meta: input.meta,
    };
    
  } catch (error) {
    warnings.push({
      code: 'NORMALIZATION_ERROR',
      message: `Error during normalization: ${error instanceof Error ? error.message : 'unknown'}`,
    });
    return { columns: [], rows: [], warnings, stats };
  }
}

/**
 * Extract column names from various formats
 */
function extractColumnNames(columns: any): string[] {
  if (!columns) return [];
  
  if (!Array.isArray(columns)) {
    if (typeof columns === 'object') {
      return Object.keys(columns);
    }
    return [];
  }
  
  return columns.map(col => {
    if (typeof col === 'string') return col;
    if (typeof col === 'object' && col !== null) {
      return col.name || col.key || col.label || '';
    }
    return String(col);
  }).filter(Boolean);
}

// ============================================================
// FORMATTING UTILITIES
// ============================================================

export function formatValue(
  value: any,
  type: NormalizedColumn['type'],
  locale: string = 'pt-BR'
): string {
  if (value === null || value === undefined) {
    return '—';
  }
  
  switch (type) {
    case 'currency':
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    
    case 'percent':
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
    
    case 'number':
      if (Number.isInteger(value)) {
        return new Intl.NumberFormat(locale).format(value);
      }
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    
    case 'date':
      if (value instanceof Date) {
        return new Intl.DateTimeFormat(locale).format(value);
      }
      return String(value);
    
    case 'boolean':
      return value ? 'Sim' : 'Não';
    
    default:
      return String(value);
  }
}

export function formatCompactNumber(value: number, locale: string = 'pt-BR'): string {
  if (value >= 1000000) {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  }
  if (value >= 1000) {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat(locale).format(value);
}
