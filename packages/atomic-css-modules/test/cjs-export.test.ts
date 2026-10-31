import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('commonjs exports', () => {
  it('loads the webpack plugin from require()', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const script = `
      const plugin = require('@zslabs/atomic-css-modules/webpack')
      if (typeof plugin.AtomicCssModulesWebpackPlugin !== 'function') {
        throw new Error('missing AtomicCssModulesWebpackPlugin')
      }
      const created = new plugin.AtomicCssModulesWebpackPlugin()
      if (typeof created.cacheVersion !== 'string') {
        throw new Error('missing cacheVersion')
      }
    `
    expect(() =>
      execFileSync(process.execPath, ['--input-type=commonjs', '-e', script], {
        cwd: root,
      })
    ).not.toThrow()
  })
})
