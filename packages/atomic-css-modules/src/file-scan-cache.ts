/**
 * Per-file scan cache so Vite can rebuild the registry from dirty files
 * instead of re-parsing every CSS module on each HMR or transform.
 */
import { ensureUniqueAtomNames, syncScanAtomHashes } from './atoms.js'
import { pruneUnreferencedAtoms } from './override-conflicts.js'
import { buildRegistryCss } from './registry.js'
import { summarizeAtomization } from './report.js'
import { scanFiles, type ScanOptions } from './scan.js'
import { dedupeDefinitions } from './sheet-info.js'
import type {
  Atom,
  AtomicCustomAtRules,
  AtomizationReport,
  AtomizationSkip,
  ConflictMode,
  LocalIdentOptions,
  ScanFileResult,
  ScanResult,
  SourceFile,
} from './types.js'

export interface FileScanCacheOptions {
  debugNames?: boolean
  conflicts?: ConflictMode
  localIdents?: LocalIdentOptions
  customAtRules?: AtomicCustomAtRules
  strict?: boolean
}

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
  private materializedFiles: ScanFileResult[] = []
  /** Last rematerialized global atom map (class names globally unique). */
  private mergedAtoms = new Map<string, Atom>()
  /** False until the first snapshot, so that pass does not mark every file remapped. */
  private snapshotted = false
  /** Composed class names from the previous snapshot, keyed by file. */
  private previousHashes = new Map<string, string>()

  constructor(private readonly options: FileScanCacheOptions = {}) {
    this.debugNames = options.debugNames === true
  }

  /** True when the cache was cleared because the naming mode changed. */
  setDebugNames(debugNames: boolean): boolean {
    if (this.debugNames === debugNames) return false
    this.debugNames = debugNames
    this.entries.clear()
    this.mergedAtoms = new Map()
    this.snapshotted = false
    this.previousHashes = new Map()
    this.materializedFiles = []
    return true
  }

  /** True when the file was scanned. False when the cached scan was reused. */
  update(file: SourceFile): boolean {
    const hash = contentHash(file.code)
    const existing = this.entries.get(file.filePath)
    if (existing && existing.contentHash === hash) return false

    const scanned = scanFiles([file], this.scanOptions())
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

  noteFailure(filePath: string, code: string, message: string): void {
    this.entries.set(filePath, {
      contentHash: contentHash(`${code}\0${message}`),
      code,
      scan: { filePath, rules: [], definitions: [], failure: message },
      atoms: new Map(),
      skips: [],
    })
  }

  has(filePath: string): boolean {
    return this.entries.has(filePath)
  }

  filePaths(): string[] {
    return [...this.entries.keys()]
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
    registryHash: string
    /** Files whose composed class names changed since the previous snapshot. */
    remappedFiles: string[]
    report: AtomizationReport
  } {
    const files: SourceFile[] = []
    const scanFilesResult: ScanFileResult[] = []
    const atoms = new Map<string, Atom>()
    const skips: AtomizationSkip[] = []

    const entries = [...this.entries.values()].sort((left, right) =>
      left.scan.filePath.localeCompare(right.scan.filePath)
    )

    for (const entry of entries) {
      files.push({ filePath: entry.scan.filePath, code: entry.code })
      // Clone rules so remapped hashes do not mutate the per-file cache entry
      // until we write them back via sync (we sync the clones used for rewrite).
      scanFilesResult.push({
        filePath: entry.scan.filePath,
        definitions: [...entry.scan.definitions],
        ...(entry.scan.failure ? { failure: entry.scan.failure } : {}),
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

    pruneUnreferencedAtoms(atoms, scanFilesResult)
    ensureUniqueAtomNames(atoms)
    syncScanAtomHashes(scanFilesResult, atoms)
    // Persist remapped hashes onto cached scans so getScan matches rewrite.
    for (const [index, entry] of entries.entries()) {
      const remapped = scanFilesResult[index]
      if (remapped) entry.scan = remapped
    }
    this.mergedAtoms = atoms

    const remappedFiles: string[] = []
    if (this.snapshotted) {
      for (const scanFile of scanFilesResult) {
        const previous = this.previousHashes.get(scanFile.filePath)
        if (previous === undefined) continue
        if (previous !== joinedHashes(scanFile)) {
          remappedFiles.push(scanFile.filePath)
        }
      }
    }
    this.snapshotted = true
    this.previousHashes = new Map(
      scanFilesResult.map((scanFile) => [
        scanFile.filePath,
        joinedHashes(scanFile),
      ])
    )

    const scan: ScanResult = { atoms, files: scanFilesResult, skips }
    this.materializedFiles = scanFilesResult
    const registryCss = buildRegistryCss(atoms.values(), {
      definitions: dedupeDefinitions(
        scanFilesResult.flatMap((file) => file.definitions)
      ),
    })
    return {
      files,
      scan,
      registryCss,
      registryHash: contentHash(registryCss),
      remappedFiles,
      report: summarizeAtomization(files, scan, registryCss),
    }
  }

  /** Registry containing only atoms referenced by these files. */
  registryFor(
    paths: ReadonlySet<string>
  ): { css: string; hash: string } | null {
    const files = this.materializedFiles.filter((file) =>
      paths.has(file.filePath)
    )
    if (files.length === 0) return null
    const atoms = new Map<string, Atom>()
    for (const file of files) {
      for (const rule of file.rules) {
        for (const key of rule.atomKeys) {
          const atom = this.mergedAtoms.get(key)
          if (atom) atoms.set(key, atom)
        }
      }
    }
    const css = buildRegistryCss(atoms.values(), {
      definitions: dedupeDefinitions(files.flatMap((file) => file.definitions)),
    })
    return { css, hash: contentHash(css) }
  }

  private scanOptions(): ScanOptions {
    return {
      debugNames: this.debugNames,
      conflicts: this.options.conflicts ?? 'skip',
      localIdents: this.options.localIdents,
      customAtRules: this.options.customAtRules,
      strict: this.options.strict,
    }
  }
}

function joinedHashes(scan: ScanFileResult): string {
  return scan.rules.flatMap((rule) => rule.atomHashes).join('\n')
}
