// Publish workspace packages and create a matching GitHub release.
//
// Usage (from the repo root, after `npm login`):
//   npm run release
//
// Core version comes from packages/atomic-css-modules/package.json (drives the
// git tag / GitHub release). Also publishes @zslabs/stylelint-atomic-css-modules
// at whatever version is in its package.json.
// Re-running is safe: an existing npm version, git tag, or GitHub release is left in place.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = path.join(root, 'packages/atomic-css-modules/package.json')
const changelogPath = path.join(root, 'packages/atomic-css-modules/CHANGELOG.md')
const stylelintPkgPath = path.join(
  root,
  'packages/stylelint-atomic-css-modules/package.json'
)

interface PackageJson {
  name: string
  version: string
}

function run(command: string, args: readonly string[]): void {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' })
}

function capture(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function commandOk(command: string, args: readonly string[]): boolean {
  try {
    execFileSync(command, args, {
      cwd: root,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function readPackage(): PackageJson {
  return readPackageAt(pkgPath)
}

function readPackageAt(filePath: string): PackageJson {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('name' in parsed) ||
    !('version' in parsed) ||
    typeof parsed.name !== 'string' ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error(`Could not read name and version from ${filePath}`)
  }
  return { name: parsed.name, version: parsed.version }
}

function changelogNotes(version: string): string {
  const changelog = readFileSync(changelogPath, 'utf8')
  const heading = `## ${version}`
  const start = changelog.indexOf(heading)
  if (start === -1) {
    throw new Error(`CHANGELOG.md has no "${heading}" section`)
  }
  const rest = changelog.slice(start + heading.length).replace(/^\r?\n/, '')
  const next = rest.search(/^## /m)
  const notes = (next === -1 ? rest : rest.slice(0, next)).trim()
  if (notes.length === 0) {
    throw new Error(`CHANGELOG.md section "${heading}" is empty`)
  }
  return notes
}

function assertNpmAuth(): void {
  if (commandOk('npm', ['whoami'])) return
  console.error('npm is not logged in. Run `npm login`, then `npm run release`.')
  process.exit(1)
}

function assertCleanTree(): void {
  const status = capture('git', ['status', '--porcelain'])
  if (status.length === 0) return
  console.error('Working tree is dirty. Commit or stash before releasing.')
  process.exit(1)
}

function versionIsPublished(name: string, version: string): boolean {
  try {
    const published = capture('npm', ['view', `${name}@${version}`, 'version'])
    return published === version
  } catch {
    return false
  }
}

const pkg = readPackage()
const stylelintPkg = readPackageAt(stylelintPkgPath)
const tag = `v${pkg.version}`
const notes = changelogNotes(pkg.version)

assertNpmAuth()
assertCleanTree()

console.log(`Testing ${pkg.name}@${pkg.version}`)
run('npm', ['test', '-w', pkg.name])
console.log(`Testing ${stylelintPkg.name}@${stylelintPkg.version}`)
run('npm', ['test', '-w', stylelintPkg.name])

if (versionIsPublished(pkg.name, pkg.version)) {
  console.log(`${pkg.name}@${pkg.version} is already on npm`)
} else {
  console.log(`Publishing ${pkg.name}@${pkg.version}`)
  run('npm', ['publish', '-w', pkg.name, '--access', 'public'])
}

if (versionIsPublished(stylelintPkg.name, stylelintPkg.version)) {
  console.log(`${stylelintPkg.name}@${stylelintPkg.version} is already on npm`)
} else {
  console.log(`Publishing ${stylelintPkg.name}@${stylelintPkg.version}`)
  run('npm', ['publish', '-w', stylelintPkg.name, '--access', 'public'])
}

if (commandOk('git', ['rev-parse', tag])) {
  console.log(`Tag ${tag} already exists`)
} else {
  run('git', ['tag', '-a', tag, '-m', pkg.version])
}

const remoteTag = `refs/tags/${tag}`
if (commandOk('git', ['ls-remote', '--exit-code', 'origin', remoteTag])) {
  console.log(`Tag ${tag} is already on origin`)
} else {
  run('git', ['push', 'origin', tag])
}

if (commandOk('gh', ['release', 'view', tag])) {
  console.log(`GitHub release ${tag} already exists`)
} else {
  run('gh', [
    'release',
    'create',
    tag,
    '--title',
    pkg.version,
    '--notes',
    notes,
  ])
}

console.log(`Released ${pkg.name}@${pkg.version}`)
console.log(`Released ${stylelintPkg.name}@${stylelintPkg.version}`)
