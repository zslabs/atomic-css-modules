/**
 * Public orchestration entry point: scan a set of CSS Modules files, then
 * rewrite them and build the shared atomic registry.
 */
import { buildRegistryCss } from './registry.js'
import { summarizeAtomization } from './report.js'
import { rewriteFiles } from './rewrite.js'
import { scanFiles } from './scan.js'
import type { ProcessOptions, ProcessResult, SourceFile } from './types.js'

export function processCssModules(
  files: readonly SourceFile[],
  options: ProcessOptions
): ProcessResult {
  const scanResult = scanFiles(files, options)
  const rewrittenFiles = rewriteFiles(
    files,
    scanResult.files,
    options,
    scanResult.atoms
  )
  const registryCss = buildRegistryCss(scanResult.atoms.values())
  return {
    files: rewrittenFiles,
    registryCss,
    report: summarizeAtomization(files, scanResult, registryCss),
  }
}
