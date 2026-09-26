/**
 * Per-file scan cache so Vite can rebuild the registry from dirty files
 * instead of re-parsing every CSS module on each HMR or transform.
 */
import { ensureUniqueAtomNames, syncScanAtomHashes } from './atoms.js'
import { buildRegistryCss } from './registry.js'
import { summarizeAtomization } from './report.js'
import { scanFiles } from './scan.js'
import type {
  Atom,
  AtomizationReport,
  AtomizationSkip,
  ScanFileResult,
  ScanResult,
  SourceFile,
} from './types.js'

interface CachedFile {
  contentHash: string
  code: string
  scan: ScanFileResult
  atoms: Map<string, Atom>
  skips: AtomizationSkip[]
}

/** 64-bit DJB2-pair string hash so content collisions are vanishingly rare. */
function contentHash(code: string): string {
  let hashA = 5381
  let hashB = 52711
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i)
    hashA = Math.imul(hashA, 33) ^ char
    hashB = Math.imul(hashB, 33) ^ char
  }
  return `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0)
    .toString(16)
    .padStart(8, '0')}`
}

function cloneAtom(atom: Atom): Atom {
  return {
    hash: atom.hash,
    className: atom.className,
    key: atom.key,
    keyString: atom.keyString,
    declaration: atom.declaration,
  }
}

export class FileScanCache {
  private readonly entries = new Map<string, CachedFile>()
  private debugNames = false
  /** Last rematerialized global atom map (class names globally unique). */
  private mergedAtoms = new Map<string, Atom>()

  setDebugNames(debugNames: boolean): void {
    if (this.debugNames === debugNames) return
    this.debugNames = debugNames
    this.entries.clear()
    this.mergedAtoms = new Map()
  }

  /** True when the file was scanned. False when the cached scan was reused. */
  update(file: SourceFile): boolean {
    const hash = contentHash(file.code)
    const existing = this.entries.get(file.filePath)
    if (existing && existing.contentHash === hash) return false

    const scanned = scanFiles([file], { debugNames: this.debugNames })
    const scan = scanned.files[0]
    if (!scan) throw new Error(`scan produced no result for ${file.filePath}`)

    this.entries.set(file.filePath, {
      contentHash: hash,
      code: file.code,
      scan,
      atoms: scanned.atoms,
      skips: scanned.skips,
    })
    return true
  }

  remove(filePath: string): void {
    this.entries.delete(filePath)
  }

  retain(filePaths: Iterable<string>): void {
    const keep = new Set(filePaths)
    for (const filePath of this.entries.keys()) {
      if (!keep.has(filePath)) this.entries.delete(filePath)
    }
  }

  getScan(filePath: string): ScanFileResult | undefined {
    return this.entries.get(filePath)?.scan
  }

  /** Globally unique atoms from the last {@link snapshot} call. */
  getAtoms(): Map<string, Atom> {
    return this.mergedAtoms
  }

  snapshot(): {
    files: SourceFile[]
    scan: ScanResult
    registryCss: string
    report: AtomizationReport
  } {
    const files: SourceFile[] = []
    const scanFilesResult: ScanFileResult[] = []
    const atoms = new Map<string, Atom>()
    const skips: AtomizationSkip[] = []

    for (const entry of this.entries.values()) {
      files.push({ filePath: entry.scan.filePath, code: entry.code })
      // Clone rules so remapped hashes do not mutate the per-file cache entry
      // until we write them back via sync (we sync the clones used for rewrite).
      scanFilesResult.push({
        filePath: entry.scan.filePath,
        rules: entry.scan.rules.map((rule) => ({
          ...rule,
          atomKeys: [...rule.atomKeys],
          atomHashes: [...rule.atomHashes],
          decisions: rule.decisions.map((decision) => ({ ...decision })),
        })),
      })
      for (const [key, atom] of entry.atoms) {
        if (!atoms.has(key)) atoms.set(key, cloneAtom(atom))
      }
      skips.push(...entry.skips)
    }

    ensureUniqueAtomNames(atoms)
    syncScanAtomHashes(scanFilesResult, atoms)
    // Persist remapped hashes onto cached scans so getScan matches rewrite.
    for (const [index, entry] of [...this.entries.values()].entries()) {
      const remapped = scanFilesResult[index]
      if (remapped) entry.scan = remapped
    }
    this.mergedAtoms = atoms

    const scan: ScanResult = { atoms, files: scanFilesResult, skips }
    const registryCss = buildRegistryCss(atoms.values())
    return {
      files,
      scan,
      registryCss,
      report: summarizeAtomization(files, scan, registryCss),
    }
  }
}
