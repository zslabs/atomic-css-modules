import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { atomicCssModulesPostcss } from '../src/postcss-plugin.js'

const temps: string[] = []

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function project(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'atomic-postcss-'))
  temps.push(dir)
  return dir
}

function createPlugin(root: string, debugNames = true) {
  return atomicCssModulesPostcss({
    include: ['**/*.module.css'],
    root,
    debugNames,
    minOccurrences: 1,
  })
}

function composedNames(css: string): string[] {
  const match = /composes:\s*([^;]+?)\s+from global/.exec(css)
  if (!match?.[1]) throw new Error(`no composes found in: ${css}`)
  return match[1].split(/\s+/)
}

function dependencyFiles(
  messages: readonly { type: string; plugin?: string; file?: unknown }[]
): string[] {
  const files: string[] = []
  for (const message of messages) {
    if (message.type !== 'dependency') continue
    if (message.plugin !== 'atomic-css-modules') continue
    if (typeof message.file !== 'string') continue
    files.push(message.file)
  }
  return files
}

describe('atomicCssModulesPostcss', () => {
  it('rewrites a css module to composes from global', async () => {
    const dir = await project()
    const cssPath = path.join(dir, 'button.module.css')
    const source = '.button { color: red; }\n'
    await writeFile(cssPath, source)

    const result = await postcss([createPlugin(dir)]).process(source, {
      from: cssPath,
    })

    expect(result.css).toMatch(/composes:\s*color-red-[a-z0-9]+ from global;/)
    expect(result.css).not.toMatch(/color:/)
    expect(dependencyFiles(result.messages)).toEqual([])
  })

  it('replaces the registry directive, keeps surrounding rules, and lists module dependencies', async () => {
    const dir = await project()
    const buttonPath = path.join(dir, 'button.module.css')
    const titlePath = path.join(dir, 'title.module.css')
    const globalsPath = path.join(dir, 'globals.css')
    const button = '.button { color: red; }\n'
    const title = '.title { color: red; font-size: 20px; }\n'
    const globals = 'body {\n  margin: 0;\n}\n\n@atomic-css-modules;\n'
    await writeFile(buttonPath, button)
    await writeFile(titlePath, title)
    await writeFile(globalsPath, globals)

    const plugin = createPlugin(dir)
    const buttonResult = await postcss([plugin]).process(button, {
      from: buttonPath,
    })
    const titleResult = await postcss([plugin]).process(title, {
      from: titlePath,
    })
    const globalsResult = await postcss([plugin]).process(globals, {
      from: globalsPath,
    })

    const shared = composedNames(buttonResult.css)
    expect(shared).toHaveLength(1)
    expect(composedNames(titleResult.css)).toEqual(
      expect.arrayContaining(shared)
    )
    const atom = shared[0]
    if (!atom) throw new Error('expected a shared atom')
    expect(globalsResult.css).toContain('margin: 0')
    expect(globalsResult.css).not.toContain('@atomic-css-modules')
    expect(globalsResult.css).toContain(`.${atom}`)
    expect(globalsResult.css).toMatch(/color:\s*(red|#f00)/)
    expect(
      globalsResult.css.match(new RegExp(`\\.${atom}\\b`, 'g'))
    ).toHaveLength(1)
    expect(dependencyFiles(globalsResult.messages).sort()).toEqual(
      [buttonPath, titlePath].sort()
    )
    expect(
      globalsResult.messages.some(
        (message) =>
          message.type === 'dir-dependency' &&
          message.plugin === 'atomic-css-modules' &&
          message.dir === dir &&
          message.glob === '**/*.module.css' &&
          message.parent === globalsPath
      )
    ).toBe(true)
  })

  it('leaves css that is not a module and has no directive alone', async () => {
    const dir = await project()
    const cssPath = path.join(dir, 'plain.css')
    const source = 'body {\n  margin: 0;\n}\n'
    await writeFile(cssPath, source)

    const result = await postcss([createPlugin(dir)]).process(source, {
      from: cssPath,
    })

    expect(result.css).toContain('margin: 0')
    expect(result.css).not.toContain('composes')
    expect(result.css).not.toContain('@atomic-css-modules')
    expect(dependencyFiles(result.messages)).toEqual([])
  })

  it('does not atomize excluded files', async () => {
    const dir = await project()
    const vendorDir = path.join(dir, 'node_modules', 'pkg')
    await mkdir(vendorDir, { recursive: true })
    const vendorPath = path.join(vendorDir, 'widget.module.css')
    const source = '.widget { color: blue; }\n'
    await writeFile(vendorPath, source)
    const globalsPath = path.join(dir, 'globals.css')
    await writeFile(globalsPath, '@atomic-css-modules;\n')

    const plugin = createPlugin(dir)
    const vendorResult = await postcss([plugin]).process(source, {
      from: vendorPath,
    })
    const globalsResult = await postcss([plugin]).process(
      '@atomic-css-modules;\n',
      { from: globalsPath }
    )

    expect(vendorResult.css).toMatch(/color:\s*(blue|#00f)/)
    expect(vendorResult.css).not.toContain('composes')
    expect(globalsResult.css).not.toMatch(/color:\s*(blue|#00f)/)
    expect(dependencyFiles(globalsResult.messages)).toEqual([])
  })

  it('uses short hashes when debugNames is false', async () => {
    const dir = await project()
    const cssPath = path.join(dir, 'button.module.css')
    const source = '.button { color: red; }\n'
    await writeFile(cssPath, source)

    const result = await postcss([createPlugin(dir, false)]).process(source, {
      from: cssPath,
    })

    expect(result.css).toMatch(/composes:\s*[a-z][a-z0-9]+ from global;/)
    expect(result.css).not.toMatch(/color-red-/)
  })

  it('rebuilds the registry from disk when a module changes', async () => {
    const dir = await project()
    const cssPath = path.join(dir, 'button.module.css')
    const globalsPath = path.join(dir, 'globals.css')
    const globals = '@atomic-css-modules;\n'
    await writeFile(cssPath, '.button { color: red; }\n')
    await writeFile(globalsPath, globals)
    const plugin = createPlugin(dir)

    const first = await postcss([plugin]).process(globals, {
      from: globalsPath,
    })
    expect(first.css).toMatch(/color:\s*(red|#f00)/)

    await writeFile(cssPath, '.button { color: blue; }\n')
    const second = await postcss([plugin]).process(globals, {
      from: globalsPath,
    })

    expect(second.css).toMatch(/color:\s*(blue|#00f)/)
    expect(second.css).not.toMatch(/color:\s*(red|#f00)/)
  })

  it('logs the summary once per plugin instance', async () => {
    const dir = await project()
    const cssPath = path.join(dir, 'button.module.css')
    const source = '.button { color: red; }\n'
    await writeFile(cssPath, source)
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const plugin = createPlugin(dir)

    await postcss([plugin]).process(source, { from: cssPath })
    await postcss([plugin]).process(source, { from: cssPath })

    const summaries = info.mock.calls.filter((call) =>
      String(call[0]).includes('atomic-css-modules:')
    )
    info.mockRestore()
    expect(summaries).toHaveLength(1)
  })
})
