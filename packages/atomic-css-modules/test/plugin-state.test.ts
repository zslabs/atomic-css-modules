import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAtomicPluginState } from '../src/plugin-state.js'

describe('preprocess cache', () => {
  it('skips preprocess when the raw file and its imports are unchanged', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'atomic-preprocess-'))
    const filePath = path.join(root, 'a.module.css')
    const depPath = path.join(root, 'tokens.css')
    writeFileSync(filePath, '.a { color: TOKEN; }\n.b { color: TOKEN; }\n')
    writeFileSync(depPath, 'red\n')
    let calls = 0
    const state = createAtomicPluginState({
      include: ['**/*.module.css'],
      preprocess(code) {
        calls += 1
        const value = readFileSync(depPath, 'utf8').trim()
        return {
          code: code.replaceAll('TOKEN', value),
          dependencies: ['tokens.css'],
        }
      },
    })
    state.configure({ root, debugNames: false, sourceMap: false })
    try {
      await state.syncFromDisk()
      await state.syncFromDisk()
      expect(calls).toBe(1)
      expect(state.registryCss).toMatch(/color:\s*(red|#f00)/)

      writeFileSync(depPath, 'blue\n')
      const changed = await state.applyWatchChanges(
        new Set([realpathSync(depPath)]),
        new Set()
      )
      expect(changed).toBe(true)
      expect(calls).toBe(2)
      expect(state.registryCss).toMatch(/color:\s*(blue|#00f)/)
      expect(state.registryCss).not.toMatch(/color:\s*(red|#f00)/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
