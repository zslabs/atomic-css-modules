/**
 * Synthetic atomization bench. Each file has one shared declaration
 * (`color: red`), one unique declaration (`font-size: Npx`), and one
 * skipped combinator. Times are wall-clock on this machine.
 */
import { describe, it } from 'vitest'
import { FileScanCache } from '../src/file-scan-cache.js'
import { processCssModules } from '../src/process.js'
import type { SourceFile } from '../src/types.js'

const SIZES = [10, 100, 1000] as const
const RUNS = 3

function makeFiles(count: number): SourceFile[] {
  const files: SourceFile[] = []
  for (let index = 0; index < count; index++) {
    files.push({
      filePath: `f${index}.module.css`,
      code: `.a { color: red; font-size: ${index + 1}px; }\n.a .b { display: block; }\n`,
    })
  }
  return files
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted[mid]
  if (value === undefined) return 0
  return value
}

function timeMs(run: () => void): number {
  const start = performance.now()
  run()
  return performance.now() - start
}

function timeProcess(files: SourceFile[]): number {
  return timeMs(() => {
    processCssModules(files, { registryImportPath: './atomic-registry.css' })
  })
}

function timeCachePopulate(files: SourceFile[]): number {
  return timeMs(() => {
    const cache = new FileScanCache()
    for (const file of files) cache.update(file)
    cache.snapshot()
  })
}

function timeCacheUpdateOne(files: SourceFile[]): number {
  const cache = new FileScanCache()
  for (const file of files) cache.update(file)
  cache.snapshot()
  const first = files[0]
  if (!first) return 0
  return timeMs(() => {
    cache.update({
      filePath: first.filePath,
      code: `.a { color: red; font-size: 99px; }\n.a .b { display: block; }\n`,
    })
    cache.snapshot()
  })
}

function formatMs(value: number): string {
  if (value < 1) return `${value.toFixed(2)}ms`
  return `${Math.round(value)}ms`
}

function pad(value: string, width: number): string {
  return value.padEnd(width)
}

function main(): void {
  makeFiles(10)
  timeProcess(makeFiles(10))

  const rows: {
    files: number
    atoms: number
    skips: number
    process: number
    populate: number
    updateOne: number
  }[] = []

  for (const size of SIZES) {
    const files = makeFiles(size)
    const sample = processCssModules(files, {
      registryImportPath: './atomic-registry.css',
    })
    const processTimes = Array.from({ length: RUNS }, () => timeProcess(files))
    const populateTimes = Array.from({ length: RUNS }, () =>
      timeCachePopulate(files)
    )
    const updateTimes = Array.from({ length: RUNS }, () =>
      timeCacheUpdateOne(files)
    )
    rows.push({
      files: size,
      atoms: sample.report.atoms,
      skips: sample.report.skippedRules,
      process: median(processTimes),
      populate: median(populateTimes),
      updateOne: median(updateTimes),
    })
  }

  const headers = [
    'files',
    'atoms',
    'skips',
    'processCssModules',
    'cache populate',
    'cache update 1',
  ]
  const body = rows.map((row) => [
    String(row.files),
    String(row.atoms),
    String(row.skips),
    formatMs(row.process),
    formatMs(row.populate),
    formatMs(row.updateOne),
  ])
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((row) => (row[index] ?? '').length))
  )

  const line = (cells: string[]): string =>
    `| ${cells.map((cell, index) => pad(cell, widths[index] ?? 0)).join(' | ')} |`

  console.log(line(headers))
  console.log(`| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`)
  for (const row of body) console.log(line(row))
  console.log(
    '\nMedian of 3 runs. Each file: shared color, unique font-size, one skipped combinator.'
  )
}

describe('atomization bench', () => {
  it('prints timings for 10, 100, and 1000 files', () => {
    main()
  })
})
