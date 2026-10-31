import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let cachedVersion: string | undefined

export function packageVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath(), 'utf8'))
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof parsed.version === 'string'
  ) {
    cachedVersion = parsed.version
    return cachedVersion
  }
  cachedVersion = '0.0.0'
  return cachedVersion
}

export function cacheVersion(policy: unknown): string {
  const hash = createHash('sha256')
    .update(packageVersion())
    .update('\0')
    .update(JSON.stringify(policy))
    .digest('hex')
    .slice(0, 16)
  return `${packageVersion()}:${hash}`
}

function packageJsonPath(): string {
  const candidates = [
    fileURLToPath(new URL('../package.json', import.meta.url)),
    fileURLToPath(new URL('../../package.json', import.meta.url)),
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (found) return found
  throw new Error('atomic-css-modules could not find package.json')
}
