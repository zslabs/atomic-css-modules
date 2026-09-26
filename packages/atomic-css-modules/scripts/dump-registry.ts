// Print the atomic registry CSS for one or more CSS Modules globs.
//
// Usage (from repo root):
//   npm run registry -- 'web/src/styles/**'/*.module.css
//   npm run registry -- --debug-names 'web/src/styles/**'/*.module.css
//
// Flags:
//   --debug-names   Readable atom class names (default: hash names)
//   --verbose       Include skip details in the summary line on stderr
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { formatAtomizationReport, processCssModules } from '../dist/index.js'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const debugNames = args.includes('--debug-names')
const verbose = args.includes('--verbose')
const patterns = args.filter((arg) => !arg.startsWith('--'))

// npm sets INIT_CWD to the directory where the user invoked the command.
const cwd = process.env.INIT_CWD ?? process.cwd()
const globs = patterns.length > 0 ? patterns : ['**/*.module.css']

const filePaths = new Set<string>()

for (const pattern of globs) {
  const matches = fs.glob(pattern, { cwd })
  for await (const match of matches) {
    filePaths.add(path.resolve(cwd, match))
  }
}

const sorted = [...filePaths].sort()
if (sorted.length === 0) {
  console.error(`no files matched: ${globs.join(', ')}`)
  console.error("example: npm run registry -- 'web/src/styles/**/*.module.css'")
  process.exit(1)
}

const files = await Promise.all(
  sorted.map(async (filePath) => ({
    filePath,
    code: await fs.readFile(filePath, 'utf8'),
  }))
)

const result = processCssModules(files, {
  registryImportPath: 'virtual:atomic-registry.css',
  composeFrom: 'global',
  debugNames,
})

console.error(formatAtomizationReport(result.report, { verbose, root: cwd }))
console.error(
  `files: ${sorted.map((filePath) => path.relative(cwd, filePath)).join(', ')}`
)

if (result.registryCss.trim() === '') {
  console.log('/* (registry empty) */')
} else {
  process.stdout.write(result.registryCss)
  if (!result.registryCss.endsWith('\n')) process.stdout.write('\n')
}
