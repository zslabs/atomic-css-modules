import { describe, expect, it } from 'vitest'
import { FileScanCache } from '../src/file-scan-cache.js'

describe('FileScanCache', () => {
  it('rescans only when file contents change', () => {
    const cache = new FileScanCache()
    const file = { filePath: 'a.module.css', code: '.a { color: red; }\n' }

    expect(cache.update(file)).toBe(true)
    expect(cache.update(file)).toBe(false)
    expect(cache.update({ ...file, code: '.a { color: blue; }\n' })).toBe(true)
  })

  it('merges identical declarations from separate files into one atom', () => {
    const cache = new FileScanCache()
    cache.update({ filePath: 'a.module.css', code: '.a { color: red; }\n' })
    cache.update({ filePath: 'b.module.css', code: '.b { color: red; }\n' })

    const snap = cache.snapshot()
    expect(snap.scan.atoms.size).toBe(1)
    expect(snap.report.files).toBe(2)
    expect(snap.registryCss).toMatch(/color:\s*(red|#f00)/)
  })

  it('drops atoms when a file is removed or no longer retained', () => {
    const cache = new FileScanCache()
    cache.update({ filePath: 'keep.module.css', code: '.a { color: red; }\n' })
    cache.update({
      filePath: 'drop.module.css',
      code: '.b { font-size: 20px; }\n',
    })

    cache.remove('drop.module.css')
    let snap = cache.snapshot()
    expect(snap.registryCss).toMatch(/color:\s*(red|#f00)/)
    expect(snap.registryCss).not.toMatch(/font-size:\s*20px/)
    expect(snap.report.files).toBe(1)

    cache.update({
      filePath: 'drop.module.css',
      code: '.b { font-size: 20px; }\n',
    })
    cache.retain(['keep.module.css'])
    snap = cache.snapshot()
    expect(snap.report.files).toBe(1)
    expect(snap.registryCss).not.toMatch(/font-size:\s*20px/)
  })

  it('keeps an unchanged file scan when a sibling is updated', () => {
    const cache = new FileScanCache()
    cache.update({ filePath: 'a.module.css', code: '.a { color: red; }\n' })
    cache.update({ filePath: 'b.module.css', code: '.b { color: blue; }\n' })
    const before = cache.getScan('a.module.css')
    expect(
      cache.update({ filePath: 'b.module.css', code: '.b { color: green; }\n' })
    ).toBe(true)
    expect(cache.getScan('a.module.css')).toBe(before)
  })

  it('emits identical registry CSS regardless of update order', () => {
    const forward = new FileScanCache()
    forward.update({
      filePath: 'z.module.css',
      code: '.z { margin-top: 4px; }\n',
    })
    forward.update({
      filePath: 'a.module.css',
      code: '.a { margin: 16px; }\n',
    })

    const reverse = new FileScanCache()
    reverse.update({
      filePath: 'a.module.css',
      code: '.a { margin: 16px; }\n',
    })
    reverse.update({
      filePath: 'z.module.css',
      code: '.z { margin-top: 4px; }\n',
    })

    expect(forward.snapshot().registryCss).toBe(reverse.snapshot().registryCss)
  })
})
