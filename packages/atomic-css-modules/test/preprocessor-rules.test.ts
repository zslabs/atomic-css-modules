import { describe, expect, it } from 'vitest'
import {
  AtomicCssModulesWebpackPlugin,
  type CompilerLike,
} from '../src/webpack-plugin.js'

function apply(rules: unknown[]): void {
  const compiler: CompilerLike = {
    context: '/tmp/atomic-css-modules',
    options: { mode: 'production', entry: {}, module: { rules } },
    hooks: {
      beforeRun: { tapPromise() {} },
      watchRun: { tapPromise() {} },
      finishMake: { tapPromise() {} },
    },
    getInfrastructureLogger() {
      return { info() {} }
    },
  }
  new AtomicCssModulesWebpackPlugin().apply(compiler)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

describe('preprocessor loader splicing', () => {
  it('keeps extra fields on the preprocessor loader', () => {
    const rules: unknown[] = [
      {
        test: /\.less$/,
        use: [
          'css-loader',
          {
            loader: 'less-loader',
            parallel: true,
            ident: 'less',
            options: { lessOptions: { javascriptEnabled: true } },
          },
        ],
      },
    ]
    apply(rules)
    const rule = rules[0]
    if (!isRecord(rule) || !Array.isArray(rule.use)) {
      throw new Error('expected a use array')
    }
    const lessIndex = rule.use.findIndex(
      (entry) => isRecord(entry) && entry.loader === 'less-loader'
    )
    const less = rule.use[lessIndex]
    const rewrite = rule.use[lessIndex - 1]
    expect(less).toMatchObject({
      loader: 'less-loader',
      parallel: true,
      ident: 'less',
      options: { lessOptions: { javascriptEnabled: true } },
    })
    if (!isRecord(rewrite) || typeof rewrite.loader !== 'string') {
      throw new Error('expected the rewrite loader before less-loader')
    }
    expect(rewrite.loader.endsWith('rewrite-loader.js')).toBe(true)
    if (!isRecord(rewrite.options)) throw new Error('expected loader options')
    expect(rewrite.options.compiled).toBe(true)
  })
})
