import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ATOMIC_REGISTRY_ID,
  RESOLVED_ATOMIC_REGISTRY_ID,
  atomicCssModules,
} from '../src/vite-plugin.js'

const temps: string[] = []

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function setupProject(source: string): Promise<{
  dir: string
  cssPath: string
  plugin: ReturnType<typeof atomicCssModules>
}> {
  const dir = await mkdtemp(path.join(tmpdir(), 'atomic-plugin-'))
  temps.push(dir)
  const cssPath = path.join(dir, 'button.module.css')
  await writeFile(cssPath, source, 'utf8')

  const plugin = atomicCssModules({
    include: ['**/*.module.css'],
  })

  const configResolved = plugin.configResolved
  if (typeof configResolved !== 'function') {
    throw new Error('expected configResolved function')
  }
  configResolved({ root: dir })

  const buildStart = plugin.buildStart
  if (typeof buildStart !== 'function') {
    throw new Error('expected buildStart function')
  }
  await buildStart.call({
    meta: { watchMode: true },
    info() {},
  })

  return { dir, cssPath, plugin }
}

async function loadRegistry(
  plugin: ReturnType<typeof atomicCssModules>
): Promise<string> {
  const load = plugin.load
  if (typeof load !== 'function') {
    throw new Error('expected load function')
  }
  const result = await load.call({}, RESOLVED_ATOMIC_REGISTRY_ID)
  if (typeof result !== 'string') {
    throw new Error('expected registry CSS string')
  }
  return result
}

function emptyGraph() {
  return {
    environment: { moduleGraph: { getModuleById: () => undefined } },
    server: {
      moduleGraph: {
        getModuleById: () => undefined,
        invalidateModule: () => {},
      },
    },
  }
}

describe('vite plugin atomization report', () => {
  it('logs a report summary at buildStart', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'atomic-plugin-'))
    temps.push(dir)
    await writeFile(path.join(dir, 'kept.module.css'), '.a { color: red; }\n')
    await writeFile(
      path.join(dir, 'skip.module.css'),
      '.a .b { display: block; }\n'
    )

    const plugin = atomicCssModules({ include: ['**/*.module.css'] })
    const configResolved = plugin.configResolved
    if (typeof configResolved !== 'function') {
      throw new Error('expected configResolved function')
    }
    configResolved({ root: dir })

    const buildStart = plugin.buildStart
    if (typeof buildStart !== 'function') {
      throw new Error('expected buildStart function')
    }

    const messages: string[] = []
    await buildStart.call({
      meta: { watchMode: true },
      info(message: string) {
        messages.push(message)
      },
    })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/^atomic-css-modules: 1 atom, 1 skipped rule/)
  })
})

