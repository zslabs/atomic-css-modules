import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('commonjs exports', () => {
  it('loads the webpack plugin from require()', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const script = `
      const { existsSync } = require('node:fs')
      const path = require('node:path')
      const plugin = require('@zslabs/atomic-css-modules/webpack')
      if (typeof plugin.AtomicCssModulesWebpackPlugin !== 'function') {
        throw new Error('missing AtomicCssModulesWebpackPlugin')
      }
      const created = new plugin.AtomicCssModulesWebpackPlugin()
      const rules = []
      created.apply({
        context: process.cwd(),
        options: { mode: 'production', entry: {}, module: { rules } },
        hooks: {
          beforeRun: { tapPromise() {} },
          watchRun: { tapPromise() {} },
          finishMake: { tapPromise() {} },
        },
        getInfrastructureLogger() {
          return { info() {} }
        },
      })
      const loaders = []
      for (const rule of rules) {
        if (!rule || !Array.isArray(rule.use)) continue
        for (const entry of rule.use) {
          if (entry && typeof entry.loader === 'string') loaders.push(entry.loader)
        }
      }
      if (loaders.length < 3) {
        throw new Error('expected loader rules, got ' + loaders.join(', '))
      }
      const cjsDir = path.sep + path.join('dist', 'cjs') + path.sep
      for (const loader of loaders) {
        if (loader.includes(cjsDir)) {
          throw new Error('loader resolved inside dist/cjs: ' + loader)
        }
        if (!existsSync(loader)) throw new Error('missing loader ' + loader)
      }
    `
    expect(() =>
      execFileSync(process.execPath, ['--input-type=commonjs', '-e', script], {
        cwd: root,
      })
    ).not.toThrow()
  })
})
