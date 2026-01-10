/**
 * Column Name Matching Utilities
 * Handles fuzzy matching of column names with normalization
 */

/**
 * Normalize column name for fuzzy matching
 * Removes prefixes, spaces, and special characters
 */
export function normalizeColumnName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[_\-\s]+/g, '')
    .replace(/^(st|flag|is|has|col)/, '');
}

/**
 * Find column match with fuzzy matching
 * Tries exact, case-insensitive, normalized, and partial matches
 */
export function findColumnMatch(target: string, availableColumns: string[]): string | null {
  const normalizedTarget = normalizeColumnName(target);
  
  // Exact match first
  if (availableColumns.includes(target)) return target;
  
  // Case-insensitive match
  const caseMatch = availableColumns.find(c => c.toLowerCase() === target.toLowerCase());
  if (caseMatch) return caseMatch;
  
  // Normalized match (removes prefixes like st_, flag_, etc.)
  const normalizedMatch = availableColumns.find(c => normalizeColumnName(c) === normalizedTarget);
  if (normalizedMatch) return normalizedMatch;
  
  // Partial match (e.g., "entrada" matches "st_entrada")
  const partialMatch = availableColumns.find(c => 
    c.toLowerCase().includes(target.toLowerCase()) || 
    target.toLowerCase().includes(c.toLowerCase())
  );
  if (partialMatch) return partialMatch;
  
  return null;
}


