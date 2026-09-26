import { describe, expect, it } from 'vitest'
import { ensureUniqueAtomNames, syncScanAtomHashes } from '../src/atoms.js'
import { FileScanCache } from '../src/file-scan-cache.js'
import { rewriteFiles } from '../src/rewrite.js'
import { scanFiles } from '../src/scan.js'
import type { Atom } from '../src/types.js'

const registryImportPath = './atomic-registry.css'

describe('ensureUniqueAtomNames', () => {
  it('renames later atoms when class names collide', () => {
    const atoms = new Map<string, Atom>([
      [
        'key-a',
        {
          hash: 'shared',
          className: 'shared',
          key: {
            property: 'color',
            valueFingerprint: 'a',
            important: false,
            pseudo: null,
            condition: [],
          },
          declaration: {
            property: 'color',
            value: { type: 'unparsed', value: [] },
          },
          keyString: 'key-a',
        },
      ],
      [
        'key-b',
        {
          hash: 'shared',
          className: 'shared',
          key: {
            property: 'color',
            valueFingerprint: 'b',
            important: false,
            pseudo: null,
            condition: [],
          },
          declaration: {
            property: 'color',
            value: { type: 'unparsed', value: [] },
          },
          keyString: 'key-b',
        },
      ],
    ])

    ensureUniqueAtomNames(atoms)

    const names = [...atoms.values()].map((atom) => atom.className)
    expect(new Set(names).size).toBe(2)
    expect(names[0]).toBe('shared')
    expect(names[1]).toBe('shared-2')
  })
})

describe('rewrite uses scan-allocated names', () => {
  it('emits the atom map class name even when it differs from a fresh hash', () => {
    const files = [
      { filePath: 'button.module.css', code: '.a { color: red; }\n' },
    ]
    const scanned = scanFiles(files)
    const atom = [...scanned.atoms.values()][0]
    if (!atom) throw new Error('expected an atom')
    const original = atom.hash
    atom.hash = 'forced-atom-name'
    atom.className = 'forced-atom-name'
    syncScanAtomHashes(scanned.files, scanned.atoms)

    const [rewritten] = rewriteFiles(
      files,
      scanned.files,
      { registryImportPath },
      scanned.atoms
    )
    if (!rewritten) throw new Error('expected rewrite')
    expect(rewritten.code).toMatch(/composes:\s*forced-atom-name\b/)
    expect(rewritten.code).not.toMatch(
      new RegExp(`composes:\\s*${original}\\b`)
    )
  })
})

describe('FileScanCache global uniqueness', () => {
  it('remaps colliding class names across separately scanned files on snapshot', () => {
    const cache = new FileScanCache()
    cache.update({
      filePath: 'a.module.css',
      code: '.a { color: red; }\n',
    })
    cache.update({
      filePath: 'b.module.css',
      code: '.b { color: blue; }\n',
    })

    // Force a cross-file class-name collision on the per-file atom maps.
    const cacheInternals = cache as unknown as {
      entries: Map<
        string,
        {
          atoms: Map<string, Atom>
          scan: { rules: { atomHashes: string[] }[] }
        }
      >
    }
    const entryAtoms = [...cacheInternals.entries.values()].map(
      (entry) => [...entry.atoms.values()][0]
    )
    const first = entryAtoms[0]
    const second = entryAtoms[1]
    if (!first || !second) throw new Error('expected two atoms')
    second.hash = first.hash
    second.className = first.className

    const snap = cache.snapshot()
    const names = [...snap.scan.atoms.values()].map((atom) => atom.className)
    expect(new Set(names).size).toBe(2)

    const [rewrittenA] = rewriteFiles(
      [{ filePath: 'a.module.css', code: '.a { color: red; }\n' }],
      [cache.getScan('a.module.css')!],
      { registryImportPath },
      cache.getAtoms()
    )
    const [rewrittenB] = rewriteFiles(
      [{ filePath: 'b.module.css', code: '.b { color: blue; }\n' }],
      [cache.getScan('b.module.css')!],
      { registryImportPath },
      cache.getAtoms()
    )
    if (!rewrittenA || !rewrittenB) throw new Error('expected rewrites')

    const nameA = /composes:\s*([^\s;]+)/.exec(rewrittenA.code)?.[1]
    const nameB = /composes:\s*([^\s;]+)/.exec(rewrittenB.code)?.[1]
    expect(nameA).toBeTruthy()
    expect(nameB).toBeTruthy()
    expect(nameA).not.toBe(nameB)
    expect(snap.registryCss).toMatch(new RegExp(`\\.${nameA}\\b`))
    expect(snap.registryCss).toMatch(new RegExp(`\\.${nameB}\\b`))
  })
})
