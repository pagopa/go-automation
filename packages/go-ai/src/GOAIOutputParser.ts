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
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
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
