export { FileScanCache } from './file-scan-cache.js'
export { ensureUniqueAtomNames, syncScanAtomHashes } from './atoms.js'
export { processCssModules } from './process.js'
export { buildRegistryCss } from './registry.js'
export {
  SKIP_REASON_LEGEND,
  formatAtomizationReport,
  summarizeAtomization,
} from './report.js'
export { rewriteFiles } from './rewrite.js'
export { scanFiles } from './scan.js'
export { findShorthandConflicts } from './shorthand-groups.js'
export {
  classifyEligibleGroup,
  classifySelector,
  parseSelectorList,
  printSelectorList,
  resolveNesting,
  skipReasonForSelector,
  skipReasonForSelectors,
} from './selector-utils.js'
export type { SelectorClassification } from './selector-utils.js'
export type {
  Atom,
  AtomCondition,
  AtomKey,
  AtomPseudo,
  AtomizationReport,
  AtomizationSkip,
  DeclDecision,
  ProcessOptions,
  ProcessResult,
  RewrittenFile,
  ScanFileResult,
  ScanResult,
  ScanRuleInfo,
  SkipReason,
  SourceFile,
} from './types.js'
export { SKIP_REASONS } from './types.js'