describe('vite plugin virtual registry', () => {
  it('resolves and loads the registry as a virtual module', async () => {
    const { dir, plugin } = await setupProject('.button { color: red; }\n')

    const resolveId = plugin.resolveId
    if (typeof resolveId !== 'function') {
      throw new Error('expected resolveId function')
    }
    expect(resolveId.call({}, ATOMIC_REGISTRY_ID, undefined)).toBe(
      RESOLVED_ATOMIC_REGISTRY_ID
    )
    expect(resolveId.call({}, `${ATOMIC_REGISTRY_ID}?raw`, undefined)).toBe(
      `\0${ATOMIC_REGISTRY_ID}?raw`
    )

    const css = await loadRegistry(plugin)
    expect(css).toMatch(/color:\s*(red|#f00)/)
    expect(await readFileExists(path.join(dir, 'atomic-registry.css'))).toBe(
      false
    )
  })

  it('rewrites modules to composes from global and does not import a registry file', async () => {
    const { cssPath, plugin } = await setupProject('.button { color: red; }\n')
    const transform = plugin.transform
    if (typeof transform !== 'function') {
      throw new Error('expected transform function')
    }

    const result = transform.call({}, '.button { color: red; }\n', cssPath)
    if (!result || typeof result === 'string') {
      throw new Error('expected transform result')
    }
    expect(result.code).toMatch(/composes:\s*[a-z][a-z0-9]+ from global;/)
    expect(result.code).not.toContain('atomic-registry.css')
    expect(result.map).toBeTruthy()
  })

  it('defaults to readable atom names in serve, and honors debugNames: false', async () => {
    const css = '.button { color: red; }\n'
    const filePath = '/app/button.module.css'

    const servePlugin = atomicCssModules({ include: ['**/*.module.css'] })
    const serveConfig = servePlugin.configResolved
    if (typeof serveConfig !== 'function') {
      throw new Error('expected configResolved function')
    }
    serveConfig({ root: '/app', command: 'serve' })
    const serveTransform = servePlugin.transform
    if (typeof serveTransform !== 'function') {
      throw new Error('expected transform function')
    }
    const serveResult = serveTransform.call({}, css, filePath)
    if (!serveResult || typeof serveResult === 'string') {
      throw new Error('expected transform result')
    }
    expect(serveResult.code).toMatch(
      /composes:\s*color-red-[a-z0-9]+ from global;/
    )

    const hashedPlugin = atomicCssModules({
      include: ['**/*.module.css'],
      debugNames: false,
    })
    const hashedConfig = hashedPlugin.configResolved
    if (typeof hashedConfig !== 'function') {
      throw new Error('expected configResolved function')
    }
    hashedConfig({ root: '/app', command: 'serve' })
    const hashedTransform = hashedPlugin.transform
    if (typeof hashedTransform !== 'function') {
      throw new Error('expected transform function')
    }
    const hashedResult = hashedTransform.call({}, css, filePath)
    if (!hashedResult || typeof hashedResult === 'string') {
      throw new Error('expected transform result')
    }
    expect(hashedResult.code).toMatch(/composes:\s*[a-z][a-z0-9]+ from global;/)
    expect(hashedResult.code).not.toMatch(
      /composes:\s*color-red-[a-z0-9]+ from global;/
    )
  })

  it('injects the virtual registry import into JS files that load CSS modules', () => {
    const plugin = atomicCssModules()
    const transform = plugin.transform
    if (typeof transform !== 'function') {
      throw new Error('expected transform function')
    }

    const result = transform.call(
      {},
      'import styles from "./App.module.css"\n',
      '/app/src/App.tsx'
    )
    if (!result || typeof result === 'string') {
      throw new Error('expected transform result')
    }
    expect(result.code).toContain(`import "${ATOMIC_REGISTRY_ID}"`)
    expect(result.code).toContain('import styles from "./App.module.css"')
  })

  it('injects the registry for a dynamic import that still has a .module.css literal', () => {
    const plugin = atomicCssModules()
    const transform = plugin.transform
    if (typeof transform !== 'function') {
      throw new Error('expected transform function')
    }

    const result = transform.call(
      {},
      'const styles = await import("./App.module.css")\n',
      '/app/src/App.tsx'
    )
    if (!result || typeof result === 'string') {
      throw new Error('expected transform result')
    }
    expect(result.code).toContain(`import "${ATOMIC_REGISTRY_ID}"`)
  })

  it('runs preprocess before scan and rewrite', () => {
    const plugin = atomicCssModules({
      include: ['**/*.module.css'],
      preprocess: (code) => code.replace('TOKEN_RED', 'red'),
    })
    const configResolved = plugin.configResolved
    if (typeof configResolved !== 'function') {
      throw new Error('expected configResolved function')
    }
    configResolved({ root: '/app', command: 'serve' })

    const transform = plugin.transform
    if (typeof transform !== 'function') {
      throw new Error('expected transform function')
    }
    const result = transform.call(
      {},
      '.button { color: TOKEN_RED; }\n',
      '/app/button.module.css'
    )
    if (!result || typeof result === 'string') {
      throw new Error('expected transform result')
    }
    expect(result.code).toMatch(/composes:\s*color-red-[a-z0-9]+ from global;/)
    expect(result.code).not.toContain('TOKEN_RED')
  })
})

async function readFileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, 'utf8')
    return true
  } catch {
    return false
  }
}

