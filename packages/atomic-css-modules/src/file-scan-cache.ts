/**
 * Per-file scan cache so Vite can rebuild the registry from dirty files
 * instead of re-parsing every CSS module on each HMR or transform.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureUniqueAtomNames, syncScanAtomHashes } from './atoms.js'
import {
  applyMinOccurrences,
  pruneUnreferencedAtoms,
} from './min-occurrences.js'
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
  /** Defaults to 1. Bundler plugins pass 2. */
  minOccurrences?: number
  localIdents?: LocalIdentOptions
  customAtRules?: AtomicCustomAtRules
  groupConditions?: boolean
  strict?: boolean
  cacheDir?: string
  policyKey?: string
}

interface RawInput {
  code: string
  dependencies?: readonly string[]
}

interface DependencyStamp {
  filePath: string
  contentHash: string
}

interface RawStamp {
  rawHash: string
  dependencies: DependencyStamp[]
}

interface DiskPayload {
  contentHash: string
  code: string
  scan: ScanFileResult
  atoms: [string, Atom][]
  skips: AtomizationSkip[]
  raw?: RawStamp
}

interface CachedFile {
  contentHash: string
  code: string
  scan: ScanFileResult
  atoms: Map<string, Atom>
  skips: AtomizationSkip[]
  raw?: RawStamp
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
  private readonly diskHits = new Set<string>()
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
    this.diskHits.clear()
    this.materializedFiles = []
    return true
  }

  loadedFromDisk(filePath: string): boolean {
    return this.diskHits.has(filePath)
  }

  /** CSS files whose recorded imports include one of `changed`. */
  dependentFiles(changed: ReadonlySet<string>): string[] {
    if (changed.size === 0) return []
    const hits: string[] = []
    for (const [filePath, entry] of this.entries) {
      const deps = entry.raw?.dependencies
      if (!deps?.some((dep) => changed.has(dep.filePath))) continue
      hits.push(filePath)
    }
    return hits
  }

  /** True when the file was scanned. False when the cached scan was reused. */
  update(file: SourceFile, raw?: RawInput): boolean {
    const reused = this.reuse(file, raw)
    if (reused === 'memory') return false
    if (reused === 'disk') return true

    const scanned = scanFiles([file], this.scanOptions())
    const scan = scanned.files[0]
    if (!scan) throw new Error(`scan produced no result for ${file.filePath}`)
    this.put({
      contentHash: contentHash(file.code),
      code: file.code,
      raw: stampRaw(file.filePath, raw),
      scan,
      atoms: scanned.atoms,
      skips: scanned.skips,
    })
    return true
  }

  /**
   * Compiled code when `rawCode` and the imports recorded last time are
   * unchanged. A hit means the caller can skip preprocess.
   */
  reuseRaw(filePath: string, rawCode: string): string | undefined {
    const rawHash = contentHash(rawCode)
    const existing = this.entries.get(filePath)
    if (existing) return freshRaw(existing, rawHash)
    const loaded = this.loadDisk(filePath)
    if (!loaded) return
    const code = freshRaw(loaded, rawHash)
    if (code === undefined) return
    this.entries.set(filePath, loaded)
    this.diskHits.add(filePath)
    return code
  }

  /** `'miss'` when the caller should scan `file`. */
  reuse(file: SourceFile, raw?: RawInput): 'memory' | 'disk' | 'miss' {
    const hash = contentHash(file.code)
    const existing = this.entries.get(file.filePath)
    if (existing && existing.contentHash === hash) {
      this.attachRaw(file.filePath, raw)
      return 'memory'
    }
    const fromDisk = this.readDisk(file.filePath, hash)
    if (!fromDisk) return 'miss'
    this.entries.set(file.filePath, fromDisk)
    this.diskHits.add(file.filePath)
    this.attachRaw(file.filePath, raw)
    return 'disk'
  }

  remember(
    file: SourceFile,
    scan: ScanFileResult,
    atoms: Map<string, Atom>,
    skips: AtomizationSkip[],
    raw?: RawInput
  ): void {
    this.put({
      contentHash: contentHash(file.code),
      code: file.code,
      raw: stampRaw(file.filePath, raw),
      scan,
      atoms,
      skips,
    })
  }

  private attachRaw(filePath: string, raw: RawInput | undefined): void {
    const stamp = stampRaw(filePath, raw)
    if (!stamp) return
    const existing = this.entries.get(filePath)
    if (!existing || sameRaw(existing.raw, stamp)) return
    existing.raw = stamp
    this.writeDisk(existing)
  }

  private put(cached: CachedFile): void {
    if (!cached.raw) {
      const previous = this.entries.get(cached.scan.filePath)
      if (previous?.raw) cached.raw = previous.raw
    }
    this.entries.set(cached.scan.filePath, cached)
    this.writeDisk(cached)
  }

  scanSettings(): ScanOptions {
    return this.scanOptions()
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

    applyMinOccurrences(
      scanFilesResult,
      atoms,
      this.options.minOccurrences ?? 1
    )
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
      groupConditions: this.options.groupConditions,
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
      groupConditions: this.options.groupConditions,
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

  private diskFile(filePath: string): string | undefined {
    if (!this.options.cacheDir || !this.options.policyKey) return
    const name = createHash('sha256')
      .update(this.options.policyKey)
      .update('\0')
      .update(this.debugNames ? '1' : '0')
      .update('\0')
      .update(filePath)
      .digest('hex')
    return path.join(this.options.cacheDir, `${name}.json`)
  }

  private readDisk(filePath: string, hash: string): CachedFile | undefined {
    const loaded = this.loadDisk(filePath)
    if (!loaded || loaded.contentHash !== hash) return
    return loaded
  }

  private loadDisk(filePath: string): CachedFile | undefined {
    const diskFile = this.diskFile(filePath)
    if (!diskFile) return
    try {
      const parsed: unknown = JSON.parse(readFileSync(diskFile, 'utf8'))
      if (!isDiskPayload(parsed)) return
      return {
        contentHash: parsed.contentHash,
        code: parsed.code,
        scan: parsed.scan,
        atoms: new Map(parsed.atoms),
        skips: parsed.skips,
        ...(parsed.raw ? { raw: parsed.raw } : {}),
      }
    } catch {
      return
    }
  }

  private writeDisk(cached: CachedFile): void {
    const diskFile = this.diskFile(cached.scan.filePath)
    if (!diskFile || !this.options.cacheDir) return
    const payload: DiskPayload = {
      contentHash: cached.contentHash,
      code: cached.code,
      scan: cached.scan,
      atoms: [...cached.atoms],
      skips: cached.skips,
      ...(cached.raw ? { raw: cached.raw } : {}),
    }
    try {
      mkdirSync(this.options.cacheDir, { recursive: true })
      writeFileSync(diskFile, JSON.stringify(payload))
    } catch {
      return
    }
  }
}

