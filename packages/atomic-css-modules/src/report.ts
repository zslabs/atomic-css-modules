/**
 * Summarize one scan + registry pass for logs and ProcessResult.report.
 */
import path from 'node:path'
import { printedDeclarationText } from './atom-key.js'
import {
  SKIP_REASONS,
  type AtomizationFailure,
  type AtomizationReport,
  type AtomizationSkip,
  type ScanResult,
  type SkipReason,
  type SourceFile,
} from './types.js'

export const SKIP_REASON_LEGEND: Record<SkipReason, string> = {
  combinator: 'descendant or sibling selector (.a .b)',
  compound: 'extra class on the same element (.a.b)',
  element: 'element, id, attribute, or :root',
  'mixed-group': 'grouped list with an ineligible member (.a, div)',
  'functional-pseudo': 'functional pseudo (.a:not(.b))',
  'chained-pseudo': 'more than one trailing pseudo (.a:hover:focus)',
  'shorthand-conflict': 'shorthand plus an overlapping longhand',
  'skip-comment': '/* atomic: skip */ on the rule',
  'override-conflict': 'another class in this file sets the same property',
  'local-reference': 'declaration uses a name defined in this file',
  'unknown-at-rule': 'rule contains an at-rule this package does not rewrite',
}

export function summarizeAtomization(
  files: readonly SourceFile[],
  scan: Pick<ScanResult, 'atoms' | 'files' | 'skips'>,
  registryCss: string
): AtomizationReport {
  let bytesIn = 0
  for (const file of files) {
    bytesIn += Buffer.byteLength(file.code, 'utf8')
  }

  const registryBytes = Buffer.byteLength(registryCss, 'utf8')
  const { hoistedBytes, classNameBytesAdded } = byteDeltas(scan)
  const failures = failuresIn(scan)
  return {
    files: files.length,
    atoms: scan.atoms.size,
    skippedRules: scan.skips.length,
    bytesIn,
    registryBytes,
    cssBytesSaved: hoistedBytes - classNameBytesAdded - registryBytes,
    classNameBytesAdded,
    skips: scan.skips,
    failures,
  }
}

function failuresIn(scan: Pick<ScanResult, 'files'>): AtomizationFailure[] {
  const failures: AtomizationFailure[] = []
  for (const file of scan.files) {
    if (!file.failure) continue
    failures.push({ filePath: file.filePath, message: file.failure })
  }
  return failures
}

function byteDeltas(scan: Pick<ScanResult, 'atoms' | 'files'>): {
  hoistedBytes: number
  classNameBytesAdded: number
} {
  let hoistedBytes = 0
  let classNameBytesAdded = 0
  for (const file of scan.files) {
    for (const rule of file.rules) {
      if (rule.atomHashes.length > 0) {
        classNameBytesAdded += rule.atomHashes.join(' ').length
      }
      for (const decision of rule.decisions) {
        if (decision.action !== 'hoist') continue
        const atom = scan.atoms.get(decision.atomKey)
        if (!atom) continue
        hoistedBytes += Buffer.byteLength(
          printedDeclarationText(
            atom.declaration,
            atom.key.important,
            atom.key.valueFingerprint
          ),
          'utf8'
        )
      }
    }
  }
  return { hoistedBytes, classNameBytesAdded }
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function skipBuckets(skips: readonly AtomizationSkip[]): string {
  if (skips.length === 0) return ''
  const counts = new Map<string, number>()
  for (const skip of skips) {
    counts.set(skip.reason, (counts.get(skip.reason) ?? 0) + 1)
  }
  const parts = SKIP_REASONS.filter((reason) => counts.has(reason)).map(
    (reason) => `${counts.get(reason)} ${reason}`
  )
  return ` (${parts.join(', ')})`
}

function skipLegend(skips: readonly AtomizationSkip[]): string {
  if (skips.length === 0) return ''
  const seen = new Set(skips.map((skip) => skip.reason))
  return SKIP_REASONS.filter((reason) => seen.has(reason))
    .map((reason) => `  ${reason}: ${SKIP_REASON_LEGEND[reason]}`)
    .join('\n')
}

export function formatAtomizationReport(
  report: AtomizationReport,
  options: { verbose?: boolean; root?: string } = {}
): string {
  const summary = `atomic-css-modules: ${plural(report.atoms, 'atom', 'atoms')}, ${plural(report.skippedRules, 'skipped rule', 'skipped rules')}${skipBuckets(report.skips)}, ${report.bytesIn}B in → ${report.registryBytes}B registry, saved ${report.cssBytesSaved}B css, added ${report.classNameBytesAdded}B class names`
  const parts = [summary]
  for (const failure of report.failures) {
    parts.push(`  failed ${failure.filePath}: ${failure.message}`)
  }
  if (options.verbose) {
    for (const skip of report.skips) {
      const filePath = options.root
        ? path.relative(options.root, skip.filePath)
        : skip.filePath
      parts.push(`  ${filePath}  ${skip.selector}  ${skip.reason}`)
    }
  }
  const legend = skipLegend(report.skips)
  if (legend) parts.push(legend)
  return parts.join('\n')
}
