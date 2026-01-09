// ============================================================
// ADAPTIVE DASHBOARD SYSTEM
// Main exports for the dashboard generation system
// ============================================================

// Core types
export * from './types';

// Capabilities detection
export { 
  detectCapabilities, 
  hasCapabilitiesChanged,
  capabilitiesToColumnMappings,
} from './capabilitiesDetector';

// Tab generation
export { 
  generateTabs, 
  mapLegacyTabId,
  getDynamicTabLabel,
} from './tabGenerator';

// Re-export TabGenerationResult from types (canonical definition)
export type { TabGenerationResult } from './types';

// Layout compilation
export { 
  compileLayout,
  COMPILER_VERSION,
  type CompilationResult,
} from './layoutCompiler';

// Smoke testing
export {
  runSmokeTest,
  runRenderTest,
  runGateCheck,
  formatGateCheckResult,
  DEFAULT_SMOKE_CONFIG,
} from './smokeTest';

// Creation trace / Observability
export {
  generateTraceId,
  createTrace,
  addTraceStep,
  updateTraceStep,
  completeTrace,
  collectDiscards,
  collectWarnings,
  formatTraceForExport,
  formatTraceForUI,
} from './creationTrace';