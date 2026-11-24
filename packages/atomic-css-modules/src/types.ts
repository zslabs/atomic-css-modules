/**
 * Shared types for the atomic CSS Modules pipeline.
 */
import type {
  ContainerCondition,
  Declaration,
  MediaList,
  MediaQuery,
  Rule,
  Selector,
  SelectorComponent,
  SelectorList,
  SupportsCondition,
} from 'lightningcss'

/** One at-rule a declaration was nested in, outermost first. */
export type AtomWrapper =
  | { kind: 'media'; query: MediaList<MediaQuery> }
  | {
      kind: 'container'
      name: string | null
      condition: ContainerCondition<Declaration> | null
    }
  | { kind: 'supports'; condition: SupportsCondition }
  | { kind: 'layer'; name: string[] | null }
  | {
      kind: 'scope'
      scopeStart: SelectorList | null
      scopeEnd: SelectorList | null
    }
  | { kind: 'starting-style' }

/** At-rule wrappers around a declaration. Empty means the declaration is unconditioned. */
export type AtomCondition = AtomWrapper[]

export function isBareCondition(condition: AtomCondition): boolean {
  return condition.length === 0
}

/** A single simple pseudo-class/pseudo-element that an atom's selector carries, kept as the real parsed component so it can be reprinted verbatim. */
export type AtomPseudo = SelectorComponent & {
  type: 'pseudo-class' | 'pseudo-element'
}

/** Uniquely identifies one shareable atomic declaration group. */
export interface AtomKey {
  property: string
  /** JSON-stable fingerprint of the declaration's value, used for grouping/hashing. */
  valueFingerprint: string
  important: boolean
  pseudo: AtomPseudo | null
  condition: AtomCondition
}

/** A collected atom: one declaration, shared across every rule that produced it. */
export interface Atom {
  hash: string
  className: string
  key: AtomKey
  /** Cached {@link atomKeyString} for this key — avoid re-stringifying on lookup. */
  keyString: string
  declaration: Declaration
}

/** Registry of every atom collected while scanning a set of CSS module files. */
export interface AtomRegistry {
  /** Keyed by a stable string derived from AtomKey. */
  atoms: Map<string, Atom>
}

/** One CSS module source file to process. */
export interface SourceFile {
  filePath: string
  code: string
}

/** Result of rewriting a single source file. */
export interface RewrittenFile {
  filePath: string
  code: string
  /** True if anything in the file was changed. */
  changed: boolean
  /** JSON source map when {@link ProcessOptions.sourceMap} is enabled. */
  map?: string
  /** Set when rewrite failed and {@link ProcessOptions.strict} is off. */
  failure?: string
}

export const SKIP_REASONS = [
  'combinator',
  'compound',
  'element',
  'mixed-group',
  'functional-pseudo',
  'chained-pseudo',
  'shorthand-conflict',
  'skip-comment',
  'override-conflict',
  'local-reference',
  'unknown-at-rule',
] as const

export type SkipReason = (typeof SKIP_REASONS)[number]

/** One rule or declaration that was not atomized. */
export interface AtomizationSkip {
  filePath: string
  selector: string
  reason: SkipReason
}

/** A file left unchanged because scan or rewrite threw. */
export interface AtomizationFailure {
  filePath: string
  message: string
}

/** Counts from one scan + registry pass. */
export interface AtomizationReport {
  files: number
  atoms: number
  skippedRules: number
  bytesIn: number
  registryBytes: number
  skips: AtomizationSkip[]
  failures: AtomizationFailure[]
}

/** Result of the full scan + rewrite pipeline. */
export interface ProcessResult {
  files: RewrittenFile[]
  /** Generated CSS for the shared atomic registry. Empty string if no atoms were found. */
  registryCss: string
  report: AtomizationReport
}

export interface ProcessOptions {
  /**
   * The path (as it should appear in generated `composes: ... from "<path>"`
   * references) to the atomic registry file. Relative import specifiers are
   * used as-is. Ignored when {@link composeFrom} is `"global"`.
   */
  registryImportPath: string
  /**
   * `"file"` emits `composes: ... from "<registryImportPath>"`.
   * `"global"` emits `composes: ... from global` so the bundler does not
   * clone the registry into every CSS module.
   */
  composeFrom?: 'file' | 'global'
  /** When true, rewritten files include a JSON source map. */
  sourceMap?: boolean
  /** When true, atom class names use a readable slug plus a short key hash (`color-red-a1b2c3`) instead of production hashes. */
  debugNames?: boolean
  /**
   * What to do when two classes in one file set the same property (or an
   * overlapping shorthand) to different values. `"skip"` leaves those
   * declarations on the local classes. `"error"` throws. `"allow"` atomizes
   * them and lets registry order decide the winner.
   * Cross-file conflicts cannot be detected.
   */
  conflicts?: ConflictMode
  /** Extra names CSS Modules may rename. Keyframes and counter-styles are always local. */
  localIdents?: LocalIdentOptions
  /**
   * Custom at-rules with a body are passed through to lightningcss.
   * Statement at-rules are left unknown so the printer keeps their semicolons.
   */
  customAtRules?: AtomicCustomAtRules
  /** When true, a scan or rewrite exception fails the build instead of keeping the original file. */
  strict?: boolean
}

export type ConflictMode = 'skip' | 'error' | 'allow'

export interface LocalIdentOptions {
  /** Keep declarations that define or query a container name from this file. */
  container?: boolean
  /** Keep custom properties defined in this file, and declarations that reference them. */
  dashedIdents?: boolean
}

export interface AtomicCustomAtRule {
  prelude?: string | null
  body?: 'declaration-list' | 'rule-list' | 'style-block' | null
}

export interface AtomicCustomAtRules {
  [name: string]: AtomicCustomAtRule
}

/** Per-declaration decision recorded during scan for plan-driven rewrite. */
export type DeclDecision =
  | { action: 'composes' }
  | { action: 'keep'; important: boolean }
  | { action: 'hoist'; atomKey: string }

/** Per-rule bookkeeping produced while scanning one file. */
export interface ScanRuleInfo {
  eligible: boolean
  condition: AtomCondition
  pseudo: AtomPseudo | null
  /** True when this rule is nested inside another style rule. */
  nested: boolean
  /** The selector actually used to atomize (pseudo stripped, if any). Empty when ineligible. */
  selector: Selector
  /** Atom key strings (see {@link atomKeyString}) for this rule's hoisted decls, document order. */
  atomKeys: string[]
  /**
   * Class names for {@link atomKeys}, resolved from the atom map.
   * Kept in sync when names are remapped for global uniqueness.
   */
  atomHashes: string[]
  /**
   * Ordered decisions matching {@link flattenDeclarations} for this rule.
   * Empty when ineligible.
   */
  decisions: DeclDecision[]
}

export interface ScanFileResult {
  filePath: string
  rules: ScanRuleInfo[]
  /** `@custom-media`, `@property`, and `@layer` order rules this file depends on. */
  definitions: Rule[]
  /** Set when this file could not be scanned and should be left unchanged. */
  failure?: string
}

export interface ScanResult {
  atoms: Map<string, Atom>
  files: ScanFileResult[]
  skips: AtomizationSkip[]
}
