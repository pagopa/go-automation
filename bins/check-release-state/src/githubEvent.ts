/**
 * Reads a nested field of an untyped JSON value (the GitHub event payload).
 *
 * @param value - Parsed JSON
 * @param keys - Path of keys
 * @returns The value at the path, `undefined` when a step is missing
 */
export function eventField(value: unknown, ...keys: ReadonlyArray<string>): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current;
}

/**
 * Reads a string field of the event payload.
 *
 * @param value - Parsed JSON
 * @param keys - Path of keys
 * @returns The string
 * @throws Error when the field is missing or not a non-empty string
 */
export function eventString(value: unknown, ...keys: ReadonlyArray<string>): string {
  const field = eventField(value, ...keys);
  if (typeof field !== 'string' || field === '') throw new Error(`event field ${keys.join('.')} is missing`);
  return field;
}
