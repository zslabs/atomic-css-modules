import { build } from 'esbuild'

const external = ['lightningcss', 'mdn-data', 'postcss', 'vite']
const entries = [
  ['src/index.ts', 'dist/cjs/index.cjs'],
  ['src/vite-plugin.ts', 'dist/cjs/vite-plugin.cjs'],
  ['src/postcss-plugin.ts', 'dist/cjs/postcss-plugin.cjs'],
  ['src/webpack-plugin.ts', 'dist/cjs/webpack-plugin.cjs'],
]

await Promise.all(
  entries.map(([entryPoints, outfile]) =>
    build({
      entryPoints: [entryPoints],
      outfile,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      external,
      banner: {
        js: "const importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
      },
      define: {
        'import.meta.url': 'importMetaUrl',
      },
    })
  )
)
