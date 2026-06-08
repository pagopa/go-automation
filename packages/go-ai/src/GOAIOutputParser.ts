/**
 * Shared helpers for model outputs that should contain JSON.
 */

/**
 * Removes an optional Markdown code fence around a model response.
 *
 * @param raw - Raw model output
 * @returns The unwrapped response text
 */
export function stripGOAIOutputFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```') || !trimmed.endsWith('```') || trimmed.length < 6) {
    return trimmed;
  }

  let inner = trimmed.slice(3, -3);
  if (inner.slice(0, 4).toLowerCase() === 'json') {
    inner = inner.slice(4);
  }

  return inner.trim();
}

/**
 * Parses a model response expected to be JSON, accepting optional code fences.
 *
 * @param raw - Raw model output
 * @returns The parsed JSON value
 */
export function parseGOAIJsonOutput(raw: string): unknown {
  return JSON.parse(stripGOAIOutputFence(raw)) as unknown;
}
