import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { OverrideConflictError } from './override-conflicts.js'
import type { ScanOptions } from './scan.js'
import type {
  Atom,
  AtomizationSkip,
  ScanFileResult,
  SourceFile,
} from './types.js'

interface ScanWorkerSuccess {
  ok: true
  filePath: string
  scan: ScanFileResult
  atoms: [string, Atom][]
  skips: AtomizationSkip[]
}

interface ScanWorkerFailure {
  ok: false
  filePath: string
  name: string
  message: string
}

const MIN_FILES = 8

export async function scanFilesInPool(
  files: readonly SourceFile[],
  options: ScanOptions
): Promise<ScanWorkerSuccess[] | undefined> {
  if (files.length < MIN_FILES) return
  const workerPath = fileURLToPath(new URL('./scan-worker.js', import.meta.url))
  if (!existsSync(workerPath)) return

  const size = Math.min(availableParallelism(), 4, files.length)
  const workers = Array.from(
    { length: size },
    () => new Worker(workerPath, { workerData: options })
  )
  const pending = [...files]
  try {
    const results = await Promise.all(
      workers.map((worker) => drain(worker, pending))
    )
    return results.flat()
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()))
  }
}

function drain(
  worker: Worker,
  pending: SourceFile[]
): Promise<ScanWorkerSuccess[]> {
  const done: ScanWorkerSuccess[] = []
  return new Promise((resolve, reject) => {
    const fail = (error: Error): void => {
      reject(error)
    }
    worker.on('error', fail)
    worker.on('message', (message: unknown) => {
      if (!isWorkerReply(message)) {
        fail(new Error('atomic-css-modules scan worker sent an invalid reply'))
        return
      }
      if (!message.ok) {
        fail(errorFromFailure(message))
        return
      }
      done.push(message)
      const next = pending.shift()
      if (!next) {
        resolve(done)
        return
      }
      worker.postMessage(next)
    })
    const first = pending.shift()
    if (!first) {
      resolve(done)
      return
    }
    worker.postMessage(first)
  })
}

function errorFromFailure(failure: ScanWorkerFailure): Error {
  if (failure.name === 'OverrideConflictError') {
    return new OverrideConflictError(failure.message)
  }
  const error = new Error(failure.message)
  error.name = failure.name
  return error
}

function isWorkerReply(
  value: unknown
): value is ScanWorkerSuccess | ScanWorkerFailure {
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    return false
  }
  if (value.ok === true) {
    return (
      'filePath' in value &&
      'scan' in value &&
      'atoms' in value &&
      Array.isArray(value.atoms) &&
      'skips' in value &&
      Array.isArray(value.skips)
    )
  }
  return (
    value.ok === false &&
    'name' in value &&
    typeof value.name === 'string' &&
    'message' in value &&
    typeof value.message === 'string'
  )
}
