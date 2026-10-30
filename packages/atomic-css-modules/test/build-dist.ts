import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** webpack/Rspack load loaders by file path, so they need compiled `dist/`. */
export default function setup(): void {
  execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
  })
}