describe('vite plugin css modules config', () => {
  it('leaves virtual registry class names unhashed', () => {
    const plugin = atomicCssModules()
    const config = plugin.config
    if (typeof config !== 'function') {
      throw new Error('expected config function')
    }

    const result = config(
      {},
      { command: 'serve', mode: 'development', isPreview: false }
    )
    if (!result || typeof result !== 'object' || !('css' in result)) {
      throw new Error('expected css config')
    }

    const modules = result.css?.modules
    if (!modules || modules === false) {
      throw new Error('expected css.modules')
    }

    const generate = modules.generateScopedName
    if (typeof generate !== 'function') {
      throw new Error('expected generateScopedName function')
    }

    expect(generate('nsd5j6', `\0${ATOMIC_REGISTRY_ID}`, '.nsd5j6{}')).toBe(
      'nsd5j6'
    )
    expect(generate('nsd5j6', `${ATOMIC_REGISTRY_ID}?used`, '.nsd5j6{}')).toBe(
      'nsd5j6'
    )
    expect(generate('card', '/app/card.module.css', '.card{}')).not.toBe('card')
  })

  it('respects a user generateScopedName string pattern for non-registry files', () => {
    const plugin = atomicCssModules()
    const config = plugin.config
    if (typeof config !== 'function') {
      throw new Error('expected config function')
    }

    const result = config(
      { css: { modules: { generateScopedName: '[local]__app' } } },
      { command: 'serve', mode: 'development', isPreview: false }
    )
    if (!result || typeof result !== 'object' || !('css' in result)) {
      throw new Error('expected css config')
    }
    const modules = result.css?.modules
    if (!modules || modules === false) {
      throw new Error('expected css.modules')
    }
    const generate = modules.generateScopedName
    if (typeof generate !== 'function') {
      throw new Error('expected generateScopedName function')
    }

    expect(generate('card', '/app/card.module.css', '.card{}')).toBe(
      'card__app'
    )
    expect(generate('nsd5j6', `\0${ATOMIC_REGISTRY_ID}`, '.nsd5j6{}')).toBe(
      'nsd5j6'
    )
  })
})

describe('vite plugin registry HMR', () => {
  it('rebuilds the virtual registry when a matching CSS module is updated', async () => {
    const { cssPath, plugin } = await setupProject(
      '.button { font-size: 14px; }\n'
    )

    expect(await loadRegistry(plugin)).toMatch(/font-size:\s*14px/)

    await writeFile(cssPath, '.button { font-size: 8px; }\n', 'utf8')

    const hotUpdate = plugin.hotUpdate
    if (typeof hotUpdate !== 'function') {
      throw new Error('expected a hot update hook')
    }

    await hotUpdate.call(emptyGraph(), {
      type: 'update',
      file: cssPath,
      timestamp: Date.now(),
      modules: [],
      read: () => readFile(cssPath, 'utf8'),
      server: emptyGraph().server,
    })

    const after = await loadRegistry(plugin)
    expect(after).toMatch(/font-size:\s*8px/)
    expect(after).not.toMatch(/font-size:\s*14px/)
  })

  it('adds atoms from a newly created CSS module', async () => {
    const { dir, plugin } = await setupProject('.button { color: red; }\n')
    expect(await loadRegistry(plugin)).not.toMatch(/font-size:\s*20px/)

    const created = path.join(dir, 'card.module.css')
    await writeFile(created, '.card { font-size: 20px; }\n', 'utf8')

    const hotUpdate = plugin.hotUpdate
    if (typeof hotUpdate !== 'function') {
      throw new Error('expected a hot update hook')
    }
    await hotUpdate.call(emptyGraph(), {
      type: 'create',
      file: created,
      timestamp: Date.now(),
      modules: [],
      read: () => readFile(created, 'utf8'),
      server: emptyGraph().server,
    })

    expect(await loadRegistry(plugin)).toMatch(/font-size:\s*20px/)
  })

  it('drops atoms when a CSS module is deleted', async () => {
    const { dir, plugin } = await setupProject('.button { color: red; }\n')
    const extra = path.join(dir, 'extra.module.css')
    await writeFile(extra, '.extra { font-size: 20px; }\n', 'utf8')

    const hotUpdate = plugin.hotUpdate
    if (typeof hotUpdate !== 'function') {
      throw new Error('expected a hot update hook')
    }
    const graph = emptyGraph()
    await hotUpdate.call(graph, {
      type: 'create',
      file: extra,
      timestamp: Date.now(),
      modules: [],
      read: () => readFile(extra, 'utf8'),
      server: graph.server,
    })
    expect(await loadRegistry(plugin)).toMatch(/font-size:\s*20px/)

    await rm(extra)

    await hotUpdate.call(graph, {
      type: 'delete',
      file: extra,
      timestamp: Date.now(),
      modules: [],
      read: async () => '',
      server: graph.server,
    })

    const after = await loadRegistry(plugin)
    expect(after).not.toMatch(/font-size:\s*20px/)
    expect(after).toMatch(/color:\s*(red|#f00)/)
  })
})
