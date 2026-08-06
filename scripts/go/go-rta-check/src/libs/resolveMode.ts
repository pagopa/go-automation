/** Run modes of the script; `analyses` is the default and the historical behaviour. */
const RTA_CHECK_MODES = ['analyses', 'coverage'] as const;

export type RtaCheckMode = (typeof RTA_CHECK_MODES)[number];

/**
 * Normalizes the `mode` parameter.
 *
 * @param value - Raw configuration value
 * @returns The validated mode
 * @throws Error when the value is not a known mode
 *
 * @example
 * ```typescript
 * resolveMode(undefined); // 'analyses'
 * resolveMode('coverage'); // 'coverage'
 * ```
 */
export function resolveMode(value: string | undefined): RtaCheckMode {
  const normalized = (value ?? 'analyses').trim().toLowerCase();
  const mode = RTA_CHECK_MODES.find((candidate) => candidate === normalized);
  if (mode === undefined) {
    throw new Error(`mode non valido: ${value}. Valori ammessi: ${RTA_CHECK_MODES.join(', ')}.`);
  }
  return mode;
}