const MISSING_DEPENDENCY = 'missing'

function stampRaw(
  filePath: string,
  raw: RawInput | undefined
): RawStamp | undefined {
  if (!raw) return
  return {
    rawHash: contentHash(raw.code),
    dependencies: stampDependencies(filePath, raw.dependencies ?? []),
  }
}

function stampDependencies(
  fromFile: string,
  dependencies: readonly string[]
): DependencyStamp[] {
  const stamps = new Map<string, string>()
  for (const dep of dependencies) {
    const filePath = resolveDependency(fromFile, dep)
    stamps.set(filePath, hashFile(filePath))
  }
  return [...stamps]
    .map(([filePath, hashed]) => ({ filePath, contentHash: hashed }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath))
}

function resolveDependency(fromFile: string, dep: string): string {
  const resolved = path.isAbsolute(dep)
    ? dep
    : path.resolve(path.dirname(fromFile), dep)
  try {
    return realpathSync(resolved)
  } catch {
    return resolved
  }
}

function hashFile(filePath: string): string {
  try {
    return contentHash(readFileSync(filePath, 'utf8'))
  } catch {
    return MISSING_DEPENDENCY
  }
}

function dependenciesMatch(dependencies: readonly DependencyStamp[]): boolean {
  for (const dep of dependencies) {
    const hashed = hashFile(dep.filePath)
    if (hashed !== dep.contentHash) return false
  }
  return true
}

function freshRaw(cached: CachedFile, rawHash: string): string | undefined {
  if (!cached.raw || cached.raw.rawHash !== rawHash) return
  if (!dependenciesMatch(cached.raw.dependencies)) return
  return cached.code
}

function sameRaw(left: RawStamp | undefined, right: RawStamp): boolean {
  if (!left || left.rawHash !== right.rawHash) return false
  if (left.dependencies.length !== right.dependencies.length) return false
  for (const [index, dep] of left.dependencies.entries()) {
    const other = right.dependencies[index]
    if (!other) return false
    if (
      dep.filePath !== other.filePath ||
      dep.contentHash !== other.contentHash
    ) {
      return false
    }
  }
  return true
}

function isRawStamp(value: unknown): value is RawStamp {
  if (typeof value !== 'object' || value === null) return false
  if (!('rawHash' in value) || typeof value.rawHash !== 'string') return false
  if (!('dependencies' in value) || !Array.isArray(value.dependencies)) {
    return false
  }
  return value.dependencies.every(
    (dep) =>
      typeof dep === 'object' &&
      dep !== null &&
      'filePath' in dep &&
      typeof dep.filePath === 'string' &&
      'contentHash' in dep &&
      typeof dep.contentHash === 'string'
  )
}

function isDiskPayload(value: unknown): value is DiskPayload {
  if (typeof value !== 'object' || value === null) return false
  if (!('contentHash' in value) || typeof value.contentHash !== 'string') {
    return false
  }
  if (!('code' in value) || typeof value.code !== 'string') return false
  if (
    !('scan' in value) ||
    typeof value.scan !== 'object' ||
    value.scan === null
  ) {
    return false
  }
  if (!('atoms' in value) || !Array.isArray(value.atoms)) return false
  if (!('skips' in value) || !Array.isArray(value.skips)) return false
  if (!('raw' in value) || value.raw === undefined) return true
  return isRawStamp(value.raw)
}

function joinedHashes(scan: ScanFileResult): string {
  return scan.rules.flatMap((rule) => rule.atomHashes).join('\n')
}
