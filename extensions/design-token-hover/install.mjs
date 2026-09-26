#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const extDir = dirname(fileURLToPath(import.meta.url))

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: extDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npx', [
  '--yes',
  '@vscode/vsce',
  'package',
  '--allow-missing-repository',
  '--skip-license',
])

const vsix = readdirSync(extDir)
  .filter((name) => name.endsWith('.vsix'))
  .sort()
  .at(-1)

if (vsix === undefined) {
  console.error('No .vsix produced')
  process.exit(1)
}

const vsixPath = join(extDir, vsix)
const cli =
  spawnSync('cursor', ['--version'], { encoding: 'utf8' }).status === 0
    ? 'cursor'
    : spawnSync('code', ['--version'], { encoding: 'utf8' }).status === 0
      ? 'code'
      : undefined

if (cli === undefined) {
  console.log(`Packaged ${vsixPath}`)
  console.log('Install via Extensions → Install from VSIX…')
  process.exit(0)
}

run(cli, ['--install-extension', vsixPath, '--force'])
console.log(`Installed ${vsix} via ${cli}. Reload the window to activate.`)
