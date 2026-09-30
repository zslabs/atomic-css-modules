type Suggestion = {
  path: string
  cost: number
  kind: 'numeric' | 'typo'
}

function readNumber(value: string): number | undefined {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length)
  let index = 0
  while (index < limit && left[index] === right[index]) index += 1
  return index
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0
  if (left.length === 0) return right.length
  if (right.length === 0) return left.length

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 0; row < left.length; row += 1) {
    let diagonal = previous[0] ?? 0
    previous[0] = row + 1
    const leftChar = left[row]
    for (let column = 0; column < right.length; column += 1) {
      const above = previous[column + 1] ?? 0
      const beside = previous[column] ?? 0
      const cost = leftChar === right[column] ? 0 : 1
      diagonal = Math.min(above + 1, beside + 1, diagonal + cost)
      const swap = above
      previous[column + 1] = diagonal
      diagonal = swap
    }
  }
  return previous[right.length] ?? left.length
}

function isCloseTypo(left: string, right: string, distance: number): boolean {
  if (left === right || distance === 0) return false
  if (distance <= 2) return true
  const shared = commonPrefixLength(left, right)
  const shorter = Math.min(left.length, right.length)
  return shared >= 3 && shorter - shared <= 1 && distance <= shorter
}

function tailCost(
  input: readonly string[],
  candidate: readonly string[]
): Pick<Suggestion, 'cost' | 'kind'> | undefined {
  if (input.length === 0 && candidate.length === 0) return undefined

  const inputTail = input.join('.')
  const candidateTail = candidate.join('.')
  const inputNumber = readNumber(inputTail)
  const candidateNumber = readNumber(candidateTail)
  if (inputNumber !== undefined && candidateNumber !== undefined) {
    const cost =
      Math.abs(inputNumber - candidateNumber) +
      Math.abs(input.length - candidate.length) * 0.25
    if (cost > 2) return undefined
    return { cost, kind: 'numeric' }
  }

  if (input.length !== candidate.length) return undefined
  const head = input[0] ?? ''
  const other = candidate[0] ?? ''
  const distance = levenshtein(head, other)
  if (!isCloseTypo(head, other, distance)) return undefined
  if (input.slice(1).join('.') !== candidate.slice(1).join('.'))
    return undefined
  return { cost: distance, kind: 'typo' }
}

function score(input: string, path: string): Suggestion | undefined {
  const inputParts = input.split('.')
  const pathParts = path.split('.')
  let index = 0
  while (
    index < inputParts.length &&
    index < pathParts.length &&
    inputParts[index] === pathParts[index]
  ) {
    index += 1
  }
  if (index === pathParts.length && index < inputParts.length) {
    const extra = inputParts.slice(index)
    const step = extra.length === 1 ? readNumber(extra[0] ?? '') : undefined
    if (step === undefined) return undefined
    return { path, cost: 0.5, kind: 'numeric' }
  }

  const cost = tailCost(inputParts.slice(index), pathParts.slice(index))
  if (cost === undefined) return undefined
  return { path, ...cost }
}

function prefer(input: string, next: Suggestion, current: Suggestion): boolean {
  if (next.cost !== current.cost) return next.cost < current.cost
  const nextIsPrefix = input.startsWith(`${next.path}.`)
  const currentIsPrefix = input.startsWith(`${current.path}.`)
  if (nextIsPrefix !== currentIsPrefix) return nextIsPrefix
  return next.path < current.path
}

/** Closest authoring path, when the miss is a typo or a nearby numeric step. */
export function suggestTokenPath(
  input: string,
  paths: readonly string[]
): string | undefined {
  let best: Suggestion | undefined
  let second: Suggestion | undefined

  for (const path of paths) {
    const ranked = score(input, path)
    if (ranked === undefined) continue
    if (best === undefined || prefer(input, ranked, best)) {
      second = best
      best = ranked
      continue
    }
    if (second === undefined || prefer(input, ranked, second)) second = ranked
  }

  if (best === undefined) return undefined
  if (second === undefined || best.cost < second.cost) return best.path
  if (input.startsWith(`${best.path}.`)) return best.path
  if (best.kind === 'numeric' && second.kind === 'numeric') return best.path
  return undefined
}
