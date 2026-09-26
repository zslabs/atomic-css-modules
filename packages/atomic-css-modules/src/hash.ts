/**
 * Deterministic, dependency-free string hashing (FNV-1a) used to derive
 * short, stable atomic class names from declaration fingerprints.
 */

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  // Unsigned 32-bit hex, zero-padded.
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * FNV-1a encoded as base36, with a leading digit remapped to a letter
 * so the name is a valid CSS class without a reserved prefix.
 */
export function atomClassName(fingerprint: string): string {
  const encoded = Number.parseInt(fnv1a(fingerprint), 16).toString(36)
  const lead = encoded.charCodeAt(0)
  if (lead >= 48 && lead <= 57) {
    return String.fromCharCode(lead + 49) + encoded.slice(1)
  }
  return encoded
}

/**
 * Picks `desired` when free, otherwise appends `-2`, `-3`, … until unique.
 * Used so class-name collisions never silently share a registry rule.
 */
export function allocateUniqueClassName(
  taken: ReadonlySet<string>,
  desired: string
): string {
  if (!taken.has(desired)) return desired
  let suffix = 2
  while (taken.has(`${desired}-${suffix}`)) suffix += 1
  return `${desired}-${suffix}`
}
