import { parentPort, workerData } from 'node:worker_threads'
import { scanFiles, type ScanOptions } from './scan.js'
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

const port = parentPort
if (!port) throw new Error('atomic-css-modules scan worker has no parent port')
if (!isScanOptions(workerData)) {
  throw new Error('atomic-css-modules scan worker received invalid options')
}
const options = workerData

port.on('message', (message: unknown) => {
  if (!isSourceFile(message)) return
  try {
    const scanned = scanFiles([message], options)
    const scan = scanned.files[0]
    if (!scan)
      throw new Error(`scan produced no result for ${message.filePath}`)
    const reply: ScanWorkerSuccess = {
      ok: true,
      filePath: message.filePath,
      scan,
      atoms: [...scanned.atoms],
      skips: scanned.skips,
    }
    port.postMessage(reply)
  } catch (error) {
    const reply: ScanWorkerFailure = {
      ok: false,
      filePath: message.filePath,
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    }
    port.postMessage(reply)
  }
})

function isSourceFile(value: unknown): value is SourceFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'filePath' in value &&
    typeof value.filePath === 'string' &&
    'code' in value &&
    typeof value.code === 'string'
  )
}

function isScanOptions(value: unknown): value is ScanOptions {
  return typeof value === 'object' && value !== null
}
