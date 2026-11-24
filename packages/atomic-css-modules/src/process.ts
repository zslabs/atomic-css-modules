/**
 * Public orchestration entry point: scan a set of CSS Modules files, then
 * rewrite them and build the shared atomic registry.
 */
import { pruneUnreferencedAtoms } from './override-conflicts.js'
import { dedupeDefinitions } from './sheet-info.js'
import { buildRegistryCss } from './registry.js'
import { summarizeAtomization } from './report.js'
import { rewriteFiles } from './rewrite.js'
import { scanFiles } from './scan.js'
import type {
  AtomizationFailure,
  ProcessOptions,
  ProcessResult,
  SourceFile,
} from './types.js'

export function processCssModules(
  files: readonly SourceFile[],
  options: ProcessOptions
): ProcessResult {
  const scanResult = scanFiles(files, options)
  pruneUnreferencedAtoms(scanResult.atoms, scanResult.files)
  const rewrittenFiles = rewriteFiles(
    files,
    scanResult.files,
    options,
    scanResult.atoms
  )
  const failures: AtomizationFailure[] = []
  for (const file of rewrittenFiles) {
    if (!file.failure) continue
    if (
      scanResult.files.some(
        (scan) => scan.failure && scan.filePath === file.filePath
      )
    ) {
      continue
    }
    failures.push({ filePath: file.filePath, message: file.failure })
  }
  const registryCss = buildRegistryCss(scanResult.atoms.values(), {
    definitions: dedupeDefinitions(
      scanResult.files.flatMap((file) => file.definitions)
    ),
  })
  const report = summarizeAtomization(files, scanResult, registryCss)
  report.failures.push(...failures)
  return {
    files: rewrittenFiles,
    registryCss,
    report,
  }
}
